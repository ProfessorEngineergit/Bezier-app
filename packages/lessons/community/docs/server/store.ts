/**
 * Wiki storage: articles and accounts in one SQLite file, pictures in a folder named by hash.
 *
 * Any token holder can change an article and the change is live immediately. Each change is its
 * own row; the newest `approved` row is the live article and earlier ones are `superseded`. A
 * restore is recorded as a new change by the user who made it. Only reviewers can remove articles.
 */

import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Arrow, DocArea, DocArticle } from '../format/article.js';

export type Status = 'pending' | 'approved' | 'rejected' | 'superseded';
export type Role = 'author' | 'reviewer';

export interface Account {
  id: number;
  name: string;
  role: Role;
  dailyLimit: number;
}

/** A submitted picture, already validated. */
export interface SentImage {
  bytes: Uint8Array;
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  alt: string;
  arrows: readonly Arrow[];
}

/** A stored picture; its hash is the file name. */
interface StoredImage {
  hash: string;
  mime: SentImage['mime'];
  alt: string;
  arrows: readonly Arrow[];
}

type Row = Record<string, string | number | null>;

export interface Submission {
  seq: number;
  id: string;
  status: Status;
  note: string;
  author: string;
  title: string;
  area: DocArea;
  summary: string;
  keywords: string;
  body: string;
  images: Record<string, StoredImage>;
  createdAt: string;
}

const sha = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');

const toSubmission = (r: Row): Submission => ({
  seq: Number(r.seq),
  id: String(r.id),
  status: r.status as Status,
  note: String(r.note),
  author: String(r.author),
  title: String(r.title),
  area: String(r.area) as DocArea,
  summary: String(r.summary),
  keywords: String(r.keywords),
  body: String(r.body),
  images: JSON.parse(String(r.images)) as Record<string, StoredImage>,
  createdAt: String(r.created_at),
});

/** The public form of an article. Picture `src` values are server paths the client resolves. */
export function publicArticle(s: Submission): DocArticle {
  return {
    id: s.id,
    title: s.title,
    area: s.area,
    summary: s.summary,
    keywords: s.keywords,
    body: s.body,
    images: Object.fromEntries(
      Object.entries(s.images).map(([key, image]) => [
        key,
        { src: `/v1/images/${image.hash}`, alt: image.alt, arrows: image.arrows },
      ]),
    ),
    author: s.author,
    updatedAt: s.createdAt,
  };
}

export class DocsStore {
  private readonly db: DatabaseSync;
  private readonly pictures: string;

  constructor(dataDir: string) {
    this.pictures = join(dataDir, 'images');
    mkdirSync(this.pictures, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(dataDir, 'docs.db'));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'author', daily_limit INTEGER NOT NULL DEFAULT 10,
        revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS submissions (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL, account INTEGER NOT NULL,
        author TEXT NOT NULL, status TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL, area TEXT NOT NULL, summary TEXT NOT NULL, keywords TEXT NOT NULL,
        body TEXT NOT NULL, images TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS submissions_id ON submissions (id, status, seq);
      CREATE INDEX IF NOT EXISTS submissions_status ON submissions (status, seq);
    `);
  }

  close(): void {
    this.db.close();
  }

  // ---- accounts -------------------------------------------------------------------------------

  createAccount(
    name: string,
    role: Role = 'author',
    dailyLimit = 10,
    fixedToken?: string,
  ): { account: Account; token: string } {
    const token = fixedToken ?? randomBytes(32).toString('base64url');
    const result = this.db
      .prepare(
        'INSERT INTO accounts (name, token_hash, role, daily_limit, created_at) VALUES (?,?,?,?,?)',
      )
      .run(name, sha(token), role, dailyLimit, new Date().toISOString());
    return { account: { id: Number(result.lastInsertRowid), name, role, dailyLimit }, token };
  }

  findAccount(token: string): Account | null {
    const row = this.db
      .prepare(
        'SELECT id, name, role, daily_limit FROM accounts WHERE token_hash = ? AND revoked = 0',
      )
      .get(sha(token)) as Row | undefined;
    return row
      ? {
          id: Number(row.id),
          name: String(row.name),
          role: row.role as Role,
          dailyLimit: Number(row.daily_limit),
        }
      : null;
  }

  revokeAccount(id: number): boolean {
    return this.db.prepare('UPDATE accounts SET revoked = 1 WHERE id = ?').run(id).changes > 0;
  }

  accounts(): Row[] {
    return this.db
      .prepare('SELECT id, name, role, daily_limit, revoked FROM accounts')
      .all() as Row[];
  }

  // ---- submissions ----------------------------------------------------------------------------

  submittedSince(account: number, since: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM submissions WHERE account = ? AND created_at >= ?')
      .get(account, since) as Row;
    return Number(row.n);
  }

  /**
   * Stores a change as the live article. Pictures are written before the row, so a row never
   * references a missing picture.
   */
  async submit(
    who: Account,
    article: Omit<DocArticle, 'images' | 'author' | 'updatedAt'>,
    images: Readonly<Record<string, SentImage>>,
  ): Promise<{ seq: number; status: Status }> {
    const stored: Record<string, StoredImage> = {};
    for (const [key, image] of Object.entries(images)) {
      const hash = sha(image.bytes);
      await this.keepPicture(hash, image.bytes);
      stored[key] = { hash, mime: image.mime, alt: image.alt, arrows: image.arrows };
    }
    const status: Status = 'approved';
    const result = this.db
      .prepare(
        `INSERT INTO submissions (id, account, author, status, title, area, summary, keywords, body, images, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        article.id,
        who.id,
        who.name,
        status,
        article.title,
        article.area,
        article.summary,
        article.keywords,
        article.body,
        JSON.stringify(stored),
        new Date().toISOString(),
      );
    const seq = Number(result.lastInsertRowid);
    this.supersede(article.id, seq);
    return { seq, status };
  }

  /** All versions of an article, newest first. */
  history(id: string): Pick<Submission, 'seq' | 'author' | 'title' | 'createdAt' | 'status'>[] {
    return (
      this.db
        .prepare(
          "SELECT seq, author, title, created_at, status FROM submissions WHERE id = ? AND status IN ('approved','superseded') ORDER BY seq DESC LIMIT 200",
        )
        .all(id) as Row[]
    ).map((r) => ({
      seq: Number(r.seq),
      author: String(r.author),
      title: String(r.title),
      createdAt: String(r.created_at),
      status: r.status as Status,
    }));
  }

  /** One version of an article, live or superseded. */
  revision(id: string, seq: number): Submission | null {
    const found = this.get(seq);
    return found !== null &&
      found.id === id &&
      (found.status === 'approved' || found.status === 'superseded')
      ? found
      : null;
  }

  /** Restores an earlier version as a new change by `who`. */
  restore(who: Account, id: string, seq: number): { seq: number } | null {
    const old = this.revision(id, seq);
    if (old === null) return null;
    const result = this.db
      .prepare(
        `INSERT INTO submissions (id, account, author, status, title, area, summary, keywords, body, images, created_at)
         VALUES (?,?,?,'approved',?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        who.id,
        who.name,
        old.title,
        old.area,
        old.summary,
        old.keywords,
        old.body,
        JSON.stringify(old.images),
        new Date().toISOString(),
      );
    const next = Number(result.lastInsertRowid);
    this.supersede(id, next);
    return { seq: next };
  }

  private supersede(id: string, except: number): void {
    this.db
      .prepare(
        "UPDATE submissions SET status = 'superseded' WHERE id = ? AND status = 'approved' AND seq != ?",
      )
      .run(id, except);
  }

  private async keepPicture(hash: string, bytes: Uint8Array): Promise<void> {
    const target = join(this.pictures, hash);
    const part = `${target}.${randomBytes(4).toString('hex')}.part`;
    await writeFile(part, bytes, { mode: 0o600 });
    await rename(part, target);
  }

  get(seq: number): Submission | null {
    const row = this.db.prepare('SELECT * FROM submissions WHERE seq = ?').get(seq) as
      | Row
      | undefined;
    return row === undefined ? null : toSubmission(row);
  }

  /** The live article with this id. */
  live(id: string): Submission | null {
    const row = this.db
      .prepare(
        "SELECT * FROM submissions WHERE id = ? AND status = 'approved' ORDER BY seq DESC LIMIT 1",
      )
      .get(id) as Row | undefined;
    return row === undefined ? null : toSubmission(row);
  }

  /** Live articles containing every term, newest first, paginated. */
  list(q: string, before: number, limit: number): { articles: Submission[]; next?: string } {
    const terms = q
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term !== '')
      .slice(0, 6);
    const like = terms.map(
      () => "(lower(title || ' ' || summary || ' ' || keywords || ' ' || body) LIKE ? ESCAPE '\\')",
    );
    const rows = this.db
      .prepare(
        `SELECT * FROM submissions WHERE status = 'approved' AND seq < ? ${like.length > 0 ? `AND ${like.join(' AND ')}` : ''}
         ORDER BY seq DESC LIMIT ?`,
      )
      .all(
        before,
        ...terms.map((term) => `%${term.replace(/[\\%_]/g, '\\$&')}%`),
        limit + 1,
      ) as Row[];
    const page = rows.slice(0, limit).map(toSubmission);
    const last = page.at(-1);
    return rows.length > limit && last !== undefined
      ? { articles: page, next: String(last.seq) }
      : { articles: page };
  }

  byAccount(account: number): Submission[] {
    return (
      this.db
        .prepare('SELECT * FROM submissions WHERE account = ? ORDER BY seq DESC LIMIT 100')
        .all(account) as Row[]
    ).map(toSubmission);
  }

  /** Takes a live article down. */
  remove(id: string): boolean {
    return (
      this.db
        .prepare(
          "UPDATE submissions SET status = 'rejected', note = 'taken down' WHERE id = ? AND status = 'approved'",
        )
        .run(id).changes > 0
    );
  }

  // ---- pictures -------------------------------------------------------------------------------

  async picture(hash: string): Promise<{ bytes: Uint8Array; mime: SentImage['mime'] } | null> {
    // Serve pictures of live and superseded versions (the history shows them), not removed ones.
    const row = this.db
      .prepare(
        "SELECT images FROM submissions WHERE status IN ('approved','superseded') AND images LIKE ? LIMIT 1",
      )
      .get(`%${hash}%`) as Row | undefined;
    if (row === undefined) return null;
    const named = Object.values(JSON.parse(String(row.images)) as Record<string, StoredImage>).find(
      (image) => image.hash === hash,
    );
    if (named === undefined) return null;
    try {
      return { bytes: await readFile(join(this.pictures, hash)), mime: named.mime };
    } catch {
      return null;
    }
  }

  /** Live article counts per author, for the leaderboard. */
  authors(): { author: string; articles: number }[] {
    return (
      this.db
        .prepare(
          "SELECT author, COUNT(*) AS n FROM submissions WHERE status = 'approved' GROUP BY author ORDER BY n DESC",
        )
        .all() as Row[]
    ).map((r) => ({ author: String(r.author), articles: Number(r.n) }));
  }

  /** Deletes pictures no row references. Run from the CLI, never while serving requests. */
  async sweep(): Promise<number> {
    const named = new Set<string>();
    for (const row of this.db.prepare('SELECT images FROM submissions').all() as Row[])
      for (const image of Object.values(
        JSON.parse(String(row.images)) as Record<string, StoredImage>,
      ))
        named.add(image.hash);
    const { readdir } = await import('node:fs/promises');
    let removed = 0;
    for (const file of await readdir(this.pictures)) {
      if (!named.has(file)) {
        await rm(join(this.pictures, file), { force: true });
        removed += 1;
      }
    }
    return removed;
  }
}
