/**
 * The project actions in the dashboard tile's menu. Kept as data rather than JSX so the order and
 * the destructive marking are stated once and testable.
 */

export type ProjectAction =
  | 'rename'
  | 'open'
  | 'duplicate'
  | 'backup'
  | 'move-to-folder'
  | 'export'
  | 'share'
  | 'save-as-project'
  | 'delete';

export interface MenuItem {
  action: ProjectAction;
  label: string;
  /** Marks actions that destroy something. */
  destructive?: boolean;
}

const ITEMS: readonly MenuItem[] = [
  { action: 'open', label: 'Open' },
  { action: 'rename', label: 'Rename…' },
  // A copy to experiment on, and a file of the whole project to keep elsewhere.
  { action: 'duplicate', label: 'Duplicate' },
  { action: 'move-to-folder', label: 'Move to Folder…' },
  { action: 'export', label: 'Export…' },
  { action: 'backup', label: 'Save Backup…' },
  { action: 'delete', label: 'Delete', destructive: true },
];

/**
 * A lesson's project (lesson-project.ts) lives on the Learn page in no folder; in place of the
 * folder action it offers a copy among ordinary projects.
 */
const LESSON_ITEMS: readonly MenuItem[] = [
  { action: 'open', label: 'Continue Lesson' },
  { action: 'rename', label: 'Rename…' },
  { action: 'save-as-project', label: 'Save as Project' },
  { action: 'delete', label: 'Delete', destructive: true },
];

/** Offered once collaboration is connected, for an unshared project. */
const SHARE: MenuItem = { action: 'share', label: 'Share…' };

/** The menu, in display order. */
export function projectMenu(lesson = false, shareable = false): readonly MenuItem[] {
  if (lesson) return LESSON_ITEMS;
  // After Open: sharing applies to the whole project, before filing or exporting.
  return shareable ? [ITEMS[0] as MenuItem, SHARE, ...ITEMS.slice(1)] : ITEMS;
}
