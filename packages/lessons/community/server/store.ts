/**
 * Lessons server storage: lessons, accounts and reports in one SQLite file; packages as files
 * named by hash.
 *
 * Lessons are `pending` until a moderator approves them; only `approved` lessons are listed or
 * served. Rejected and removed packages are deleted from disk.
 */

import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { LessonLevel, LessonManifest } from '../../src/format/manifest.js';
import type { CatalogEntry } from '../client/catalog.js';

export type Status = 'pending' | 'approved' | 'rejected' | 'removed';

export interface Account {
  id: number;
  name: string;
  dailyLimit: number;
}

export interface LessonRow extends CatalogEntry {
  status: Status;
  note: string;
}

const sha = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');

type Row = Record<string, string | number | null>;

const toRow = (r: Row): LessonRow => ({
  id: String(r.id),
  title: String(r.title),
  description: String(r.description),
  ...(r.level === null ? {} : { level: r.level as LessonLevel }),
  duration: Number(r.duration),
  chapters: Number(r.chapters),
  size: Number(r.size),
  sha256: String(r.sha256),
  createdAt: String(r.created_at),
  author: String(r.author),
  status: r.status as Status,
  note: String(r.note),
});

const toEntry = (r: Row): CatalogEntry => {
  const { status: _status, note: _note, ...entry } = toRow(r);
  return entry;
};

export class Store {
  private readonly db: DatabaseSync;
  private readonly packages: string;

  constructor(dataDir: string) {
    this.packages = join(dataDir, 'packages');
    mkdirSync(this.packages, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(dataDir, 'lessons.db'));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
        daily_limit INTEGER NOT NULL DEFAULT 5, revoked INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS lessons (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL, content_hash TEXT NOT NULL,
        size INTEGER NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, level TEXT,
        duration REAL NOT NULL, chapters INTEGER NOT NULL, account INTEGER NOT NULL,
        author TEXT NOT NULL, status TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS lessons_status ON lessons (status, seq);
      CREATE INDEX IF NOT EXISTS lessons_hash ON lessons (sha256);
      CREATE INDEX IF NOT EXISTS lessons_content ON lessons (content_hash);
      CREATE TABLE IF NOT EXISTS reports (
        lesson TEXT NOT NULL, reporter TEXT NOT NULL, reason TEXT NOT NULL,
        created_at TEXT NOT NULL, PRIMARY KEY (lesson, reporter));
    `);
  }

  // ---- accounts (created by the operator) --------------------------------

  /** Returns the token once; only its hash is stored. */
  createAccount(
    name: string,
    dailyLimit = 5,
    /** For seeding a development server with a known token. */
    fixedToken?: string,
  ): { account: Account; token: string } {
    const token = fixedToken ?? randomBytes(32).toString('base64url');
    const result = this.db
      .prepare('INSERT INTO accounts (name, token_hash, daily_limit, created_at) VALUES (?,?,?,?)')
      .run(name, sha(token), dailyLimit, new Date().toISOString());
    return { account: { id: Number(result.lastInsertRowid), name, dailyLimit }, token };
  }

  findAccount(token: string): Account | null {
    const row = this.db
      .prepare('SELECT id, name, daily_limit FROM accounts WHERE token_hash = ? AND revoked = 0')
      .get(sha(token)) as Row | undefined;
    return row
      ? { id: Number(row.id), name: String(row.name), dailyLimit: Number(row.daily_limit) }
      : null;
  }

  revokeAccount(id: number): boolean {
    return this.db.prepare('UPDATE accounts SET revoked = 1 WHERE id = ?').run(id).changes > 0;
  }

  accounts(): Row[] {
    return this.db.prepare('SELECT id, name, daily_limit, revoked FROM accounts').all() as Row[];
  }

  uploadsSince(account: number, since: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM lessons WHERE account = ? AND created_at >= ?')
      .get(account, since) as Row | undefined;
    return Number(row?.n ?? 0);
  }

  // ---- lessons ----------------------------------------------------------

  /**
   * Whether this recording was ever uploaded, in any state. Rejected and removed lessons count, so
   * a refused video cannot return under a new title.
   */
  hasContent(contentHash: string): boolean {
    return (
      this.db.prepare('SELECT 1 FROM lessons WHERE content_hash = ?').get(contentHash) !== undefined
    );
  }

  async insert(
    account: Account,
    manifest: LessonManifest,
    bytes: Uint8Array,
    contentHash: string,
  ): Promise<LessonRow> {
    const digest = sha(bytes);
    // Write to a temporary name and rename, so a crash never leaves a partial package.
    const final = this.path(digest);
    const partial = `${final}.${randomBytes(4).toString('hex')}.part`;
    await writeFile(partial, bytes, { mode: 0o600 });
    await rename(partial, final);
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO lessons (id, sha256, content_hash, size, title, description, level, duration, chapters,
          account, author, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending',?)`,
      )
      .run(
        manifest.id,
        digest,
        contentHash,
        bytes.byteLength,
        manifest.title,
        manifest.description,
        manifest.level ?? null,
        manifest.duration,
        manifest.states.length,
        account.id,
        account.name,
        createdAt,
      );
    const row = this.get(manifest.id);
    if (row === null) throw new Error('lesson vanished after insert');
    return row;
  }

  get(id: string): LessonRow | null {
    const row = this.db.prepare('SELECT * FROM lessons WHERE id = ?').get(id) as Row | undefined;
    return row ? toRow(row) : null;
  }

  getApproved(id: string): CatalogEntry | null {
    const row = this.db
      .prepare("SELECT * FROM lessons WHERE id = ? AND status = 'approved'")
      .get(id) as Row | undefined;
    return row ? toEntry(row) : null;
  }

  /** Approved lessons, newest first. `before` is the `seq` of the last lesson already seen. */
  listApproved(q: string, level: string | undefined, before: number, limit: number) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM lessons WHERE status = 'approved' AND seq < ?
           AND (title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')
           AND (? IS NULL OR level = ?)
         ORDER BY seq DESC LIMIT ?`,
      )
      .all(before, like, like, level ?? null, level ?? null, limit + 1) as Row[];
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      lessons: page.map(toEntry),
      next: rows.length > limit && last ? String(last.seq) : undefined,
    };
  }

  byStatus(status: Status): LessonRow[] {
    return (
      this.db.prepare('SELECT * FROM lessons WHERE status = ? ORDER BY seq').all(status) as Row[]
    ).map(toRow);
  }

  byAccount(account: number): LessonRow[] {
    return (
      this.db
        .prepare('SELECT * FROM lessons WHERE account = ? ORDER BY seq DESC')
        .all(account) as Row[]
    ).map(toRow);
  }

  /** Rejecting or removing deletes the package unless another lesson uses it. */
  async setStatus(id: string, status: Status, note = ''): Promise<boolean> {
    const lesson = this.get(id);
    if (lesson === null) return false;
    this.db.prepare('UPDATE lessons SET status = ?, note = ? WHERE id = ?').run(status, note, id);
    // Re-approval clears existing reports.
    if (status === 'approved') this.db.prepare('DELETE FROM reports WHERE lesson = ?').run(id);
    if (status === 'rejected' || status === 'removed') {
      const shared = this.db
        .prepare("SELECT 1 FROM lessons WHERE sha256 = ? AND status IN ('pending','approved')")
        .get(lesson.sha256);
      if (shared === undefined) await rm(this.path(lesson.sha256), { force: true });
    }
    return true;
  }

  path(sha256: string): string {
    return join(this.packages, `${sha256}.bezierlesson`);
  }

  readPackage(sha256: string): Promise<Uint8Array> {
    return readFile(this.path(sha256));
  }

  // ---- reports ----------------------------------------------------------

  /**
   * Records one report per reporter and lesson. At `threshold` distinct reporters an approved
   * lesson returns to review, before the operator has seen the reports.
   */
  async report(id: string, reporter: string, reason: string, threshold: number): Promise<void> {
    const lesson = this.get(id);
    if (lesson === null || lesson.status !== 'approved') return;
    this.db
      .prepare(
        'INSERT OR IGNORE INTO reports (lesson, reporter, reason, created_at) VALUES (?,?,?,?)',
      )
      .run(id, sha(reporter), reason.slice(0, 500), new Date().toISOString());
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM reports WHERE lesson = ?').get(id) as
      | Row
      | undefined;
    if (Number(row?.n ?? 0) >= threshold) await this.setStatus(id, 'pending', 'reported');
  }

  reports(id: string): Row[] {
    return this.db
      .prepare('SELECT reason, created_at FROM reports WHERE lesson = ?')
      .all(id) as Row[];
  }

  /** Listed lesson counts per author, for the leaderboard. */
  authors(): { author: string; count: number }[] {
    return (
      this.db
        .prepare(
          "SELECT author, COUNT(*) AS n FROM lessons WHERE status = 'approved' GROUP BY author",
        )
        .all() as Row[]
    ).map((r) => ({ author: String(r.author), count: Number(r.n) }));
  }

  close(): void {
    this.db.close();
  }
}
