/**
 * Exports a whole project as one `.bezier` JSON file (document, full history, imported files), and
 * opens such a file as a new project. All of them at once are one `.bezierbackup` file: a zip of
 * those same files, so one project can also be taken out of it by hand.
 */
import { parseProjectFile } from '@bezier/core';
import type { DocumentInfo } from './boot.js';
import { save } from './download.js';
import { unzip, zip } from './formats/zip.js';
import type { SessionDeps } from './session.js';
import type { LibraryHandle } from './use-library.js';
import type { TasksHandle } from './use-tasks.js';

export const BACKUP_EXTENSION = '.bezier';
export const ALL_EXTENSION = '.bezierbackup';

export async function saveBackup(
  library: LibraryHandle,
  tasks: TasksHandle,
  doc: DocumentInfo,
): Promise<void> {
  const store = library.store();
  if (store === null) return;
  try {
    const { document } = await store.load(doc.id);
    const written = await save(
      JSON.stringify(document),
      `${doc.name}${BACKUP_EXTENSION}`,
      'application/json',
    );
    if (written !== null) tasks.notify({ title: `Saved a backup of “${doc.name}”`, tone: 'ok' });
  } catch (error) {
    tasks.notify({
      title: `Could not save a backup of “${doc.name}”`,
      detail: error instanceof Error ? error.message : String(error),
      tone: 'fail',
    });
  }
}

/** Opens a backup as a new project in All Projects. Resolves to an error message, or null. */
export async function openBackup(
  store: SessionDeps['store'] | undefined,
  name: string,
  text: string,
): Promise<string | null> {
  if (store === undefined) return 'Projects are not available yet.';
  try {
    const document = parseProjectFile(text);
    await store.importProject(`doc-${Date.now()}`, {
      ...document,
      meta: { ...document.meta, name: document.meta.name || name.replace(/\.bezier$/i, '') },
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** A file name per project, unique, since two projects may share a name. */
const entryName = (doc: DocumentInfo, taken: Set<string>): string => {
  const plain = doc.name.replace(/[/\\:*?"<>|]/g, '-') || 'Untitled';
  let name = `${plain}${BACKUP_EXTENSION}`;
  for (let n = 2; taken.has(name); n += 1) name = `${plain} ${n}${BACKUP_EXTENSION}`;
  taken.add(name);
  return name;
};

export async function saveAllBackups(
  library: LibraryHandle,
  tasks: TasksHandle,
  documents: readonly DocumentInfo[],
): Promise<void> {
  const store = library.store();
  if (store === null) return;
  const encoder = new TextEncoder();
  const taken = new Set<string>();
  try {
    const files = [];
    for (const doc of documents) {
      const { document } = await store.load(doc.id);
      files.push({ name: entryName(doc, taken), data: encoder.encode(JSON.stringify(document)) });
    }
    const day = new Date().toISOString().slice(0, 10);
    const written = await save(
      zip(files) as BlobPart,
      `Bezier ${day}${ALL_EXTENSION}`,
      'application/zip',
    );
    if (written !== null) {
      tasks.notify({ title: `Saved a backup of ${files.length} projects`, tone: 'ok' });
    }
  } catch (error) {
    tasks.notify({
      title: 'Could not save the backup',
      detail: error instanceof Error ? error.message : String(error),
      tone: 'fail',
    });
  }
}

/** Opens every project in a backup as a new one. Resolves to an error message, or null. */
export async function openAllBackups(
  store: SessionDeps['store'] | undefined,
  bytes: Uint8Array,
): Promise<string | null> {
  try {
    const decoder = new TextDecoder();
    for (const { name, data } of unzip(bytes)) {
      const refused = await openBackup(store, name, decoder.decode(data));
      if (refused !== null) return `${name}: ${refused}`;
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * Asks the browser to keep this app's storage under pressure, once there is something to lose.
 * Without it a browser may clear projects when the disk runs low. Nothing happens on a refusal: the
 * answer is the browser's.
 */
export function askToKeepProjects(): void {
  void navigator.storage?.persist?.().catch(() => undefined);
}
