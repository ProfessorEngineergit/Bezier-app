/** The plugin server's SQLite schema. Tables are created when missing and never dropped. */

export const SCHEMA = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS authors (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
    daily_limit INTEGER NOT NULL DEFAULT 5, revoked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS plugins (
    id TEXT PRIMARY KEY, owner INTEGER NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS versions (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, version_id TEXT NOT NULL UNIQUE,
    plugin TEXT NOT NULL, version TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL,
    permissions TEXT NOT NULL, network TEXT NOT NULL, sha256 TEXT NOT NULL, size INTEGER NOT NULL,
    author_id INTEGER NOT NULL, author TEXT NOT NULL, status TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '', findings TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL,
    UNIQUE (plugin, version));
  CREATE INDEX IF NOT EXISTS versions_status ON versions (status, plugin, seq);
  CREATE TABLE IF NOT EXISTS reports (
    plugin TEXT NOT NULL, reporter TEXT NOT NULL, reason TEXT NOT NULL,
    created_at TEXT NOT NULL, PRIMARY KEY (plugin, reporter));
`;
