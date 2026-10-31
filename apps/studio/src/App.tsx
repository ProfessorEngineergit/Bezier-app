/**
 * The app shell: assembles the packages into viewport, rails and drawers. No geometry logic lives
 * here (ADR 0004); every document edit goes through `Session.apply`.
 */

import { type FeatureId, formatRef, getFeature, type StableRef } from '@bezier/core';
import type { EdgeFrame, ShownSketch } from '@bezier/renderer';
import type { Sketch } from '@bezier/solver';
import {
  CATEGORIES,
  type CategoryId,
  DEFAULT_VIEW_SETTINGS,
  leftRailFor,
  resolveKeymap,
  setActiveKeymap,
  type ViewSettings,
  Workspace,
} from '@bezier/ui';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Isolated } from './Isolated.js';
import { nextFilter, type SelectionFilter } from './selection-filter.js';
import type { TasksHandle } from './use-tasks.js';
import { ExtraWorkspaces } from './workspaces/ExtraWorkspaces.js';
import { type StudioMode, WORKSPACES } from './workspaces/WorkspaceModes.js';
import './workspaces/workspaces.css';
import { ContactPrompt } from './ContactPrompt.js';
import { useCollabProject } from './collab/use-collab-project.js';
import { EdgeGizmo } from './EdgeGizmo.js';
import { EdgeTreatmentEditor } from './EdgeTreatmentEditor.js';
import { EditorOverlays } from './EditorOverlays.js';
import { FaceExtrusion } from './FaceExtrusion.js';
import { faceToolTarget } from './face-tool-target.js';
import { FeatureInspector, PickedRefs } from './Inspector.js';
import { ItemsPanel } from './ItemsPanel.js';
import { inspectionMode, toggleSection } from './inspection-mode.js';
import { useKernelWarmUp } from './kernel-warm-up.js';
import { LibraryOverlay } from './LibraryOverlay.js';
import { useLessons } from './lessons-host.js';
import { allowedWhileBuilding, lockRail, MODEL_BUSY_MESSAGE, useModelLock } from './model-lock.js';
import { Notices } from './Notices.js';
import { noteView } from './occupied-space.js';
import {
  QUICK_SETTINGS,
  RightViewPanel,
  rightRailFor,
  useQuickSettings,
  viewTabsFor,
} from './Panels.js';
import { ProjectChrome } from './ProjectChrome.js';
import { projectFaceEdges, startMove } from './rail-actions.js';
import { ReportButton } from './report/ReportButton.js';
import { SceneInspection } from './SceneInspection.js';
import { SelectionControls } from './SelectionControls.js';
import { SketchActionBar } from './SketchActionBar.js';
import { SketchAreaOffer } from './SketchAreaOffer.js';
import { SketchPlanePanel, surfaceLabel } from './SketchPlanePanel.js';
import { type Said, sameSaid, spoken } from './said.js';
import type { Session, SessionDeps, SessionView } from './session.js';
import {
  activateSimulation,
  simulationActiveId,
  simulationRail,
} from './simulation/SimulationRail.js';
import { SimulationWorkspace } from './simulation/SimulationWorkspace.js';
import { useSimulation } from './simulation/use-simulation.js';
import { squareView } from './square-view.js';
import { TransformControls } from './TransformControls.js';
import { useActivity } from './use-activity.js';
import { areaPicked, bodiesPicked, useBodies } from './use-bodies.js';
import { useBodyFolders } from './use-body-folders.js';
import { useBootstrap } from './use-bootstrap.js';
import { useCancelBuild } from './use-cancel-build.js';
import { useDashboard } from './use-dashboard.js';
import { useEngineRestart } from './use-engine-restart.js';
import { useExport } from './use-export.js';
import { useGeometry } from './use-geometry.js';
import { useGoHome, useHomeWhileIdle } from './use-go-home.js';
import { useHistory } from './use-history.js';
import { useHole } from './use-hole.js';
import { useItemsWidth } from './use-items-width.js';
import { useLibrary } from './use-library.js';
import { useLoftSweep } from './use-loft-sweep.js';
import { usePrefs } from './use-prefs.js';
import { useProject } from './use-project.js';
import { usePutDown } from './use-put-down.js';
import { useQualityRebuild } from './use-quality.js';
import { useReferences } from './use-reference-images.js';
import { useRun } from './use-run.js';
import { useSelection } from './use-selection.js';
import { useSettingsReturn } from './use-settings-return.js';
import { useShortcuts } from './use-shortcuts.js';
import { useSketchCommands } from './use-sketch-commands.js';
import { useSketchMode } from './use-sketch-mode.js';
import { useVariables } from './use-variables.js';
import { useViewportSettings } from './use-viewport-settings.js';
import { useWindowRequests } from './use-window-requests.js';
import { useWorkspaceGuard } from './use-workspace-guard.js';
import { VariablesPanel } from './VariablesPanel.js';
import { ViewCube } from './ViewCube.js';
import { Viewport, type ViewportHandle } from './Viewport.js';

/** A world-space point, in millimetres. */
type Vec3 = { x: number; y: number; z: number };

const CATEGORY_IDS: readonly string[] = Object.keys(CATEGORIES);
/** Nothing on show; one shared list so the viewport is not told twice. */
const NO_SHOWN: readonly ShownSketch[] = [];

export function App() {
  const sessionRef = useRef<Session | null>(null);
  const depsRef = useRef<SessionDeps | null>(null);
  const [view, setView] = useState<SessionView | null>(null);
  const [notices, setNotices] = useState<readonly Said[]>([]);
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [drawer, setDrawer] = useState<'items' | null>(null);
  const [itemsWidth, setItemsWidth] = useItemsWidth();
  const [selectedFeature, setSelectedFeature] = useState<FeatureId | null>(null);
  const [selectedRefs, setSelectedRefs] = useState<readonly StableRef[]>([]);
  const [gizmoAnchor, setGizmoAnchor] = useState<Vec3 | null>(null);
  const [gizmoFrame, setGizmoFrame] = useState<EdgeFrame | null>(null);
  const [moveMode, setMoveMode] = useState(false);
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<readonly Vec3[]>([]);
  const measuredGeometry = useRef(view?.display);
  useEffect(() => {
    if (measuredGeometry.current !== view?.display) {
      measuredGeometry.current = view?.display;
      setMeasurePoints([]);
    }
  }, [view?.display]);
  const [fitSignal, setFitSignal] = useState(0);
  const [settings, setSettings] = useState<ViewSettings>(DEFAULT_VIEW_SETTINGS);
  const { prefs, setPrefs, prefsOpen, setPrefsOpen } = usePrefs();
  const viewportRef = useRef<ViewportHandle | null>(null);
  const [busy, setBusy] = useState(true);
  const { lock: modelLock, showing: modelBusy } = useModelLock();
  const [fatal, setFatal] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [workspace, setWorkspace] = useState<StudioMode>(prefs.startupWorkspace);
  const quick = useQuickSettings(workspace);
  /** The Simulation study browser. Closed by default so it never covers the canvas unasked. */
  const [studyBrowser, setStudyBrowser] = useState(false);
  /** Shows a message once; repeats would stack up and shift the canvas. */
  const say = useCallback((message: string | Said) => {
    const said = spoken(message);
    setNotices((all) => (all.some((known) => sameSaid(known, said)) ? all : [...all, said]));
  }, []);

  // The dashboard reaches the task bar through this ref before the project hook exists.
  const tasksRef = useRef<TasksHandle | null>(null);
  const dash = useDashboard({ depsRef, sessionRef, tasksRef, say, setView, setBusy });
  const library = useLibrary({ depsRef, say, setDocuments: dash.setDocuments });
  const { lessons, learnRequest, openAsProject } = useLessons({
    sessionRef,
    viewportRef,
    depsRef,
    view,
    setView,
    setWorkspace,
    openProjects: dash.setDashboardOpen,
    refreshProjects: library.refresh,
  });

  const closeSettings = useSettingsReturn(
    prefsOpen,
    setPrefsOpen,
    dash.dashboardOpen,
    dash.setDashboardOpen,
  );

  const cancelBuild = useCancelBuild(depsRef, modelLock);
  const goHome = useGoHome({
    depsRef,
    openProjects: dash.setDashboardOpen,
    refresh: library.refresh,
    sessionRef,
    viewportRef,
  });
  /** Finishes the sketch being drawn, if there is one. Set below, once sketch mode exists. */
  const leaveSketch = useRef<() => boolean>(() => false);
  /** What leaving a project asks about a model still loading; set once the project hook exists. */
  const importState = useRef({ importing: false, cancel: () => {} });
  const goHomeWhileIdle = useHomeWhileIdle({
    goHome,
    cancelOpening: dash.cancelOpening,
    lessons,
    lock: modelLock,
    leaveSketch,
    importing: () => importState.current.importing,
    cancelImport: () => importState.current.cancel(),
    keepProject: () => {
      if (sessionRef.current) sessionRef.current.expecting = true;
    },
  });

  const scrollSeen = useViewportSettings(viewportRef, prefs, view, measureMode);
  /** Where a slow change shows its progress; set once the project hook exists. */
  const run = useRun({ sessionRef, tasksRef, lock: modelLock, setBusy, setView, say });
  useBootstrap({
    depsRef,
    setNotices,
    replaceNotices: setNotices,
    setDocuments: dash.setDocuments,
    setBusy,
    setFatal,
    engineRestartRef: useEngineRestart(depsRef, sessionRef, run),
  });

  useKernelWarmUp(depsRef, !dash.dashboardOpen);
  // Read during render: the app renders again once boot has set the deps.
  useQualityRebuild(depsRef, depsRef.current !== null, prefs, workspace === 'visualize', run);
  const project = useProject({ run, lock: modelLock, depsRef, onImageAdded: setSelectedFeature });
  importState.current = {
    importing: project.tasks.tasks.some((task) => task.label.startsWith('Importing')),
    cancel: project.cancelImport,
  };
  tasksRef.current = project.tasks;

  // Browser tests wait for changes to finish through this attribute. Set before paint, with the
  // render it belongs to, so a fast-opening project never shows a frame still marked busy.
  useLayoutEffect(() => {
    window.document.documentElement.toggleAttribute('data-busy', busy);
  }, [busy]);
  const loftSweep = useLoftSweep(run, view, selectedFeature, selectedRefs, say);
  const bodies = useBodies({
    run,
    view,
    sessionRef,
    selectedRefs,
    setSelectedRefs,
    setSelectedFeature,
    say,
  });
  // Read through a ref so the rail handler is not rebuilt on every pick.
  const bodiesRef = useRef(bodies);
  bodiesRef.current = bodies;
  /** The cube side last looked from, for Space. Top until one is picked. */
  const [filter, setFilter] = useState<SelectionFilter>('any');
  const [variablesOpen, setVariablesOpen] = useState(false);
  /** Where the last click landed on the model, for commands placed by a click (Hole). */
  const lastPickPoint = useRef<{ x: number; y: number; z: number } | null>(null);
  const keymap = useMemo(
    () => resolveKeymap(prefs.keymap.preset, prefs.keymap.overrides),
    [prefs.keymap],
  );
  setActiveKeymap(keymap);

  const mode = useSketchMode({
    category,
    setCategory,
    view,
    sessionRef,
    viewportRef,
    selectedRefs,
    selectedFeature,
    run,
    say,
    gridStep: settings.gridLock,
    solver: () => depsRef.current?.solver ?? null,
  });
  const { sketch, cancelOffer } = mode;
  const sketchCommands = useSketchCommands({
    sketch,
    basis: mode.surface?.basis ?? null,
    pickTool: mode.pickTool,
    sectionOutline: (basis) => sessionRef.current?.sectionOutline(basis) ?? null,
    say,
  });
  leaveSketch.current = mode.exitIfDrawing;
  // A stable ref avoids re-registering the key listener for every drawn point.
  const sketchRef = useRef(sketch);
  sketchRef.current = sketch;

  const {
    addFillet,
    addRevolve,
    addShell,
    changeParam,
    patchParams,
    renameFeature,
    removeFeature,
    setSuppressed,
    applyEdgeGizmo,
    previewEdgeGizmo,
    extrudeSketch,
    extrudeSketchById,
    previewExtrudeSketch,
  } = useGeometry({
    run,
    selectedRefs,
    activePlane: mode.surface?.plane ?? null,
    railTarget: mode.railTarget,
    sessionRef,
    setView,
    setSelectedRefs,
    checkContacts: bodies.checkContacts,
    say,
    showPart: (part) => viewportRef.current?.showPartPreview(part, part?.replaces),
  });
  const addHole = useHole({
    run,
    selectedRefs,
    lastPoint: lastPickPoint,
    say,
    onCreated: setSelectedFeature,
  });

  const { pick, selectBody, selectAll, deselectAll } = useSelection({
    view,
    viewportRef,
    measureMode,
    setMeasurePoints,
    selectedRefs,
    setSelectedRefs,
    setGizmoAnchor,
    setGizmoFrame,
    setMoveMode,
  });

  useWindowRequests(dash.openDocument);
  const documentId = sessionRef.current?.id ?? '';
  useActivity(sessionRef.current, workspace);
  // A shared project: live edits, presence, view-only (collab/).
  useCollabProject({
    sessionId: dash.dashboardOpen || view === null ? null : documentId,
    ...{ sessionRef, depsRef, tasks: project.tasks, run, open: dash.openDocument },
  });
  usePutDown(documentId, () => {
    deselectAll();
    setSelectedFeature(null);
    mode.reset();
    setCategory(null);
    setMeasureMode(false);
    setMeasurePoints([]);
    setSettings((current) => ({ ...current, section: null }));
  });

  const simulating = workspace === 'simulation';
  const sim = useSimulation({
    documentId,
    view,
    handleRef: viewportRef,
    active: simulating,
    viewSettings: settings,
  });

  /**
   * Switches between Design and Simulation. Pending Design state (a half-placed extrude, a
   * measurement, a selection) is cleared first, since it means nothing in the other workspace.
   */
  const switchWorkspace = useCallback(
    (id: string) => {
      setCategory(null);
      setMeasureMode(false);
      setMeasurePoints([]);
      setMoveMode(false);
      mode.setOffer(null);
      setSelectedFeature(null);
      setDrawer((old) => (old === 'items' ? 'items' : null));
      deselectAll();
      setWorkspace(id as StudioMode);
    },
    [deselectAll, mode.setOffer],
  );
  const changeWorkspace = useWorkspaceGuard(
    (view?.bodies ?? []).reduce((n, body) => n + body.faces.length, 0),
    documentId,
    switchWorkspace,
  );

  const stepHistory = useHistory({
    sessionRef,
    sketchRef,
    setView,
    setBusy,
    lock: modelLock,
    say,
    clearSelection: deselectAll,
  });

  /**
   * Handles a rail button: categories swap the middle band, drawers toggle, and commands with
   * geometry behind them run. Disabled buttons never reach here.
   */
  const activateLeft = useCallback(
    (id: string) => {
      // Also checked here, not only in `run`: a shortcut bypasses the rail's disabled buttons, and
      // entering a mode (Sketch, Move) starts a change before `run` is called.
      if (modelLock.held && !allowedWhileBuilding(id)) {
        tasksRef.current?.notify({ title: MODEL_BUSY_MESSAGE });
        return;
      }
      if (CATEGORY_IDS.includes(id)) {
        setMeasureMode(false);
        setMeasurePoints([]);
        // Sketch starts a new sketch and, pressed again, finishes it. Reopening one is `mode.edit`.
        if (id === 'sketch') return category === 'sketch' ? mode.exit() : mode.enter();
        setCategory((current) => (current === id ? null : (id as CategoryId)));
        return;
      }
      if (id === 'exit') return mode.exit();
      if (id === 'sketch-delete') return sketch.deleteSelected();
      if (id === 'sketch-construction') return sketch.toggleConstructionSelected();
      if (id === 'project')
        return projectFaceEdges(mode.surface?.face ?? null, sessionRef.current, sketch, say);
      if (id === 'visualization' || id === 'drawings') return; // disabled
      if (id === 'items') return setDrawer((d) => (d === 'items' ? null : 'items'));
      if (id === 'section') {
        setCategory(null);
        const centre = viewportRef.current?.contentCenter();
        setSettings((current) => ({
          ...current,
          section: toggleSection(current.section, centre?.z),
        }));
        return;
      }
      if (id === 'measure') {
        setCategory(null);
        setMeasureMode((on) => !on);
        setMeasurePoints([]);
        setMoveMode(false);
        mode.setOffer(null);
        // Clear the selection: a gizmo on it would show its own millimetres next to the
        // measurement.
        setSelectedRefs([]);
        setGizmoAnchor(null);
        setGizmoFrame(null);
        return;
      }
      if (sketchCommands.run(id)) return;
      if (id === 'fillet') return addFillet();
      if (id === 'shell') return addShell();
      if (id === 'hole') return addHole();
      if (bodiesRef.current.command(id)) return;
      if (id === 'file') return project.transfer.pickFile();
      if (id === 'extrude') {
        // With a drawing to extrude, the command opens the gizmo on it and builds nothing yet.
        if (mode.offer !== null || mode.offerOnShow()) return;
        return extrudeSketch(selectedRefs);
      }
      if (id === 'revolve') return addRevolve();
      if (id === 'loft' || id === 'sweep' || id === 'wrap') return loftSweep(id);
      if (id === 'move-rotate')
        startMove({
          moveMode,
          setMoveMode,
          selectedRefs,
          mode,
          setSelectedFeature,
          view,
          selectedFeature,
          say,
        });
    },
    // `category` decides whether Sketch starts or finishes a drawing, so it must be a dependency.
    [
      addFillet,
      addRevolve,
      loftSweep,
      addShell,
      addHole,
      extrudeSketch,
      mode,
      moveMode,
      project.transfer,
      modelLock,
      selectedFeature,
      selectedRefs,
      view,
      say,
      sketch,
      sketchCommands,
      category,
    ],
  );

  useShortcuts({
    activateLeft,
    category,
    cancelOffer,
    inactive: dash.dashboardOpen,
    workspace,
    onSketchCommand: (id) => {
      if (workspace !== 'design') changeWorkspace('design');
      activateLeft(id);
    },
    measureMode,
    prefsOpen,
    setMeasureMode,
    setMeasurePoints,
    setPrefsOpen,
    onCloseSettings: closeSettings,
    sketchRef,
    onDeselect: () => {
      const had = selectedRefs.length > 0 || selectedFeature !== null || moveMode;
      deselectAll();
      return had;
    },
    onDuplicate: () => bodiesRef.current.duplicate(),
    // The selection went with it, so the move arrows and edge handle must not linger.
    onDelete: () => {
      if (bodiesRef.current.deleteSelection(selectedFeature, removeFeature)) deselectAll();
    },
    onSelectAll: selectAll,
    onStepHistory: stepHistory,
    onHome: goHomeWhileIdle,
    cancelBuild,
    keymap,
    onCombine: (operation) => bodiesRef.current.addCombine(operation),
    onView: (view) => viewportRef.current?.setView(view, settings.animateCamera),
    // Over a flat face Space also starts a sketch on it, unless one is open already.
    onSquareView: () =>
      squareView(
        viewportRef.current,
        settings.animateCamera,
        category === 'sketch' ? undefined : (face) => void mode.sketchOn(face),
      ),
    onZoomFit: () => setFitSignal((n) => n + 1),
    onFilterCycle: () => setFilter((current) => nextFilter(current)),
    onVariables: () => setVariablesOpen((open) => !open),
    onWorkspaceIndex: (index) => {
      const target = WORKSPACES[index];
      if (target !== undefined) changeWorkspace(target.id);
    },
  });

  const changeSettings = useCallback((patch: Partial<ViewSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  // Bridge between declarative settings state and the imperative viewport API.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    viewport.setDisplayMode(settings.display);
    viewport.setEdgesVisible(settings.showEdges);
    viewport.setGridVisible(settings.showGrid);
    viewport.setGridPlane(settings.gridPlane);
    viewport.setAxesVisible(settings.showAxes);
    viewport.setFieldOfView(settings.fieldOfView);
    viewport.setSection(settings.section);
  }, [settings]);

  // What DXF and SVG write: the sketch open for drawing, else the one selected.
  const sketchExport = useRef<{ name: string; sketch: Sketch } | null>(null);
  const selectedSketch = view?.document.features.find(
    (f) => f.id === selectedFeature && f.type === 'sketch',
  );
  sketchExport.current =
    category === 'sketch' && sketch.draft.primitives.length > 0
      ? { name: 'Sketch', sketch: sketch.draft }
      : selectedSketch !== undefined
        ? { name: selectedSketch.name, sketch: selectedSketch.params.sketch as Sketch }
        : null;
  const exportModel = useExport({ sessionRef, tasks: project.tasks, sketchRef: sketchExport });
  const variables = useVariables(view?.document ?? null, run);
  const { references, images } = useReferences(view?.document ?? null);
  noteView(view);
  const bodyFolders = useBodyFolders(view?.document ?? null, view?.bodies ?? [], run);

  // Keep the Dock and Window menu title in sync with the open project.
  const openName = dash.opening?.name ?? view?.document.meta.name;
  useEffect(() => {
    if (!dash.dashboardOpen) window.document.title = `Bezier / ${openName ?? 'Untitled'}`;
  }, [dash.dashboardOpen, openName]);

  if (fatal !== null) {
    return (
      <main className="workspace workspace--fatal">
        <h1>Bezier could not start</h1>
        <p>{fatal}</p>
      </main>
    );
  }
  const document = view?.document ?? null;
  const feature = document?.features.find((f) => f.id === selectedFeature) ?? null;
  const definition = feature === null ? undefined : getFeature(feature.type);
  const selectedPicture = feature?.type === 'reference-image' ? feature : undefined;
  // Pressing a picture selects it; pressing empty space deselects.
  const pickImage = (id: string | null) => {
    if (id !== null) {
      deselectAll();
      setSelectedFeature(id);
    } else if (selectedPicture !== undefined) setSelectedFeature(null);
  };

  const guard = category === 'sketch' ? surfaceLabel(mode.surface) : undefined;

  const planePicking = category === 'sketch' && mode.surface === null;
  // A flyout hides rail labels; a mode keeps them, since the rail is the mode's toolbar. Sketch is
  // a mode too.
  const railLabelsVisible = prefs.showLabels && (category === null || category === 'sketch');
  const { extrudeRef, edgeTreatment } = faceToolTarget(moveMode, selectedRefs, document);
  const activeSketchTool = sketchCommands.activeCommand;
  const activeInspection = inspectionMode(measureMode, settings.section);
  const showModelItems = workspace !== 'drawings' && !simulating && drawer === 'items';

  return (
    <Workspace
      activeLeftId={
        simulating
          ? simulationActiveId(sim, studyBrowser)
          : (activeSketchTool ??
            category ??
            activeInspection ??
            (drawer === 'items' ? 'items' : null))
      }
      activeRightId={quick.tab === null ? null : QUICK_SETTINGS}
      leftGroups={
        !['design', 'simulation'].includes(workspace)
          ? []
          : simulating
            ? simulationRail(sim)
            : modelBusy
              ? lockRail(
                  leftRailFor(category, guard, settings.section !== null, sketchCommands.chosen),
                )
              : leftRailFor(category, guard, settings.section !== null, sketchCommands.chosen)
      }
      leftLabels={simulating ? prefs.showLabels : railLabelsVisible}
      showPerformance={prefs.showPerformance}
      onTogglePerformance={() => setPrefs({ ...prefs, showPerformance: !prefs.showPerformance })}
      leftPanel={simulating ? studyBrowser : drawer === 'items'}
      onActivateLeft={
        simulating
          ? (id) => activateSimulation(id, sim, () => setStudyBrowser((open) => !open))
          : activateLeft
      }
      onActivateRight={quick.activate}
      dropping={project.transfer.dropping}
      onExport={() => setExportOpen((open) => !open)}
      titleTrailing={<ReportButton handleRef={viewportRef} view={view} workspace={workspace} />}
      onHome={goHomeWhileIdle}
      onRename={project.rename}
      overlay={
        <ProjectChrome
          exportOpen={exportOpen}
          notices={project.tasks.notices}
          onCloseExport={() => setExportOpen(false)}
          onDismiss={project.tasks.dismiss}
          onExport={(format, onlySelected) =>
            void exportModel(
              format,
              onlySelected
                ? bodiesPicked(view?.bodies ?? [], selectedRefs).flatMap((body) => body.faces)
                : null,
            )
          }
          selectedBodies={bodiesPicked(view?.bodies ?? [], selectedRefs).length}
          hasSketch={sketchExport.current !== null}
        />
      }
      projectName={dash.opening?.name ?? document?.meta.name ?? 'Untitled Project'}
      rightGroups={rightRailFor(workspace)}
      // While Nib is on he shows running work; showing it here as well would duplicate it.
      tasks={prefs.nib === 'off' ? project.tasks.tasks : []}
      toasts={prefs.nib === 'off'}
      onWorkspaceChange={changeWorkspace}
      workspace={workspace}
      workspaces={WORKSPACES}
    >
      <Viewport
        documentId={documentId}
        openView={prefs.openView}
        measuring={measureMode}
        fitSignal={fitSignal}
        geometry={view?.display ?? null}
        bodies={view?.bodies}
        handleRef={viewportRef}
        onPick={(ref, additive, point) => {
          // In Simulation a click on a face places or edits a support or load.
          if (simulating) {
            sim.pickFace(ref);
            return;
          }
          // Reached only when the click missed the profile (the viewport returns early on a hit),
          // so any standing offer has just been declined by clicking somewhere else.
          mode.setOffer(null);
          // With the Bodies filter a click takes the whole part it lands on.
          if (filter === 'bodies' && ref !== null) {
            const [body] = bodiesPicked(view?.bodies ?? [], [ref]);
            if (body !== undefined) {
              bodies.itemsProps.onSelectBody(body.key, additive);
              return;
            }
          }
          lastPickPoint.current = ref === null ? null : point;
          setSelectedFeature(null);
          pick(ref, additive, point);
        }}
        onAreaSelect={(faces, additive) =>
          setSelectedRefs(areaPicked(filter, view?.bodies ?? [], selectedRefs, faces, additive))
        }
        onPickPlane={mode.pickPlane}
        onPickFace={mode.pickFace}
        onSelectBody={
          simulating
            ? sim.pickBody
            : (ref, additive) => {
                setSelectedFeature(null);
                selectBody(ref, additive);
              }
        }
        onSketchClick={sketchCommands.click}
        onSketchLineLength={sketch.changeLineLength}
        onSketchCircleRadius={sketch.changeCircleRadius}
        onSketchConstraintValue={sketch.changeConstraintValue}
        onSketchConstraintRemove={sketch.removeConstraint}
        onSketchAngleChange={sketch.changeAngle}
        onSketchMove={sketch.move}
        sketchGrip={sketch.grip}
        {...(!busy && !simulating && category !== 'sketch'
          ? { onSketchAreaClick: mode.offerArea }
          : {})}
        picking={filter === 'edges' ? 'edge' : filter === 'any' ? 'any' : 'face'}
        planePicking={planePicking}
        selected={simulating ? sim.selectedRefs : selectedRefs}
        sketchDraft={category === 'sketch' ? sketch.draft : null}
        shownSketches={simulating ? NO_SHOWN : mode.shown}
        references={references}
        images={images}
        onImagePick={pickImage}
        sketchPending={sketch.pending}
        sketchSnap={sketch.snap}
        sketchPlane={category === 'sketch' ? (mode.surface?.basis ?? null) : null}
        sketchDefined={sketch.defined}
        sketchFlags={sketch.flags}
        sketchSelected={sketch.selected}
        sketchTool={sketch.tool}
      />
      {(workspace === 'design' || simulating) && (
        <ViewCube
          animate={settings.animateCamera}
          handleRef={viewportRef}
          {...(category === 'sketch' ? { onSketchPlane: mode.pickPlane } : {})}
        />
      )}

      {/* The quick settings: one panel, its sections as tabs, in a frame that stays put. */}
      {quick.tab !== null && (
        <RightViewPanel
          active={quick.tab}
          scope={workspace === 'design' || simulating ? 'model' : 'app'}
          tabs={viewTabsFor(workspace)}
          onTab={quick.setTab}
          changeSettings={changeSettings}
          onClose={quick.close}
          savedViews={view?.document.meta.savedViews ?? []}
          run={run}
          setFitSignal={setFitSignal}
          settings={settings}
          viewportRef={viewportRef}
          theme={prefs.theme}
          onTheme={(theme) => setPrefs({ ...prefs, theme })}
          detail={prefs.detail}
          onDetail={(detail) => setPrefs({ ...prefs, detail })}
          smoothness={prefs.smoothness}
          onSmoothness={(smoothness) => setPrefs({ ...prefs, smoothness })}
          scrollDevice={prefs.navigation.scrollDevice}
          scrollSeen={scrollSeen}
          onScrollDevice={(scrollDevice) =>
            setPrefs({ ...prefs, navigation: { ...prefs.navigation, scrollDevice } })
          }
        />
      )}

      {simulating && (
        <Isolated name="Simulation">
          <SimulationWorkspace
            browserOpen={studyBrowser}
            handleRef={viewportRef}
            itemsWidth={itemsWidth}
            onItemsWidth={setItemsWidth}
            onOpenDrawings={() => changeWorkspace('drawings')}
            projectName={view?.document.meta.name ?? 'Untitled'}
            sim={sim}
          />
        </Isolated>
      )}

      {/* Transforms own the interaction while open, the edge's fillet handle included. */}
      {!moveMode &&
        gizmoAnchor !== null &&
        selectedRefs.length === 1 &&
        selectedRefs[0]?.kind === 'edge' && (
          <EdgeGizmo
            anchor={gizmoAnchor}
            frame={gizmoFrame}
            handleRef={viewportRef}
            onApply={applyEdgeGizmo}
            onDismiss={() => {
              viewportRef.current?.showPartPreview(null);
              void sessionRef.current?.endPartPreview();
              setGizmoAnchor(null);
              setGizmoFrame(null);
              setSelectedRefs([]);
            }}
            onPreview={previewEdgeGizmo}
          />
        )}

      {/* The offer on a clicked profile: nothing is built until the drag sets a distance, and
          Escape leaves the document unchanged. */}
      {mode.offer !== null && (
        <SketchAreaOffer
          offer={mode.offer}
          onChange={mode.setOffer}
          canCombine={(view?.bodies.length ?? 0) > 0}
          handleRef={viewportRef}
          onCommit={extrudeSketchById}
          onPreview={previewExtrudeSketch}
        />
      )}

      {extrudeRef !== null && edgeTreatment !== undefined && (
        <EdgeTreatmentEditor
          key={edgeTreatment.id}
          feature={edgeTreatment}
          onRemoved={deselectAll}
          face={extrudeRef}
          handleRef={viewportRef}
          sessionRef={sessionRef}
          run={run}
          setView={setView}
        />
      )}
      {/* One extrude gizmo at a time: a clicked sketch area outranks the face it was drawn on. */}
      {extrudeRef !== null && edgeTreatment === undefined && mode.offer === null && (
        <FaceExtrusion
          key={formatRef(extrudeRef)}
          face={extrudeRef}
          point={lastPickPoint.current}
          handleRef={viewportRef}
          sessionRef={sessionRef}
          run={run}
          setView={setView}
          onPulled={bodies.checkContacts}
        />
      )}

      {/* Transforms own the interaction while open; face tools stay out of the way. */}
      {moveMode && (
        <TransformControls
          sketch={selectedSketch}
          picture={selectedPicture}
          onPatch={patchParams}
          view={view}
          selectedRefs={selectedRefs}
          onSelectionChange={setSelectedRefs}
          onClose={() => setMoveMode(false)}
          handleRef={viewportRef}
          sessionRef={sessionRef}
          run={run}
          setView={setView}
          onMoved={bodies.checkContacts}
          say={say}
        />
      )}

      <ContactPrompt {...bodies.contactProps} handleRef={viewportRef} />
      <SelectionControls
        filter={filter}
        onClearFilter={() => setFilter('any')}
        sketching={category === 'sketch'}
        sketch={sketch}
      />

      <SceneInspection
        settings={settings}
        measuring={measureMode}
        points={measurePoints}
        view={view}
        handleRef={viewportRef}
        onSection={(section) => setSettings((current) => ({ ...current, section }))}
        setPoints={setMeasurePoints}
        onClose={() => setMeasureMode(false)}
        selected={selectedRefs}
        sessionRef={sessionRef}
      />

      <Notices
        notices={workspace === 'design' ? notices : []}
        onDismiss={(notice) => setNotices((all) => all.filter((item) => !sameSaid(item, notice)))}
      />

      {showModelItems && document !== null && view !== null && (
        <ItemsPanel
          features={document.features}
          onDelete={(id) => {
            if (selectedFeature === id) setSelectedFeature(null);
            removeFeature(id);
          }}
          onEditSketch={mode.edit}
          {...bodies.itemsProps}
          onSelectBody={(key, additive) => {
            setSelectedFeature(null);
            bodies.itemsProps.onSelectBody(key, additive);
          }}
          onSelectBodies={(keys, additive) => {
            setSelectedFeature(null);
            bodies.itemsProps.onSelectBodies(keys, additive);
          }}
          bodyFolders={bodyFolders.folders}
          onBodyFolder={bodyFolders.onFolder}
          onBodyFolderVisible={bodyFolders.onFolderVisible}
          onIsolateBody={bodyFolders.onIsolate}
          onBodiesVisible={bodyFolders.onBodiesVisible}
          showHistory={prefs.showHistory}
          only={workspace === 'visualize' ? 'bodies' : undefined}
          onRename={renameFeature}
          onToggleSuppressed={setSuppressed}
          statuses={view.statuses}
          shownSketches={new Set(mode.shown.map((item) => item.id))}
          onSelect={(id) => {
            deselectAll();
            setSelectedFeature(id);
          }}
          onWidthChange={setItemsWidth}
          selectedId={selectedFeature}
          width={itemsWidth}
        />
      )}

      {category === 'sketch' && sketchCommands.action !== null && (
        <SketchActionBar
          action={sketchCommands.action}
          onApply={sketch.applyEdit}
          onClose={sketchCommands.closeAction}
          placeAt={sketchCommands.textAt}
          selected={sketch.selected}
          sketch={sketch.draft}
        />
      )}
      {category === 'sketch' &&
        mode.surface !== null &&
        feature === null &&
        sketch.selected.length === 0 &&
        sketchCommands.action === null && (
          <SketchPlanePanel
            freedom={sketch.freedom}
            onChange={mode.setSurface}
            surface={mode.surface}
          />
        )}
      {!moveMode && (
        <FeatureInspector
          definition={definition}
          feature={feature}
          features={document?.features ?? []}
          onChangeParam={changeParam}
          onClose={() => setSelectedFeature(null)}
          onPatch={patchParams}
          viewportRef={viewportRef}
          variables={variables}
        />
      )}

      {variablesOpen && !dash.dashboardOpen && (
        <VariablesPanel
          list={document?.meta.variables ?? []}
          onClose={() => setVariablesOpen(false)}
          variables={variables}
        />
      )}

      {!moveMode && prefs.showReferences && (
        <PickedRefs refs={selectedRefs} quiet={extrudeRef !== null} />
      )}
      <ExtraWorkspaces
        mode={workspace}
        selectedRefs={selectedRefs}
        onSelectBody={bodies.itemsProps.onSelectBody}
        view={view}
        sessionRef={sessionRef}
        itemsOpen={drawer === 'items'}
        itemsWidth={itemsWidth}
        onItemsWidth={setItemsWidth}
        onItemsToggle={() => setDrawer((old) => (old === 'items' ? null : 'items'))}
      />
      <EditorOverlays lessons={lessons} open={openAsProject} say={say} selected={selectedRefs} />
      <LibraryOverlay
        open={dash.dashboardOpen}
        dash={dash}
        learnRequest={learnRequest}
        lessons={lessons}
        library={library}
        onPrefsChange={setPrefs}
        onSettingsOpenChange={setPrefsOpen}
        prefs={prefs}
        settingsOpen={prefsOpen}
        tasks={project.tasks}
      />
    </Workspace>
  );
}
