/**
 * The start page: every project on this machine in one list, newest first, wherever it is filed.
 * A folder filters that list rather than being a second place to look. The title bar holds only
 * actions so the window stays easy to drag.
 */

import './tile-leave.css';
import {
  Community,
  type CommunityKind,
  findArticles,
  type Lessons,
  LessonsHome,
  reaches,
  useChannel,
  useWiki,
} from '@bezier/lessons';
import type { DashboardIndex } from '@bezier/storage';
import { folderOf } from '@bezier/storage';
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { arrowAcrossPage, arrowThroughGrid } from './arrow-focus.js';
import type { DocumentInfo } from './boot.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { ContributePage } from './ContributePage.js';
import { ShareDialog } from './collab/ShareDialog.js';
import { type SharedLibrary, SharedVault } from './collab/SharedVault.js';
import { DashboardCard } from './DashboardCard.js';
import { useLearnCommunity } from './LearnCommunity.js';
import { LessonProjects } from './LessonProjects.js';
import { type Crumb, LibraryBar } from './LibraryBar.js';
import { MoveProjectDialog } from './LibraryDialogs.js';
import { EmptyState } from './LibraryEmptyState.js';
import { LibrarySidebar, type LibraryView } from './LibrarySidebar.js';
import { Landing } from './landing/Landing.js';
import { isLessonProject } from './lesson-project.js';
import { matchesAll, parseSearch } from './library-search.js';
import { PreferencesPage } from './PreferencesSheet.js';
import { usePluginState } from './plugins/plugin-state.js';
import type { AppPrefs } from './preferences.js';
import type { ProjectAction } from './project-menu.js';
import { SettingsHits } from './SettingsHits.js';
import { CATEGORIES, type SettingsTab, settingsMatching } from './settings-catalog.js';
import { onSettingsRequest, takeSettingsRequest } from './settings-request.js';
import { useCardSelection } from './use-card-selection.js';
import { reducedMotion, useFlip } from './use-flip.js';
import { useNewProjectKey } from './use-new-project-key.js';
import { useSidebarWidth } from './use-sidebar-width.js';
import { VERSION } from './version.js';
import { WikiHits } from './WikiHits.js';
import { WikiTip } from './WikiTip.js';

export interface DashboardProps {
  /** The projects have been read; until then there is nothing to say about them. */
  loaded: boolean;
  documents: readonly DocumentInfo[];
  index: DashboardIndex;
  openFolder: string | null;
  onOpenFolder: (id: string | null) => void;
  onNewFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onMoveToFolder: (docId: string, folderId: string | null) => void;
  onRenameProject: (docId: string, name: string) => void;
  onNew: () => void;
  onOpen: (id: string) => void;
  onAction: (action: ProjectAction, doc: DocumentInfo) => void;
  prefs: AppPrefs;
  settingsOpen: boolean;
  /** A picture of each project that has one, as an object URL. */
  thumbnails: Record<string, string>;
  onPrefsChange: (prefs: AppPrefs) => void;
  onSettingsOpenChange: (open: boolean) => void;
  /** Lessons, for the Learn view (`@bezier/lessons`). */
  lessons: Lessons;
  /** Changes when Lessons asks to be shown; the page switches to Learn. */
  learnRequest: number;
  /** What the Shared view needs of the library (collab/SharedVault.tsx). */
  shared: Omit<SharedLibrary, 'documents'>;
}

type DeleteTarget =
  | { kind: 'project'; doc: DocumentInfo; origin?: { x: number; y: number } }
  | { kind: 'folder'; id: string; name: string };

/** How long a deleted project's card takes to dissolve, in milliseconds (`tile-leave.css`). */
const LEAVE_MS = 340;

const COMMUNITY_PARTS: Record<CommunityKind, string> = {
  wiki: 'Wiki',
  lessons: 'Lessons',
  plugins: 'Plugins',
  leaderboard: 'Leaderboard',
};

/** What the last step of the breadcrumb says while something of the wiki is open. */
function articleCrumb(
  open: { kind: string; id?: string },
  articles: readonly { id: string; title: string }[],
): string {
  if (open.kind === 'edit') return 'Editing';
  if (open.kind === 'history') return 'History';
  if (open.kind === 'version') return 'An earlier version';
  return articles.find((article) => article.id === open.id)?.title ?? 'Article';
}

let answeredLearnRequest = 0;
/** Whether the start page has been shown this run; only the first time is the landing page. */
let landed = false;

export function Dashboard({
  loaded,
  documents: everything,
  index,
  openFolder,
  onOpenFolder,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveToFolder,
  onRenameProject,
  onNew,
  onOpen,
  onAction,
  prefs,
  settingsOpen,
  thumbnails,
  onPrefsChange,
  onSettingsOpenChange,
  lessons,
  learnRequest,
  shared,
}: DashboardProps) {
  const page = useRef<HTMLDivElement | null>(null);
  // A lesson's project belongs to Learn (LessonProjects.tsx); everything else here is a project.
  const documents = useMemo(
    () => everything.filter((doc) => !isLessonProject(doc.id)),
    [everything],
  );
  const lessonDocuments = useMemo(
    () =>
      everything
        .filter((doc) => isLessonProject(doc.id))
        .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)),
    [everything],
  );
  const lessonList = useSyncExternalStore(
    lessons.state.subscribe,
    () => lessons.state.get().screen.kind === 'list',
  );
  const [sidebarWidth, setSidebarWidth] = useSidebarWidth();
  const plugins = usePluginState();
  // The landing page is the first page of a run, if the user chose it; returning from a project
  // shows the projects.
  const [view, setView] = useState<LibraryView>(
    settingsOpen
      ? 'settings'
      : learnRequest > answeredLearnRequest
        ? 'learn'
        : !landed && prefs.startPage === 'home'
          ? 'home'
          : 'projects',
  );
  useEffect(() => {
    landed = true;
  }, []);
  // Lessons asked to be shown (a recording finished, a follow-along ended). Each request is
  // answered once, since the page is rebuilt every time a project is left.
  useEffect(() => {
    if (learnRequest <= answeredLearnRequest) return;
    answeredLearnRequest = learnRequest;
    setView('learn');
  }, [learnRequest]);
  const [query, setQuery] = useState('');
  const [communityKind, setCommunityKind] = useState<CommunityKind>('wiki');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(
    () => takeSettingsRequest() ?? 'general',
  );
  const [sharedVault, setSharedVault] = useState<string | null>(null);
  const [sharing, setSharing] = useState<DocumentInfo | null>(null);
  /** The project being dragged, the selection going with it, and its folder when picked up. */
  const [dragging, setDragging] = useState<{
    id: string;
    ids: readonly string[];
    from: string | null;
  } | null>(null);
  /** The project just dropped into a folder, while that folder is still open. */
  const [arrived, setArrived] = useState<{ id: string; folder: string | null } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null | undefined>(undefined);
  const [moving, setMoving] = useState<DocumentInfo | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  // The project being deleted: its card dissolves first, then it is deleted.
  const [leaving, setLeaving] = useState<string | null>(null);

  useEffect(() => {
    page.current?.focus();
  }, []);

  useNewProjectKey(onNew);

  useEffect(() => {
    setView((current) =>
      settingsOpen ? 'settings' : current === 'settings' ? 'projects' : current,
    );
  }, [settingsOpen]);

  const search = parseSearch(query);
  // While Learn is open, typing filters the lessons and stays on the page; `projects:` still
  // searches the projects.
  const learnSearch = (view === 'learn' || view === 'community') && search.scope === 'all';
  const searching = search.terms.length > 0 && search.scope !== 'settings' && !learnSearch;
  const terms = search.terms;
  // `settings:` opens Settings narrowed to the words after it.
  const settingsSearch = search.scope === 'settings';
  const showsSettings = view === 'settings' || settingsSearch;
  const showsHome = !showsSettings && !searching && view === 'home';
  const showsProjects = !showsSettings && (view === 'projects' || searching);
  const showsShared = !showsSettings && !searching && view === 'shared' && sharedVault !== null;
  const folder =
    showsProjects && !searching
      ? (index.folders.find((entry) => entry.id === openFolder) ?? null)
      : null;
  const locationOf = (docId: string) => {
    const folderId = folderOf(index, docId);
    return index.folders.find((entry) => entry.id === folderId)?.name ?? 'Projects';
  };
  // ISO timestamps sort as text. An unsaved document has an empty one and sorts last.
  const newestFirst = [...documents].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  const visible = searching
    ? newestFirst.filter((doc) => matchesAll(`${locationOf(doc.id)} ${doc.name}`, terms))
    : openFolder === null
      ? newestFirst
      : newestFirst.filter((doc) => folderOf(index, doc.id) === openFolder);
  const body = useRef<HTMLElement | null>(null);
  const grid = useRef<HTMLDivElement | null>(null);
  useFlip(grid, '.tile', visible.map((doc) => doc.id).join(','));
  // In Learn the cards to choose from are the lesson projects; elsewhere the projects on show.
  const choosingLessons = view === 'learn' && !searching;
  const selection = useCardSelection(
    body,
    (choosingLessons ? lessonDocuments : visible).map((doc) => doc.id),
  );
  /** What goes with a card that is picked up: the selection, if it is part of it. */
  const carriedWith = (id: string): string[] =>
    selection.selected.has(id) ? [...selection.selected] : [id];
  const wiki = useWiki();
  const channel = useChannel();
  const learnCommunity = useLearnCommunity(learnSearch ? search.terms.join(' ') : '', (id) =>
    lessons.show({ kind: 'player', id }),
  );
  const settingsHits = searching && search.scope === 'all' ? settingsMatching(terms, channel) : [];
  const wikiHits = searching && search.scope === 'all' ? findArticles(terms, wiki.articles) : [];
  const title = searching ? `Results for “${terms.join(' ')}”` : (folder?.name ?? 'All Projects');

  const changeView = (next: LibraryView) => {
    setView(next);
    onSettingsOpenChange(next === 'settings');
  };

  // While the start page is open, wiki articles (from ⌘K or a search) open here, and a floating
  // wiki can be docked back onto it.
  const toWikiPage = useRef(() => {});
  toWikiPage.current = () => {
    setQuery('');
    changeView('community');
  };
  const { offerPage } = wiki;
  useEffect(() => offerPage(() => toWikiPage.current()), [offerPage]);

  // Switching back to stable while viewing a shared project (a beta feature) leaves it.
  useEffect(() => {
    if (!reaches(channel, 'alpha') && view === 'shared') setView('projects');
  }, [channel, view]);

  const changeQuery = (next: string) => {
    setQuery(next);
    if (parseSearch(next).scope === 'settings') changeView('settings');
  };

  const openSettings = (tab: SettingsTab) => {
    setSettingsTab(tab);
    setQuery('');
    changeView('settings');
  };
  // Settings opened at a section from outside (Nib's island) while this page is already up.
  const openSettingsRef = useRef(openSettings);
  openSettingsRef.current = openSettings;
  useEffect(
    () =>
      onSettingsRequest(() => {
        const tab = takeSettingsRequest();
        if (tab !== null) openSettingsRef.current(tab);
      }),
    [],
  );

  const home = () => {
    setQuery('');
    onOpenFolder(null);
    changeView('projects');
  };
  /** The wiki's list, on its page. */
  const wikiList = () => {
    setQuery('');
    wiki.show({ kind: 'list' });
    changeView('community');
  };
  // The logo, the name and the first step of the breadcrumb all lead here.
  const landing = () => {
    setQuery('');
    onOpenFolder(null);
    changeView('home');
  };
  const section = CATEGORIES.find((item) => item.id === settingsTab)?.label ?? 'General';
  /**
   * The breadcrumb while the wiki is open: the page name returns to the wiki list, the open item is
   * the last piece. The wiki draws no breadcrumb of its own here.
   */
  const wikiCrumbs = (name: string): Crumb[] => {
    const open = wiki.onPage ? wiki.view : null;
    // On the alpha channel the page is Community and the wiki part of it: Community / Wiki /
    // article, alongside Community / Lessons, / Plugins, / Leaderboard.
    if (name === 'Community') {
      const community: Crumb = {
        label: 'Community',
        go: () => {
          setCommunityKind('wiki');
          wiki.show({ kind: 'list' });
        },
      };
      if (communityKind !== 'wiki') return [community, { label: COMMUNITY_PARTS[communityKind] }];
      if (open === null || open.kind === 'list') return [community, { label: 'Wiki' }];
      return [
        community,
        { label: 'Wiki', go: () => wiki.show({ kind: 'list' }) },
        { label: articleCrumb(open, wiki.articles) },
      ];
    }
    if (open === null || open.kind === 'list') return [{ label: name }];
    return [
      { label: name, go: () => wiki.show({ kind: 'list' }) },
      { label: articleCrumb(open, wiki.articles) },
    ];
  };
  const crumbs: Crumb[] = [
    { label: 'Bezier', go: landing },
    ...(showsSettings
      ? [{ label: 'Settings', go: () => openSettings('general') }, { label: section }]
      : view === 'home' && !searching
        ? []
        : view === 'learn' && !searching
          ? [{ label: 'Learn' }]
          : view === 'contribute' && !searching
            ? [{ label: 'Contribute' }]
            : view === 'community' && !searching
              ? wikiCrumbs(reaches(channel, 'alpha') ? 'Community' : 'Wiki')
              : showsShared
                ? [{ label: 'Shared' }]
                : searching
                  ? [{ label: 'All Projects', go: home }, { label: 'Search' }]
                  : folder !== null
                    ? [{ label: 'All Projects', go: home }, { label: folder.name }]
                    : [{ label: 'All Projects' }]),
  ];

  const projectAction = (
    action: ProjectAction,
    doc: DocumentInfo,
    origin?: { x: number; y: number },
  ) => {
    // Rename is handled in place by the card.
    if (action === 'move-to-folder') setMoving(doc);
    else if (action === 'delete')
      setDeleting({ kind: 'project', doc, ...(origin === undefined ? {} : { origin }) });
    else if (action === 'open') onOpen(doc.id);
    else if (action === 'share') setSharing(doc);
    else onAction(action, doc);
  };

  // Only the move: the dragged card closes the folder and ends the drag a moment later (`onEnd`),
  // so the page does not change all at once.
  const dropProject = (docId: string, folderId: string | null) => {
    if (folderOf(index, docId) !== folderId) onMoveToFolder(docId, folderId);
  };

  return (
    // Arrow keys across the page, after the lists' own handlers.
    // biome-ignore lint/a11y/noStaticElementInteractions: it only forwards a key to the buttons inside, which are focusable themselves
    <div
      className="library"
      onKeyDown={arrowAcrossPage}
      data-loaded={loaded ? '' : undefined}
      ref={page}
      style={{ '--library-sidebar-current': `${sidebarWidth}px` } as CSSProperties}
      tabIndex={-1}
    >
      <LibrarySidebar
        arrived={arrived}
        carrying={dragging === null ? null : { id: dragging.id, from: dragging.from }}
        documents={documents}
        dropTarget={dropTarget}
        index={index}
        thumbnails={thumbnails}
        onDeleteFolder={(id) => {
          const target = index.folders.find((entry) => entry.id === id);
          if (target === undefined) return;
          setDeleting({ kind: 'folder', id, name: target.name });
        }}
        onNewFolder={() => onNewFolder('New Folder')}
        onOpenFolder={onOpenFolder}
        onQueryChange={changeQuery}
        onRenameFolder={onRenameFolder}
        onSidebarResize={setSidebarWidth}
        onHome={landing}
        onViewChange={changeView}
        sharedVault={sharedVault}
        onOpenVault={(id) => {
          setSharedVault(id);
          setQuery('');
          changeView('shared');
        }}
        openFolder={openFolder}
        query={query}
        sidebarWidth={sidebarWidth}
        view={view}
      />

      <div className="library__main">
        <LibraryBar crumbs={crumbs} onNew={onNew} showsNew={showsProjects} />

        {/* A press on empty space starts a selection rectangle, only where there are projects;
            never over Settings or Learn, where a drag belongs to a slider or text selection. */}
        <main
          className="library__body"
          data-fills={showsSettings ? '' : undefined}
          onPointerDown={showsProjects || choosingLessons ? selection.onPointerDown : undefined}
          ref={body}
        >
          {/* Inside the page, not beside it: the page is a two-row grid and a third row would
              take the body's space. */}
          <WikiTip onOpen={wikiList} />
          {showsHome ? (
            <Landing
              go={{
                newProject: onNew,
                projects: home,
                to: (target) => {
                  setQuery('');
                  if (target.kind === 'settings') openSettings(target.tab);
                  else if (target.kind === 'learn') changeView('learn');
                  else if (target.kind === 'community') changeView('community');
                  else wikiList();
                },
              }}
              version={VERSION}
            />
          ) : showsProjects ? (
            <section aria-label={title} className="library__section">
              <header className="library__head">
                <h1>{title}</h1>
                <span className="library__count">
                  {!loaded ? '' : visible.length === 1 ? '1 project' : `${visible.length} projects`}
                </span>
              </header>

              {!loaded ||
              (visible.length === 0 &&
                settingsHits.length + wikiHits.length > 0) ? null : visible.length === 0 ? (
                <EmptyState
                  hasAny={documents.length > 0}
                  inFolder={folder !== null}
                  onNew={onNew}
                  searching={searching}
                />
              ) : (
                // biome-ignore lint/a11y/noStaticElementInteractions: arrow keys for the cards inside, which are focusable themselves
                <div
                  className="library__grid"
                  ref={grid}
                  onKeyDown={(event) => arrowThroughGrid(event, '.tile__face')}
                >
                  {visible.map((doc) => (
                    <DashboardCard
                      doc={doc}
                      dragging={dragging?.ids.includes(doc.id) === true}
                      leaving={leaving === doc.id}
                      onToggleSelected={() => selection.toggle(doc.id)}
                      selected={selection.selected.has(doc.id)}
                      key={doc.id}
                      {...(searching ? { location: locationOf(doc.id) } : {})}
                      {...(thumbnails[doc.id] === undefined
                        ? {}
                        : { thumbnail: thumbnails[doc.id] })}
                      onAction={(action, origin) => projectAction(action, doc, origin)}
                      drag={{
                        // A selected card takes the whole selection with it.
                        count: carriedWith(doc.id).length,
                        // Not the folder they are all already in.
                        accepts: (folderId) =>
                          carriedWith(doc.id).some((id) => folderOf(index, id) !== folderId),
                        onStart: () => {
                          setArrived(null);
                          setDragging({
                            id: doc.id,
                            ids: carriedWith(doc.id),
                            from: folderOf(index, doc.id),
                          });
                        },
                        onTarget: setDropTarget,
                        onDrop: (folderId) => {
                          setArrived({ id: doc.id, folder: folderId });
                          for (const id of carriedWith(doc.id)) dropProject(id, folderId);
                          selection.clear();
                        },
                        onEnd: () => {
                          // Kept until the folder has closed, so the project does not jump to the
                          // thumbnails row mid-animation.
                          window.setTimeout(() => setArrived(null), 360);
                          setDragging(null);
                          setDropTarget(undefined);
                        },
                      }}
                      onOpen={() => onOpen(doc.id)}
                      onRename={(name) => onRenameProject(doc.id, name)}
                    />
                  ))}
                </div>
              )}
              <SettingsHits hits={settingsHits} onOpen={openSettings} />
              <WikiHits hits={wikiHits} onOpen={wiki.open} />
            </section>
          ) : showsShared && sharedVault !== null ? (
            <SharedVault library={{ ...shared, documents }} vaultId={sharedVault} />
          ) : !showsSettings && !searching && view === 'contribute' ? (
            <ContributePage version={VERSION} />
          ) : !showsSettings && view === 'community' ? (
            <Community
              kind={communityKind}
              onKind={setCommunityKind}
              onSettings={() => openSettings('community')}
              runtime={plugins.runtime ?? undefined}
              stopped={plugins.stopped}
              query={learnSearch ? search.terms.join(' ') : ''}
            />
          ) : !showsSettings && view === 'learn' ? (
            <>
              <LessonsHome
                lessons={lessons}
                query={learnSearch ? search.terms.join(' ') : ''}
                {...learnCommunity}
              />
              {lessonList && (
                <LessonProjects
                  selected={selection.selected}
                  onToggleSelected={selection.toggle}
                  documents={lessonDocuments}
                  onAction={projectAction}
                  onOpen={onOpen}
                  onRename={onRenameProject}
                  thumbnails={thumbnails}
                />
              )}
            </>
          ) : (
            <PreferencesPage
              filter={settingsSearch ? terms : []}
              onChange={onPrefsChange}
              onTab={setSettingsTab}
              prefs={prefs}
              tab={settingsTab}
              version={VERSION}
            />
          )}
        </main>
        {selection.marquee !== null && (
          <div
            aria-hidden="true"
            className="library__marquee"
            style={{
              left: selection.marquee.left,
              top: selection.marquee.top,
              width: selection.marquee.right - selection.marquee.left,
              height: selection.marquee.bottom - selection.marquee.top,
            }}
          />
        )}
      </div>

      {/* `restoreFocusTo` is `null` on both: the element to restore is a card's or folder row's
          more-button, several components away. Wiring it needs a ref threaded up from there;
          until then focus falls to `<body>`. */}
      {moving !== null && (
        <MoveProjectDialog
          currentFolder={folderOf(index, moving.id)}
          doc={moving}
          index={index}
          onClose={() => setMoving(null)}
          onMove={(folderId) => {
            onMoveToFolder(moving.id, folderId);
            setMoving(null);
          }}
          restoreFocusTo={null}
        />
      )}
      {deleting !== null && (
        <ConfirmDialog
          confirmLabel="Delete"
          detail={
            deleting.kind === 'project'
              ? `“${deleting.doc.name}” will be permanently deleted from this device. This cannot be undone.`
              : `Projects inside “${deleting.name}” will return to Projects. The folder itself will be deleted.`
          }
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            if (deleting.kind === 'project') {
              const doc = deleting.doc;
              setLeaving(doc.id);
              // Let the card animate out; with reduced motion it goes at once.
              window.setTimeout(
                () => {
                  onAction('delete', doc);
                  setLeaving(null);
                },
                reducedMotion() ? 0 : LEAVE_MS,
              );
            } else onDeleteFolder(deleting.id);
            setDeleting(null);
          }}
          restoreFocusTo={null}
          title={deleting.kind === 'project' ? 'Delete project?' : 'Delete folder?'}
        />
      )}
      {sharing !== null && (
        <ShareDialog
          doc={sharing}
          onClose={() => setSharing(null)}
          onShared={shared.refresh}
          store={shared.store}
        />
      )}
    </div>
  );
}
