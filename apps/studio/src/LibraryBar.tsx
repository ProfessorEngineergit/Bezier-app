/**
 * The start page's top bar: a breadcrumb path from the app name (`Bezier / Settings / Appearance`,
 * `Bezier / All Projects / Brackets`), where each step but the last navigates up, and New Project.
 * The same path is the window title (Dock, Mission Control, Window menu).
 */

import { useEffect } from 'react';

export interface Crumb {
  label: string;
  /** Navigates to this step; absent for the last step (the current location). */
  go?: () => void;
}

export function LibraryBar({
  crumbs,
  showsNew,
  onNew,
}: {
  crumbs: readonly Crumb[];
  showsNew: boolean;
  onNew: () => void;
}) {
  const path = crumbs.map((crumb) => crumb.label).join(' / ');
  useEffect(() => {
    document.title = path;
  }, [path]);

  return (
    <header className="library__bar" data-tauri-drag-region="">
      <div className="library__barInner" data-tauri-drag-region="">
        <nav aria-label="Location" className="library__crumbs" data-tauri-drag-region="">
          {crumbs.map((crumb, index) => (
            <span
              data-tauri-drag-region=""
              className="library__crumbStep" // The path is short and each depth holds one step, so depth names it.
              key={crumbs
                .slice(0, index + 1)
                .map((step) => step.label)
                .join('/')}
            >
              {index > 0 && (
                <span aria-hidden="true" className="library__sep">
                  /
                </span>
              )}
              {/* The app name starts the path and leads to the landing page; the current step
                  is not a link. */}
              {crumb.go === undefined || index === crumbs.length - 1 ? (
                <span
                  aria-current={index === crumbs.length - 1 ? 'page' : undefined}
                  className="library__crumb"
                  data-tauri-drag-region=""
                  data-current={index === crumbs.length - 1 ? '' : undefined}
                >
                  {crumb.label}
                </span>
              ) : (
                <button className="library__crumb" onClick={crumb.go} type="button">
                  {crumb.label}
                </button>
              )}
            </span>
          ))}
        </nav>
        <span className="library__spacer" data-tauri-drag-region="" />
        {/* Only New Project here; New Folder lives beside the folders in the sidebar. */}
        {showsNew && (
          <button
            className="library__action library__action--primary"
            onClick={onNew}
            type="button"
          >
            New Project
          </button>
        )}
      </div>
    </header>
  );
}
