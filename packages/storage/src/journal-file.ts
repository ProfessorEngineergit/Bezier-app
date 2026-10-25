/**
 * The journal on disk: one line per entry, large entries in files of their own.
 *
 * On OPFS, `createWritable({ keepExistingData: true })` copies the whole file in WebKit and
 * Chromium (WebKit: 9 ms per append at 1 MB, 85 ms at 50 MB, 310 ms at 250 MB), and an imported
 * STEP file is a single entry. So a large entry is written atomically to its own file first, then
 * a short line naming it is appended; a crash in between leaves only an orphan file.
 */

import type { JournalEntry } from '@bezier/core';
import { decode, encode, layout, type StorageBackend } from './backend.js';

/** Entries longer than this, in characters, go into a file of their own. */
export const LARGE_ENTRY = 64 * 1024;

/** Journal line standing in for an entry kept in its own file. */
interface ExternalLine {
  readonly seq: number;
  readonly at: string;
  /** Key of the entry file. */
  readonly external: string;
}

function isExternal(value: unknown): value is ExternalLine {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ExternalLine).external === 'string'
  );
}

/** Durable when it resolves: the entry file, if any, is written before its line. */
export async function appendEntry(
  backend: StorageBackend,
  id: string,
  entry: JournalEntry,
): Promise<void> {
  const text = JSON.stringify(entry);
  if (text.length <= LARGE_ENTRY) {
    await backend.append(layout.journal(id), encode(`${text}\n`));
    return;
  }
  const key = layout.journalEntry(id, entry.seq);
  await backend.write(key, encode(text));
  const line: ExternalLine = { seq: entry.seq, at: entry.at, external: key };
  await backend.append(layout.journal(id), encode(`${JSON.stringify(line)}\n`));
}

/** A journal line as read: the entry, or its external reference when not fetched. */
export type JournalLine = JournalEntry | ExternalLine;

/**
 * Returns the journal lines in order. With `fetch`, external entries are read in; without, they
 * stay as references, which is enough for counting or summarizing. A line whose entry file is
 * lost is returned as the reference, so replay stops there and reports it.
 */
export async function readEntries(
  backend: StorageBackend,
  id: string,
  fetch: true,
): Promise<JournalEntry[]>;
export async function readEntries(
  backend: StorageBackend,
  id: string,
  fetch: false,
): Promise<JournalLine[]>;
export async function readEntries(
  backend: StorageBackend,
  id: string,
  fetch: boolean,
): Promise<JournalLine[]> {
  const raw = await backend.read(layout.journal(id));
  if (raw === null) return [];

  const lines: JournalLine[] = [];
  /** Large entries found inline (older format), to be moved out. */
  const inline: JournalEntry[] = [];
  for (const line of decode(raw).split('\n')) {
    if (line.trim() === '') continue;
    if (!fetch && line.length > LARGE_ENTRY) {
      // Only counted; a line this large is never a rename, so skip parsing it.
      lines.push({ seq: lines.length + 1, at: '', external: '' });
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      // A torn final line is a crash during append; everything before it is intact.
      break;
    }
    if (!fetch || !isExternal(parsed)) {
      if (line.length > LARGE_ENTRY) inline.push(parsed as JournalEntry);
      lines.push(parsed as JournalLine);
      continue;
    }
    const stored = await backend.read(parsed.external);
    let entry: JournalEntry | null = null;
    try {
      entry = stored === null ? null : (JSON.parse(decode(stored)) as JournalEntry);
    } catch {
      entry = null;
    }
    // The entry file is written before its line, so a missing one is damage. Pass the line on:
    // it has no checksum, so replay stops at it and reports it. Dropping it would hide the gap.
    lines.push(entry ?? parsed);
  }
  if (inline.length > 0) await keepApart(backend, id, lines as JournalEntry[], inline);
  return lines;
}

/**
 * Moves large inline entries from the older format into their own files. Entry files first,
 * then the journal in one atomic write, so a crash leaves the old journal readable.
 */
async function keepApart(
  backend: StorageBackend,
  id: string,
  entries: readonly JournalEntry[],
  inline: readonly JournalEntry[],
): Promise<void> {
  const large = new Set(inline);
  const text: string[] = [];
  for (const entry of entries) {
    if (!large.has(entry)) {
      text.push(JSON.stringify(entry));
      continue;
    }
    const key = layout.journalEntry(id, entry.seq);
    await backend.write(key, encode(JSON.stringify(entry)));
    const line: ExternalLine = { seq: entry.seq, at: entry.at, external: key };
    text.push(JSON.stringify(line));
  }
  await backend.write(layout.journal(id), encode(`${text.join('\n')}\n`));
}

/** Removes a journal's entry files, after compaction. */
export async function removeEntryFiles(backend: StorageBackend, id: string): Promise<void> {
  const keys = await backend.list(layout.journalEntries(id));
  await Promise.all(keys.map((key) => backend.remove(key)));
}

/**
 * Returns a document's name and last change from its journal lines, without replay. Only
 * renames change the name, and every entry carries its time.
 */
export function summarize(
  lines: readonly JournalLine[],
  base: { name: string; modifiedAt: string },
): { name: string; modifiedAt: string } {
  let { name, modifiedAt } = base;
  for (const line of lines) {
    if (typeof line.at === 'string' && line.at > modifiedAt) modifiedAt = line.at;
    if (isExternal(line)) continue;
    if (line.op.op === 'renameDocument') name = line.op.name;
  }
  return { name, modifiedAt };
}
