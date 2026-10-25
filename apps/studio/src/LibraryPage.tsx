/**
 * The start page's action wiring. `Dashboard.tsx` handles presentation; this handles what each
 * action does. Separate from `App.tsx`, since none of this touches the document.
 */

import type { Lessons } from '@bezier/lessons';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { DocumentInfo } from './boot.js';
import { useSharedLibrary } from './collab/use-shared-library.js';
import { Dashboard } from './Dashboard.js';
import type { AppPrefs } from './preferences.js';
import { saveBackup } from './project-backup.js';
import type { DashboardHandle } from './use-dashboard.js';
import type { LibraryHandle } from './use-library.js';
import type { TasksHandle } from './use-tasks.js';

export interface LibraryPageProps {
  dash: DashboardHandle;
  library: LibraryHandle;
  prefs: AppPrefs;
  settingsOpen: boolean;
  tasks: TasksHandle;
  onPrefsChange: (prefs: AppPrefs) => void;
  onSettingsOpenChange: (open: boolean) => void;
  /** Lessons, shown when the sidebar's Learn is chosen (`@bezier/lessons`). */
  lessons: Lessons;
  /** Changes when Lessons asks to be shown; the page switches to Learn. */
  learnRequest: number;
}

export function LibraryPage({
  dash,
  library,
  prefs,
  settingsOpen,
  tasks,
  onPrefsChange,
  onSettingsOpenChange,
  lessons,
  learnRequest,
}: LibraryPageProps) {
  const refresh = library.refresh;
  useEffect(() => {
    refresh();
  }, [refresh]);
  useSharedLibrary({ store: library.store, refresh });
  useEffect(() => {
    const workspace = document.querySelector<HTMLElement>('.workspace');
    if (workspace === null) return;
    const wasInert = workspace.inert;
    const ariaHidden = workspace.getAttribute('aria-hidden');
    workspace.inert = true;
    workspace.setAttribute('aria-hidden', 'true');
    return () => {
      workspace.inert = wasInert;
      if (ariaHidden === null) workspace.removeAttribute('aria-hidden');
      else workspace.setAttribute('aria-hidden', ariaHidden);
    };
  }, []);

  const exportProject = (doc: DocumentInfo) => {
    /**
     * Exporting from the library opens the project first: export writes the rebuilt body, and an
     * unopened document has never been rebuilt, so there is no geometry to write.
     */
    dash.openDocument(doc.id);
    tasks.notify({
      title: `Opened ${doc.name}`,
      detail: 'Choose a format from Export in the title bar.',
    });
  };

  return createPortal(
    <Dashboard
      documents={dash.documents}
      index={library.index}
      loaded={library.loaded}
      onAction={(action, doc) => {
        if (action === 'delete')
          void dash.deleteDocument(doc.id).then((deleted) => {
            if (deleted) tasks.notify({ title: `Project “${doc.name}” deleted`, tone: 'ok' });
          });
        else if (action === 'export') exportProject(doc);
        else if (action === 'duplicate') {
          library.duplicate(doc.id, `${doc.name} copy`);
          tasks.notify({ title: `Duplicated “${doc.name}”`, tone: 'ok' });
        } else if (action === 'backup') void saveBackup(library, tasks, doc);
        else if (action === 'save-as-project')
          void dash.saveAsProject(doc.id).then((saved) => {
            if (saved)
              tasks.notify({
                title: `“${doc.name}” saved as a project`,
                detail: 'It is in All Projects. The lesson keeps its own.',
                tone: 'ok',
              });
          });
      }}
      onDeleteFolder={library.deleteFolder}
      onMoveToFolder={library.moveToFolder}
      onNew={dash.newDocument}
      onNewFolder={library.newFolder}
      onOpen={dash.openDocument}
      onOpenFolder={library.setOpenFolder}
      onPrefsChange={onPrefsChange}
      onRenameFolder={library.renameFolder}
      onRenameProject={library.renameProject}
      onSettingsOpenChange={onSettingsOpenChange}
      openFolder={library.openFolder}
      thumbnails={library.thumbnails}
      prefs={prefs}
      settingsOpen={settingsOpen}
      learnRequest={learnRequest}
      lessons={lessons}
      shared={{ store: library.store, open: dash.openDocument, refresh: library.refresh }}
    />,
    document.body,
  );
}
