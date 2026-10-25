/**
 * The start page's sidebar. All Projects comes first (every project, newest first, wherever it is
 * filed); folders filter that one list. Settings sits at the bottom.
 */

import { ChannelTag, CommunityIcon, reaches, useChannel, WikiIcon } from '@bezier/lessons';
import type { DashboardIndex } from '@bezier/storage';
import { folderOf } from '@bezier/storage';
import { FolderPlusIcon, GearIcon, PartIcon, SearchIcon } from '@bezier/ui';
import { useEffect, useRef } from 'react';
import { arrowThroughList } from './arrow-focus.js';
import type { DocumentInfo } from './boot.js';
import { SharedSection } from './collab/SharedSection.js';
import { FolderDropTray, TRAY_SHOWN } from './FolderDropTray.js';
import { LearnMark } from './LearnMark.js';
import { FolderRow, SidebarResizeHandle } from './LibraryFolderRow.js';
import { ReportButton } from './report/ReportButton.js';

export type LibraryView =
  | 'home'
  | 'projects'
  | 'learn'
  | 'community'
  | 'contribute'
  | 'settings'
  | 'shared';

interface LibrarySidebarProps {
  documents: readonly DocumentInfo[];
  index: DashboardIndex;
  openFolder: string | null;
  view: LibraryView;
  query: string;
  sidebarWidth: number;
  dropTarget: string | null | undefined;
  /**
   * The project being dragged and its folder (null: top level), or null. A folder it is already in
   * still opens and says so.
   */
  carrying: { id: string; from: string | null } | null;
  /** The project just dropped and its folder, while that folder is still open. */
  arrived: { id: string; folder: string | null } | null;
  /** Project thumbnails, shown inside a folder as it opens. */
  thumbnails: Record<string, string>;
  onQueryChange: (query: string) => void;
  onViewChange: (view: LibraryView) => void;
  /** The logo and name lead to the landing page. */
  onHome: () => void;
  onOpenFolder: (id: string | null) => void;
  onNewFolder: () => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onSidebarResize: (width: number) => void;
  /** The shared vault shown while Shared is the view. */
  sharedVault: string | null;
  onOpenVault: (id: string) => void;
}

export function LibrarySidebar({
  documents,
  index,
  openFolder,
  view,
  query,
  sidebarWidth,
  dropTarget,
  carrying,
  arrived,
  thumbnails,
  onQueryChange,
  onViewChange,
  onHome,
  onOpenFolder,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
  onSidebarResize,
  sharedVault,
  onOpenVault,
}: LibrarySidebarProps) {
  const searchInput = useRef<HTMLInputElement | null>(null);
  const channel = useChannel();
  const alpha = reaches(channel, 'alpha');

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      // ⌘K opens the wiki from anywhere; this field uses the slash.
      if (
        event.key !== '/' ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      event.preventDefault();
      searchInput.current?.focus();
    };
    // Blur the field on a press anywhere else. The browser does this only when the press lands on
    // something focusable: WebKit does not focus the logo button on click, and the strip beside it
    // is a window drag region, so clicks up there left the cursor in the field.
    const leaveSearch = (event: PointerEvent) => {
      const field = searchInput.current;
      if (field === null || document.activeElement !== field) return;
      if (event.target instanceof Node && field.closest('.library-search')?.contains(event.target))
        return;
      field.blur();
    };
    window.addEventListener('keydown', focusSearch);
    window.addEventListener('pointerdown', leaveSearch, true);
    return () => {
      window.removeEventListener('keydown', focusSearch);
      window.removeEventListener('pointerdown', leaveSearch, true);
    };
  }, []);

  return (
    // Arrow keys move through the sidebar entries, opening each as reached, like a file manager.
    // biome-ignore lint/a11y/noStaticElementInteractions: arrow keys for the buttons inside, which are focusable themselves
    <aside
      className="library-sidebar"
      onKeyDown={(event) =>
        arrowThroughList(event, '.library-nav__item, .library-folder__open', true)
      }
    >
      {/* The desktop build draws its window buttons over this row, so it is also a window drag
          region. */}
      <div className="library-sidebar__identity" data-tauri-drag-region="">
        {/* The mark and name; not a button. Home, below, leads to the start of the app. */}
        <div className="library-sidebar__home" data-tauri-drag-region="">
          {/* Both marks are in the page and the theme picks one; swapping `src` from script
              would flash the wrong one on theme changes. */}
          <img
            alt=""
            className="library-sidebar__logo library-sidebar__logo--dark"
            draggable={false}
            src="/brand/bezier-dark.png"
          />
          <img
            alt=""
            className="library-sidebar__logo library-sidebar__logo--light"
            draggable={false}
            src="/brand/bezier-light.png"
          />
          <span className="library-sidebar__titles">
            <span className="library-sidebar__wordmark">Bezier</span>
            {/* Under the mark: the build's channel (beta or alpha). */}
            {channel !== 'stable' && <ChannelTag gate={channel} />}
          </span>
        </div>
      </div>

      <label className="library-search">
        <SearchIcon />
        <input
          aria-keyshortcuts="/"
          aria-label="Search projects"
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            onQueryChange('');
            event.currentTarget.blur();
          }}
          placeholder="Search"
          ref={searchInput}
          type="search"
          value={query}
        />
        <kbd>/</kbd>
      </label>

      <nav aria-label="Library" className="library-sidebar__nav">
        <button
          className="library-nav__item"
          data-active={view === 'home' ? '' : undefined}
          onClick={onHome}
          type="button"
        >
          <HomeIcon />
          <span>Home</span>
        </button>
        <button
          className="library-nav__item"
          data-active={view === 'projects' && openFolder === null ? '' : undefined}
          data-drop-target={
            dropTarget === null && carrying !== null && carrying.from !== null ? '' : undefined
          }
          onClick={() => {
            onViewChange('projects');
            onOpenFolder(null);
          }}
          type="button"
          // What a dragged card looks for under the pointer (`card-drag.ts`).
          data-drop-folder=""
        >
          <PartIcon />
          <span>All Projects</span>
          <small>{documents.length}</small>
        </button>
        <button
          className="library-nav__item"
          data-active={view === 'learn' ? '' : undefined}
          onClick={() => onViewChange('learn')}
          type="button"
        >
          <LearnMark />
          <span>Learn</span>
        </button>
        <button
          className="library-nav__item"
          data-active={view === 'community' ? '' : undefined}
          onClick={() => onViewChange('community')}
          type="button"
        >
          {alpha ? <CommunityIcon /> : <WikiIcon />}
          <span>{alpha ? 'Community' : 'Wiki'}</span>
          {alpha && <ChannelTag gate="alpha" />}
        </button>
        {/* Contribute gets its own entry: the app is unfinished and this is where to report it. */}
        <button
          className="library-nav__item"
          data-active={view === 'contribute' ? '' : undefined}
          onClick={() => onViewChange('contribute')}
          type="button"
        >
          <HeartIcon />
          <span>Contribute</span>
        </button>
      </nav>

      <section aria-label="Folders" className="library-sidebar__section">
        <header>
          <span>Folders</span>
          <button aria-label="New folder" onClick={onNewFolder} title="New folder" type="button">
            <FolderPlusIcon />
          </button>
        </header>
        <div className="library-folder-list">
          {index.folders.length === 0 ? (
            <p className="library-folder-list__empty">No folders yet</p>
          ) : (
            index.folders.map((folder) => {
              const inside = documents.filter((doc) => folderOf(index, doc.id) === folder.id);
              const open = dropTarget === folder.id;
              return (
                <FolderRow
                  active={view === 'projects' && folder.id === openFolder}
                  count={inside.length}
                  dropId={folder.id}
                  dropOpen={open}
                  key={folder.id}
                  name={folder.name}
                  onDelete={() => onDeleteFolder(folder.id)}
                  onOpen={() => {
                    onViewChange('projects');
                    onOpenFolder(folder.id);
                  }}
                  onRename={(name) => onRenameFolder(folder.id, name)}
                  tray={
                    <FolderDropTray
                      count={inside.length}
                      arriving={
                        arrived?.folder === folder.id
                          ? {
                              id: arrived.id,
                              ...(thumbnails[arrived.id] === undefined
                                ? {}
                                : { thumbnail: thumbnails[arrived.id] }),
                            }
                          : undefined
                      }
                      carried={carrying?.id}
                      here={carrying?.from === folder.id}
                      items={newestFirst(inside)
                        .slice(0, TRAY_SHOWN)
                        .map((doc) => ({
                          id: doc.id,
                          ...(thumbnails[doc.id] === undefined
                            ? {}
                            : { thumbnail: thumbnails[doc.id] }),
                        }))}
                    />
                  }
                />
              );
            })
          )}
        </div>
      </section>

      <SharedSection active={view === 'shared' ? sharedVault : null} onOpen={onOpenVault} />

      <div className="library-sidebar__spacer" />

      <nav aria-label="More" className="library-sidebar__nav library-sidebar__nav--foot">
        <ReportButton
          className="library-nav__item library-nav__item--report"
          label="Report a problem"
        />
        <button
          className="library-nav__item"
          data-active={view === 'settings' ? '' : undefined}
          onClick={() => onViewChange('settings')}
          type="button"
        >
          <GearIcon />
          <span>Settings</span>
        </button>
      </nav>

      <SidebarResizeHandle onResize={onSidebarResize} width={sidebarWidth} />
    </aside>
  );
}

const HomeIcon = () => (
  <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
    <path
      d="M2.5 7.2 8 2.6l5.5 4.6M4 6.400V13h3V9.500h2V13h3V6.400"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.4"
    />
  </svg>
);

const HeartIcon = () => (
  <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
    <path
      d="M8 13.5S2.5 10.2 2.5 6.3A2.8 2.8 0 0 1 8 5.2a2.8 2.8 0 0 1 5.5 1.1C13.5 10.2 8 13.5 8 13.5Z"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth="1.4"
    />
  </svg>
);

function newestFirst(docs: readonly DocumentInfo[]): DocumentInfo[] {
  return [...docs].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}
