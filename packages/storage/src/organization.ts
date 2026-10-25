/**
 * Dashboard folders and document placements, as pure transforms over a plain object. Stored as
 * one index file without a journal: losing it only moves projects back to the top level.
 */

export interface FolderInfo {
  id: string;
  name: string;
}

export interface DashboardIndex {
  /** Folders in creation order. */
  folders: readonly FolderInfo[];
  /** Document id → folder id. A document absent here sits at the top level. */
  placements: Readonly<Record<string, string>>;
}

export const emptyIndex: DashboardIndex = { folders: [], placements: {} };

export function addFolder(index: DashboardIndex, id: string, name: string): DashboardIndex {
  if (index.folders.some((folder) => folder.id === id)) return index;
  return { ...index, folders: [...index.folders, { id, name }] };
}

export function renameFolder(index: DashboardIndex, id: string, name: string): DashboardIndex {
  return {
    ...index,
    folders: index.folders.map((folder) => (folder.id === id ? { ...folder, name } : folder)),
  };
}

/** Removes a folder and moves its documents to the top level. */
export function removeFolder(index: DashboardIndex, id: string): DashboardIndex {
  const placements: Record<string, string> = {};
  for (const [docId, folderId] of Object.entries(index.placements)) {
    if (folderId !== id) placements[docId] = folderId;
  }
  return { folders: index.folders.filter((folder) => folder.id !== id), placements };
}

/** Places a document in a folder, or at the top level for null or an unknown folder. */
export function placeDocument(
  index: DashboardIndex,
  docId: string,
  folderId: string | null,
): DashboardIndex {
  const placements: Record<string, string> = { ...index.placements };
  if (folderId === null || !index.folders.some((folder) => folder.id === folderId)) {
    delete placements[docId];
  } else {
    placements[docId] = folderId;
  }
  return { ...index, placements };
}

/** Removes a deleted document from the index. */
export function forgetDocument(index: DashboardIndex, docId: string): DashboardIndex {
  if (!(docId in index.placements)) return index;
  const placements: Record<string, string> = { ...index.placements };
  delete placements[docId];
  return { ...index, placements };
}

/** The folder a document sits in, or null for the top level. */
export function folderOf(index: DashboardIndex, docId: string): string | null {
  return index.placements[docId] ?? null;
}

/** Parses an index, returning the empty index for missing or corrupt text. */
export function parseIndex(text: string | null): DashboardIndex {
  if (text === null) return emptyIndex;
  try {
    const parsed = JSON.parse(text) as Partial<DashboardIndex>;
    const folders = Array.isArray(parsed.folders)
      ? parsed.folders.filter(
          (folder): folder is FolderInfo =>
            typeof folder?.id === 'string' && typeof folder?.name === 'string',
        )
      : [];
    const placements: Record<string, string> = {};
    if (parsed.placements !== null && typeof parsed.placements === 'object') {
      for (const [docId, folderId] of Object.entries(parsed.placements ?? {})) {
        if (typeof folderId === 'string') placements[docId] = folderId;
      }
    }
    return { folders, placements };
  } catch {
    return emptyIndex;
  }
}

export function serializeIndex(index: DashboardIndex): string {
  return JSON.stringify(index, null, 2);
}
