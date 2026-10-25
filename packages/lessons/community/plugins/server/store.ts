/**
 * Plugin storage: plugins, versions, authors and reports in one SQLite file; packages as files
 * named by hash.
 *
 * A plugin id belongs to the account that first uploaded it. Each version is reviewed separately
 * and is `pending`, `approved`, `rejected` or `revoked`. The catalogue shows the newest approved
 * version; revoked versions are listed so installed copies disable themselves.
 */

import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { PluginEntry } from '../client/catalog.js';
import type { Permission, PluginManifest } from '../format/manifest.js';
import { SCHEMA } from './schema.js';

export type VersionStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

export interface Author {
  id: number;
  name: string;
  dailyLimit: number;
}

type Row = Record<string, string | number | null>;

const sha = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');

const toEntry = (r: Row): PluginEntry => ({
  id: String(r.plugin),
  name: String(r.name),
  description: String(r.description),
  author: String(r.author),
  version: String(r.version),
  permissions: JSON.parse(String(r.permissions)) as Permission[],
  network: JSON.parse(String(r.network)) as string[],
  size: Number(r.size),
  sha256: String(r.sha256),
  updatedAt: String(r.created_at),
});

const LATEST_APPROVED = `status = 'approved' AND seq = (
  SELECT MAX(seq) FROM versions AS newer WHERE newer.plugin = versions.plugin AND newer.status = 'approved')`;

export class PluginStore {
  private readonly db: DatabaseSync;
  private readonly packages: string;

  constructor(dataDir: string) {
    this.packages = join(dataDir, 'packages');
    mkdirSync(this.packages, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(dataDir, 'plugins.db'));
    this.db.exec(SCHEMA);
  }

  createAuthor(
    name: string,
    dailyLimit = 5,
    fixedToken?: string,
  ): { author: Author; token: string } {
    const token = fixedToken ?? randomBytes(32).toString('base64url');
    const result = this.db
      .prepare('INSERT INTO authors (name, token_hash, daily_limit, created_at) VALUES (?,?,?,?)')
      .run(name, sha(token), dailyLimit, new Date().toISOString());
    return { author: { id: Number(result.lastInsertRowid), name, dailyLimit }, token };
  }

  findAuthor(token: string): Author | null {
    const row = this.db
      .prepare('SELECT id, name, daily_limit FROM authors WHERE token_hash = ? AND revoked = 0')
      .get(sha(token)) as Row | undefined;
    return row
      ? { id: Number(row.id), name: String(row.name), dailyLimit: Number(row.daily_limit) }
      : null;
  }

  revokeAuthor(id: number): boolean {
    return this.db.prepare('UPDATE authors SET revoked = 1 WHERE id = ?').run(id).changes > 0;
  }

  /** Listed plugin counts per author (each plugin counted once). */
  listedAuthors(): { author: string; count: number }[] {
    return (
      this.db
        .prepare(
          "SELECT author, COUNT(DISTINCT plugin) AS n FROM versions WHERE status = 'approved' GROUP BY author",
        )
        .all() as Row[]
    ).map((r) => ({ author: String(r.author), count: Number(r.n) }));
  }

  authors(): Row[] {
    return this.db.prepare('SELECT id, name, daily_limit, revoked FROM authors').all() as Row[];
  }

  uploadsSince(author: number, since: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM versions WHERE author_id = ? AND created_at >= ?')
      .get(author, since) as Row | undefined;
    return Number(row?.n ?? 0);
  }

  /** The owner of `id`, or null if unclaimed. */
  owner(id: string): number | null {
    const row = this.db.prepare('SELECT owner FROM plugins WHERE id = ?').get(id) as
      | Row
      | undefined;
    return row ? Number(row.owner) : null;
  }

  /** All versions ever uploaded for `id`; a new upload must be newer than all of them. */
  versions(id: string): string[] {
    const rows = this.db.prepare('SELECT version FROM versions WHERE plugin = ?').all(id) as Row[];
    return rows.map((r) => String(r.version));
  }

  async insert(author: Author, manifest: PluginManifest, bytes: Uint8Array, findings: string[]) {
    const digest = sha(bytes);
    const final = this.path(digest);
    const partial = `${final}.${randomBytes(4).toString('hex')}.part`;
    await writeFile(partial, bytes, { mode: 0o600 });
    await rename(partial, final);
    const now = new Date().toISOString();
    this.db
      .prepare('INSERT OR IGNORE INTO plugins (id, owner, created_at) VALUES (?,?,?)')
      .run(manifest.id, author.id, now);
    const versionId = randomBytes(8).toString('hex');
    this.db
      .prepare(
        `INSERT INTO versions (version_id, plugin, version, name, description, permissions, network,
          sha256, size, author_id, author, status, findings, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending',?,?)`,
      )
      .run(
        versionId,
        manifest.id,
        manifest.pluginVersion,
        manifest.name,
        manifest.description,
        JSON.stringify(manifest.permissions),
        JSON.stringify(manifest.network ?? []),
        digest,
        bytes.byteLength,
        author.id,
        author.name,
        JSON.stringify(findings),
        now,
      );
    return versionId;
  }

  list(q: string, offline: boolean, before: number, limit: number) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM versions WHERE ${LATEST_APPROVED} AND seq < ?
           AND (name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR plugin LIKE ? ESCAPE '\\')
           AND (? = 0 OR permissions NOT LIKE '%"network"%')
         ORDER BY seq DESC LIMIT ?`,
      )
      .all(before, like, like, like, offline ? 1 : 0, limit + 1) as Row[];
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      plugins: page.map(toEntry),
      next: rows.length > limit && last ? String(last.seq) : undefined,
    };
  }

  detail(id: string): { plugin: PluginEntry | null; revoked: string[] } {
    const latest = this.db
      .prepare(`SELECT * FROM versions WHERE plugin = ? AND ${LATEST_APPROVED}`)
      .get(id) as Row | undefined;
    const revoked = this.db
      .prepare("SELECT version FROM versions WHERE plugin = ? AND status = 'revoked'")
      .all(id) as Row[];
    return {
      plugin: latest ? toEntry(latest) : null,
      revoked: revoked.map((r) => String(r.version)),
    };
  }

  approvedVersion(id: string, version: string): PluginEntry | null {
    const row = this.db
      .prepare("SELECT * FROM versions WHERE plugin = ? AND version = ? AND status = 'approved'")
      .get(id, version) as Row | undefined;
    return row ? toEntry(row) : null;
  }

  byStatus(status: VersionStatus): Row[] {
    return this.db
      .prepare('SELECT * FROM versions WHERE status = ? ORDER BY seq')
      .all(status) as Row[];
  }

  byAuthor(author: number): Row[] {
    return this.db
      .prepare(
        'SELECT plugin, version, status, note FROM versions WHERE author_id = ? ORDER BY seq DESC',
      )
      .all(author) as Row[];
  }

  version(versionId: string): Row | null {
    return (
      (this.db.prepare('SELECT * FROM versions WHERE version_id = ?').get(versionId) as
        | Row
        | undefined) ?? null
    );
  }

  /** Rejected and revoked packages are deleted from disk; revoked versions stay listed. */
  async setStatus(versionId: string, status: VersionStatus, note = ''): Promise<boolean> {
    const row = this.version(versionId);
    if (row === null) return false;
    this.db
      .prepare('UPDATE versions SET status = ?, note = ? WHERE version_id = ?')
      .run(status, note, versionId);
    if (status === 'approved')
      this.db.prepare('DELETE FROM reports WHERE plugin = ?').run(String(row.plugin));
    if (status === 'rejected' || status === 'revoked') {
      await rm(this.path(String(row.sha256)), { force: true });
    }
    return true;
  }

  /** At `threshold` distinct reporters, the newest version is hidden until reviewed. */
  async report(id: string, reporter: string, reason: string, threshold: number): Promise<void> {
    const latest = this.db
      .prepare(`SELECT version_id FROM versions WHERE plugin = ? AND ${LATEST_APPROVED}`)
      .get(id) as Row | undefined;
    if (latest === undefined) return;
    this.db
      .prepare(
        'INSERT OR IGNORE INTO reports (plugin, reporter, reason, created_at) VALUES (?,?,?,?)',
      )
      .run(id, sha(reporter), reason.slice(0, 500), new Date().toISOString());
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM reports WHERE plugin = ?').get(id) as
      | Row
      | undefined;
    if (Number(row?.n ?? 0) >= threshold)
      await this.setStatus(String(latest.version_id), 'pending', 'reported');
  }

  reports(id: string): Row[] {
    return this.db
      .prepare('SELECT reason, created_at FROM reports WHERE plugin = ?')
      .all(id) as Row[];
  }

  path(sha256: string): string {
    return join(this.packages, `${sha256}.bezierplugin`);
  }

  readPackage(sha256: string): Promise<Uint8Array> {
    return readFile(this.path(sha256));
  }

  close(): void {
    this.db.close();
  }
}
