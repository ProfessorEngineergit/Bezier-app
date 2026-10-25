import { ModelingIcon } from '@bezier/ui';

/**
 * The message for an empty view, depending on why it is empty. It does not invite dropping STEP or
 * STL files, since imported geometry cannot become part of a document yet.
 */
export function EmptyState({
  hasAny,
  inFolder,
  searching,
  onNew,
}: {
  hasAny: boolean;
  inFolder: boolean;
  searching: boolean;
  onNew: () => void;
}) {
  if (searching) {
    return (
      <div className="library__empty">
        <p className="library__emptyTitle">Nothing matches</p>
        <p className="library__emptyNote">
          Search looks through projects, folders and settings. Start with <kbd>settings:</kbd> or{' '}
          <kbd>projects:</kbd> to look in one place only.
        </p>
      </div>
    );
  }
  if (!hasAny) {
    return (
      <div className="library__empty">
        <p className="library__emptyTitle">No projects yet</p>
        <p className="library__emptyNote">A project holds one part and every step that made it.</p>
        <button className="library__action library__action--primary" onClick={onNew} type="button">
          <ModelingIcon />
          New Project
        </button>
      </div>
    );
  }
  return (
    <div className="library__empty">
      <p className="library__emptyTitle">
        {inFolder ? 'This folder is empty' : 'Nothing here yet'}
      </p>
      <p className="library__emptyNote">
        {inFolder
          ? 'Drag a project onto this folder in the sidebar, or choose Move to Folder… from its menu.'
          : 'Every project on this machine shows up here, newest first.'}
      </p>
    </div>
  );
}
