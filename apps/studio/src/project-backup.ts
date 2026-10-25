/**
 * Exports a whole project as one `.bezier` JSON file (document, full history, imported files), and
 * opens such a file as a new project.
 */
import { parseProjectFile } from '@bezier/core';
import type { DocumentInfo } from './boot.js';
import { save } from './download.js';
import type { SessionDeps } from './session.js';
import type { LibraryHandle } from './use-library.js';
import type { TasksHandle } from './use-tasks.js';

export const BACKUP_EXTENSION = '.bezier';

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
