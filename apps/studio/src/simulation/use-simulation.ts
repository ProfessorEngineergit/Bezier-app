/**
 * Simulation workspace state: the study, placing loads and supports on faces, running the solver
 * worker and showing its result on the model. Studies are stored per project in local storage for
 * now, outside the journal, so undo and project files do not include them yet.
 */

import { formatRef, type StableRef } from '@bezier/core';
import {
  type Constraint,
  DEFAULT_OPTIMISATION,
  type Load,
  type MeshResolution,
  type OptimisationSettings,
  type Study,
  type StudyKind,
  type ThermalCondition,
  type Vec3,
} from '@bezier/sim';
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SessionView } from '../session.js';
import type { ViewportHandle } from '../Viewport.js';
import type { SimulationResult, SolveRequest, WorkerMessage } from './sim-protocol.js';

export type SimTool =
  | 'fixed'
  | 'pin'
  | 'frictionless'
  | 'force'
  | 'pressure'
  | 'temperature'
  | 'heat'
  | 'convection';
export type ResultQuantity =
  | 'vonMises'
  | 'displacement'
  | 'safety'
  | 'density'
  | 'temperature'
  | 'flux';
export type DeformMode = 'off' | 'actual' | 'adjusted';

export interface Progress {
  stage: 'mesh' | 'solve' | 'optimise' | 'recover';
  fraction: number;
  detail: string;
}

/** A placement is a constraint, load or thermal condition; tree and panel treat them alike. */
export type Placement = Constraint | Load | ThermalCondition;

/** Default name of a new study of each kind. */
const KIND_NAMES: Partial<Record<StudyKind, string>> = {
  static: 'Static Stress 1',
  'shape-optimisation': 'Shape Optimisation 1',
  thermal: 'Thermal 1',
};

const STORAGE_PREFIX = 'bezier.simulation.';

function blankStudy(): Study {
  return {
    id: 'study-1',
    name: 'Static Stress 1',
    kind: 'static',
    materialId: 'pla',
    constraints: [],
    loads: [],
    thermal: [],
    resolution: 'medium',
    optimisation: DEFAULT_OPTIMISATION,
  };
}

function readStudy(documentId: string): Study {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + documentId);
    if (raw !== null) return { ...blankStudy(), ...(JSON.parse(raw) as Partial<Study>) };
  } catch {
    // An unreadable study starts over; the model is untouched.
  }
  return blankStudy();
}

let nextId = 1;
const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${nextId++}`;

interface Deps {
  documentId: string;
  view: SessionView | null;
  handleRef: RefObject<ViewportHandle | null>;
  active: boolean;
  /** What the modelling view draws around the model, restored after pictures taken without it. */
  viewSettings: { showGrid: boolean; showAxes: boolean };
}

export function useSimulation({ documentId, view, handleRef, active, viewSettings }: Deps) {
  const [study, setStudy] = useState<Study>(() => readStudy(documentId));
  const [tool, setTool] = useState<SimTool | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<{ message: string; issues: string[] } | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [preview, setPreview] = useState<Float32Array | null>(null);
  const [stale, setStale] = useState(false);
  const [quantity, setQuantity] = useState<ResultQuantity>('vonMises');
  const [bands, setBands] = useState(10);
  const [deform, setDeform] = useState<DeformMode>('adjusted');
  const [animate, setAnimate] = useState(false);
  const [showResults, setShowResults] = useState(true);
  const worker = useRef<Worker | null>(null);
  const request = useRef(0);

  // Esc ends the current placement, then puts the tool down.
  useEffect(() => {
    if (!active || (editing === null && tool === null)) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (editing !== null) setEditing(null);
      else setTool(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, editing, tool]);

  // One study per project: switching projects loads that project's study.
  useEffect(() => {
    setStudy(readStudy(documentId));
    setResult(null);
    setPreview(null);
    setError(null);
    setEditing(null);
    setTool(null);
  }, [documentId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + documentId, JSON.stringify(study));
    } catch {
      // The study still works this session when storage is blocked.
    }
  }, [documentId, study]);

  // Results describe a shape, so they are invalid once it changes.
  const display = view?.display ?? null;
  const solvedFor = useRef(display);
  useEffect(() => {
    if (result !== null && solvedFor.current !== display) setStale(true);
  }, [display, result]);

  /** Face names on the current model, in both directions. */
  const faces = useMemo(() => {
    const byKey = new Map<string, StableRef>();
    const indexOf = new Map<string, number>();
    display?.faceRefs.forEach((ref, index) => {
      if (ref === null) return;
      const key = formatRef(ref);
      byKey.set(key, ref);
      indexOf.set(key, index);
    });
    return { byKey, indexOf };
  }, [display]);

  const thermalStudy = study.kind === 'thermal';
  // Placements relevant to the study kind: thermal has no supports or loads, stress no
  // temperatures; both are kept for switching back.
  const placements: Placement[] = useMemo(
    () => (thermalStudy ? [...study.thermal] : [...study.constraints, ...study.loads]),
    [thermalStudy, study.constraints, study.loads, study.thermal],
  );
  const editingPlacement = placements.find((placement) => placement.id === editing) ?? null;

  /**
   * What the study still needs before solving, by the rail group that supplies it. The rail marks
   * those groups and the study panel names what is missing.
   */
  const missing = useMemo(() => {
    // `means` explains the term in plain words for newcomers, and which tool places it.
    const needs: { group: string; what: string; means: string }[] = [];
    if (thermalStudy) {
      if (!study.thermal.some((c) => c.kind === 'temperature' || c.kind === 'convection'))
        needs.push({
          group: 'sim-thermal',
          what: 'somewhere for the heat to go: Temperature or Convection',
          means:
            'Somewhere for the heat to go: a face held at a temperature, or open to the air. Press Temperature or Convection.',
        });
      if (!study.thermal.some((c) => c.kind !== 'convection'))
        needs.push({
          group: 'sim-thermal',
          what: 'a source of heat: Heat, or a hot Temperature',
          means: 'A source of heat: a face that is heated. Press Heat, or a hot Temperature.',
        });
    } else {
      if (study.constraints.length === 0)
        needs.push({
          group: 'sim-supports',
          what: 'a support: Fixed, Pin or Frictionless',
          means: 'A support: the face the part is held by, which cannot move. Press Fixed.',
        });
      if (study.loads.length === 0)
        needs.push({
          group: 'sim-loads',
          what: 'a load: Force, Pressure or Gravity',
          means:
            'A load: what pushes or pulls on the part. Press Force, then click the face it acts on.',
        });
    }
    return needs;
  }, [thermalStudy, study.constraints.length, study.loads.length, study.thermal]);

  const change = useCallback((update: (current: Study) => Study) => {
    setStudy((current) => update(current));
    setStale((wasStale) => wasStale || true);
  }, []);

  const updatePlacement = useCallback(
    (id: string, patch: Partial<Constraint> | Partial<Load> | Partial<ThermalCondition>) => {
      change((current) => ({
        ...current,
        constraints: current.constraints.map((c) =>
          c.id === id ? ({ ...c, ...patch } as Constraint) : c,
        ),
        loads: current.loads.map((l) => (l.id === id ? ({ ...l, ...patch } as Load) : l)),
        thermal: current.thermal.map((t) =>
          t.id === id ? ({ ...t, ...patch } as ThermalCondition) : t,
        ),
      }));
    },
    [change],
  );

  const removePlacement = useCallback(
    (id: string) => {
      change((current) => ({
        ...current,
        constraints: current.constraints.filter((c) => c.id !== id),
        loads: current.loads.filter((l) => l.id !== id),
        thermal: current.thermal.filter((t) => t.id !== id),
      }));
      setEditing((current) => (current === id ? null : current));
    },
    [change],
  );

  /** Inward normal of a face: where a force pushes by default. */
  const inwardNormal = useCallback(
    (key: string): Vec3 => {
      const ref = faces.byKey.get(key);
      const normal = ref === undefined ? null : handleRef.current?.faceNormal(ref);
      if (normal === null || normal === undefined) return [0, 0, -1];
      return [-normal.x, -normal.y, -normal.z];
    },
    [faces.byKey, handleRef],
  );

  /** A face clicked on the model: added to the placement being edited, or starts a new one. */
  const pickFace = useCallback(
    (ref: StableRef | null) => {
      // A click beside the part ends the current placement, like Esc, so finishing a support needs
      // no extra button.
      if (ref === null) {
        setEditing(null);
        return;
      }
      if (ref.kind !== 'face') return;
      const key = formatRef(ref);
      if (editingPlacement !== null && 'faces' in editingPlacement) {
        const has = editingPlacement.faces.includes(key);
        updatePlacement(editingPlacement.id, {
          faces: has
            ? editingPlacement.faces.filter((face) => face !== key)
            : [...editingPlacement.faces, key],
        });
        return;
      }
      if (tool === null) return;
      const id = makeId(tool);
      change((current) => {
        switch (tool) {
          case 'fixed':
          case 'frictionless':
            return {
              ...current,
              constraints: [...current.constraints, { id, kind: tool, faces: [key] }],
            };
          case 'pin':
            return {
              ...current,
              constraints: [
                ...current.constraints,
                { id, kind: 'pin', faces: [key], axes: [true, true, true] },
              ],
            };
          case 'force':
            return {
              ...current,
              loads: [
                ...current.loads,
                { id, kind: 'force', faces: [key], magnitude: 100, direction: inwardNormal(key) },
              ],
            };
          case 'pressure':
            return {
              ...current,
              loads: [...current.loads, { id, kind: 'pressure', faces: [key], pressure: 0.1 }],
            };
          case 'temperature':
            return {
              ...current,
              thermal: [
                ...current.thermal,
                { id, kind: 'temperature', faces: [key], temperature: 20 },
              ],
            };
          case 'heat':
            return {
              ...current,
              thermal: [...current.thermal, { id, kind: 'heat', faces: [key], power: 5 }],
            };
          case 'convection':
            return {
              ...current,
              // Still air on a part: about 10 W/(m²·K), at room temperature.
              thermal: [
                ...current.thermal,
                { id, kind: 'convection', faces: [key], coefficient: 10, ambient: 20 },
              ],
            };
        }
      });
      setEditing(id);
    },
    [change, editingPlacement, inwardNormal, tool, updatePlacement],
  );

  /**
   * Double-click on the model: the whole body under it, for heating or holding a part as one. The
   * first click already placed a condition on one face; this extends it to the whole body.
   */
  const pickBody = useCallback(
    (ref: StableRef | null) => {
      if (ref === null || editingPlacement === null || !('faces' in editingPlacement)) return;
      const key = formatRef(ref);
      const body = display?.bodyRefs?.find((refs) => refs.some((each) => formatRef(each) === key));
      if (body === undefined) return;
      const all = new Set([...editingPlacement.faces, ...body.map((each) => formatRef(each))]);
      updatePlacement(editingPlacement.id, { faces: [...all] });
    },
    [display, editingPlacement, updatePlacement],
  );

  const setGravity = useCallback(
    (on: boolean) => {
      change((current) => ({
        ...current,
        loads: on
          ? [
              ...current.loads.filter((l) => l.kind !== 'gravity'),
              {
                id: makeId('gravity'),
                kind: 'gravity',
                direction: [0, 0, -1],
                acceleration: 9806.65,
              },
            ]
          : current.loads.filter((l) => l.kind !== 'gravity'),
      }));
    },
    [change],
  );

  const setKind = useCallback(
    (kind: StudyKind) => {
      change((current) => ({
        ...current,
        kind,
        name: KIND_NAMES[kind] ?? current.name,
        // Optimisation reads best on a coarser grid: forty solves instead of one.
        resolution:
          kind === 'shape-optimisation' && current.resolution !== 'coarse'
            ? 'coarse'
            : current.resolution,
      }));
      setQuantity(firstQuantity(kind));
      setTool(null);
      setEditing(null);
    },
    [change],
  );

  const cancel = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    setProgress(null);
  }, []);

  const solve = useCallback(() => {
    // Say what is missing, in the order it must be done, rather than show a disabled button.
    const missing: string[] = [];
    if (thermalStudy) {
      if (!study.thermal.some((c) => c.kind === 'temperature' || c.kind === 'convection'))
        missing.push(
          'Give the heat somewhere to go: choose Temperature or Convection in the left rail, then click the faces.',
        );
      if (study.thermal.length === 0 || !study.thermal.some((c) => c.kind !== 'convection'))
        missing.push(
          'Say where heat comes from: choose Heat, or hold a face at a Temperature, then click the faces.',
        );
    } else if (study.constraints.length === 0) {
      missing.push(
        'Add a support: choose Fixed, Pin or Frictionless in the left rail, then click the faces that are held.',
      );
    }
    if (!thermalStudy && study.loads.length === 0) {
      missing.push(
        'Add a load: choose Force or Pressure, then click the faces it acts on — or switch Gravity on.',
      );
    }
    if (missing.length > 0) {
      setError({ message: 'Not ready to solve yet', issues: missing });
      return;
    }
    if (display === null) {
      setError({
        message: 'There is no solid to analyse yet.',
        issues: ['Build a body in Design first.'],
      });
      return;
    }
    cancel();
    const thread = new Worker(new URL('./sim-worker.ts', import.meta.url), { type: 'module' });
    worker.current = thread;
    const id = ++request.current;
    setError(null);
    setPreview(null);
    setProgress({ stage: 'mesh', fraction: 0, detail: 'Preparing' });
    solvedFor.current = display;
    thread.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.id !== request.current) return;
      if (message.kind === 'progress') setProgress(message);
      else if (message.kind === 'optimise-step') setPreview(message.density);
      else if (message.kind === 'error') {
        setError({ message: message.message, issues: message.issues });
        setProgress(null);
      } else {
        setResult(message.result);
        setPreview(null);
        setStale(false);
        setProgress(null);
        setShowResults(true);
        setQuantity(firstQuantity(message.result.studyKind));
      }
    };
    thread.onerror = (event) => {
      setError({ message: 'The solver stopped unexpectedly.', issues: [event.message] });
      setProgress(null);
    };
    const { mesh } = display;
    const payload: SolveRequest = {
      kind: 'solve',
      id,
      study,
      // Copied, not transferred: these arrays are still on screen.
      surface: {
        positions: mesh.positions.slice(),
        indices: mesh.indices.slice(),
        triangleFaces: mesh.triangleFaces.slice(),
      },
      faceIndex: [...faces.indexOf.entries()],
    };
    thread.postMessage(payload);
  }, [cancel, display, faces.indexOf, study, thermalStudy]);

  useEffect(() => () => worker.current?.terminate(), []);

  // Show the result on the model.

  const legend = useMemo(() => {
    if (preview !== null)
      return { min: 0, max: 1, unit: '', label: 'Density', palette: 'density' as const };
    if (result === null) return null;
    const s = result.summary;
    switch (quantity) {
      case 'displacement':
        return {
          min: 0,
          max: s.maxDisplacement,
          unit: 'mm',
          label: 'Displacement',
          palette: 'rainbow' as const,
        };
      case 'safety':
        return { min: 0, max: 8, unit: '', label: 'Safety Factor', palette: 'safety' as const };
      case 'density':
        return { min: 0, max: 1, unit: '', label: 'Density', palette: 'density' as const };
      case 'temperature':
        return {
          min: s.minTemperature ?? 0,
          max: s.maxTemperature ?? 0,
          unit: '°C',
          label: 'Temperature',
          palette: 'rainbow' as const,
        };
      case 'flux':
        return {
          min: 0,
          max: s.maxFlux ?? 0,
          unit: 'W/m²',
          label: 'Heat Flux',
          palette: 'rainbow' as const,
        };
      default:
        return {
          min: 0,
          max: s.maxVonMises,
          unit: 'MPa',
          label: 'Von Mises Stress',
          palette: 'rainbow' as const,
        };
    }
  }, [preview, quantity, result]);

  const showing = active && showResults && !stale && (result !== null || preview !== null);

  /** How much to exaggerate deformation so it can be seen: 6 % of the part. */
  const deformScale = useMemo(() => {
    if (result === null || display === null || deform === 'off') return 0;
    if (deform === 'actual') return 1;
    const p = display.mesh.positions;
    let lo = [Infinity, Infinity, Infinity];
    let hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) {
      lo = lo.map((v, a) => Math.min(v, p[i + a] as number));
      hi = hi.map((v, a) => Math.max(v, p[i + a] as number));
    }
    const size = Math.hypot(
      (hi[0] as number) - (lo[0] as number),
      (hi[1] as number) - (lo[1] as number),
      (hi[2] as number) - (lo[2] as number),
    );
    const max = result.summary.maxDisplacement;
    return max > 0 ? (size * 0.06) / max : 0;
  }, [deform, display, result]);

  useEffect(() => {
    const handle = handleRef.current;
    if (handle === null) return;
    if (!showing || legend === null) {
      handle.setResultField(null);
      return;
    }
    const values =
      preview ??
      (quantity === 'displacement'
        ? result?.fields.displacement
        : quantity === 'safety'
          ? result?.fields.safety
          : quantity === 'density'
            ? result?.fields.density
            : quantity === 'temperature'
              ? result?.fields.temperature
              : quantity === 'flux'
                ? result?.fields.flux
                : result?.fields.vonMises);
    if (values === undefined || values === null) {
      handle.setResultField(null);
      return;
    }
    handle.setResultField({
      values,
      displacement:
        preview === null && result?.studyKind !== 'thermal'
          ? (result?.fields.vector ?? null)
          : null,
      min: legend.min,
      max: legend.max,
      bands,
      palette: legend.palette,
      ...(legend.palette === 'density' ? { cutBelow: 0.3 } : {}),
    });
  }, [bands, handleRef, legend, preview, quantity, result, showing]);

  useEffect(() => {
    const handle = handleRef.current;
    if (handle === null || !showing) return;
    if (!animate) {
      handle.setResultDeform(deformScale);
      return;
    }
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      // One cycle every 1.5 s, eased at both ends.
      const phase = 0.5 - 0.5 * Math.cos(((now - started) / 1500) * Math.PI * 2);
      handle.setResultDeform(deformScale * phase);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate, deformScale, handleRef, showing]);

  // Leaving the workspace restores the model.
  useEffect(() => {
    if (!active) handleRef.current?.setResultField(null);
  }, [active, handleRef]);

  /** Faces of the placement being edited, for the viewport to highlight. */
  const selectedRefs = useMemo(() => {
    if (editingPlacement === null || !('faces' in editingPlacement)) return [];
    return editingPlacement.faces.flatMap((key) => {
      const ref = faces.byKey.get(key);
      return ref === undefined ? [] : [ref];
    });
  }, [editingPlacement, faces.byKey]);

  return {
    study,
    placements,
    tool,
    setTool: (next: SimTool | null) => {
      setTool(next);
      setEditing(null);
    },
    editing: editingPlacement,
    setEditing,
    pickFace,
    pickBody,
    updatePlacement,
    removePlacement,
    setGravity,
    setKind,
    setMaterial: (materialId: string) => change((current) => ({ ...current, materialId })),
    setResolution: (resolution: MeshResolution) =>
      change((current) => ({ ...current, resolution })),
    setOptimisation: (patch: Partial<OptimisationSettings>) =>
      change((current) => ({ ...current, optimisation: { ...current.optimisation, ...patch } })),
    solve,
    cancel,
    running: progress !== null,
    progress,
    error,
    dismissError: () => setError(null),
    result,
    stale,
    showResults,
    setShowResults,
    quantity,
    setQuantity,
    bands,
    setBands,
    deform,
    setDeform,
    animate,
    setAnimate,
    legend: showing ? legend : null,
    selectedRefs,
    faceRefOf: (key: string) => faces.byKey.get(key) ?? null,
    missing,
    /** Grid and axes from the view settings, restored after pictures taken without them. */
    around: { grid: viewSettings.showGrid, axes: viewSettings.showAxes },
    /** The model's display points, xyz, in the same order as the per-point result fields. */
    positions: display?.mesh.positions ?? null,
  };
}

export type SimulationHandle = ReturnType<typeof useSimulation>;

/** The initial display of a solved study of this kind. */
function firstQuantity(kind: StudyKind): ResultQuantity {
  if (kind === 'shape-optimisation') return 'density';
  if (kind === 'thermal') return 'temperature';
  return 'vonMises';
}
