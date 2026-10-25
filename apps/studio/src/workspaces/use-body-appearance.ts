/**
 * Material editing in Visualize: the inspector edits the picked faces, else the selected bodies.
 * Body finishes and face overrides survive selection and rebuild; faces without an override use
 * their body's finish.
 */
import { type BodySummary, formatRef } from '@bezier/core';
import type {
  PresentationMaterialSurface,
  PresentationRenderer,
  PresentationSettings,
} from '@bezier/renderer';
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { MATERIALS } from './materials.js';

const KEYS = [
  'color',
  'roughness',
  'metalness',
  'transmission',
  'clearcoat',
  'grain',
  'textureScale',
  'textureRotation',
  'anisotropy',
  'anisotropyRotation',
  'ior',
  'emission',
  'emissionMode',
  'emissionDirection',
  'emissionBeam',
] as const;
type Finish = Pick<PresentationSettings, (typeof KEYS)[number]>;
interface Appearance {
  name: string;
  settings: Finish;
  surface: PresentationMaterialSurface | null;
}
function finish(s: PresentationSettings): Finish {
  return Object.fromEntries(KEYS.map((key) => [key, s[key]])) as unknown as Finish;
}

/** The keys a target refers to: face text names or body keys. */
const listOf = (target: string) =>
  target
    .replace(/^faces:/, '')
    .replace(/#\d+$/, '')
    .split('|')
    .filter(Boolean);

function read(key: string, initial: Appearance): Record<string, Appearance> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const result: Record<string, Appearance> = {};
    for (const [id, entry] of Object.entries(raw)) {
      if (!entry || typeof entry !== 'object') continue;
      const { name, settings } = entry as { name?: unknown; settings?: unknown };
      const material = MATERIALS.find((m) => m.name === name);
      if (!material || !settings || typeof settings !== 'object') continue;
      const valid = Object.entries(settings).filter(
        ([k, v]) =>
          KEYS.includes(k as (typeof KEYS)[number]) &&
          (typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))),
      );
      result[id] = {
        name: material.name,
        settings: { ...initial.settings, ...Object.fromEntries(valid) },
        surface: material.surface ?? null,
      };
    }
    return result;
  } catch {
    return {};
  }
}

export function useBodyAppearance({
  id,
  bodies,
  selected,
  faces: picked = [],
  renderer,
  ready,
  geometry,
  settings,
  name,
  surface,
  setSettings,
  setName,
  setSurface,
  onLoading,
  onError,
}: {
  id: string;
  bodies: readonly BodySummary[];
  selected: readonly string[];
  /** Picked faces, by text name; the inspector edits these while any are picked. */
  faces?: readonly string[];
  renderer: RefObject<PresentationRenderer | null>;
  ready: boolean;
  geometry: unknown;
  settings: PresentationSettings;
  name: string;
  surface: PresentationMaterialSurface | null;
  setSettings: Dispatch<SetStateAction<PresentationSettings>>;
  setName: Dispatch<SetStateAction<string>>;
  setSurface: Dispatch<SetStateAction<PresentationMaterialSurface | null>>;
  onLoading: Dispatch<SetStateAction<boolean>>;
  onError: Dispatch<SetStateAction<string>>;
}) {
  const storageKey = `bezier.visualize.bodies.${id}`;
  const faceKey = `bezier.visualize.faceMaterials.${id}`;
  const initial = useRef<Appearance>({ name, surface, settings: finish(settings) });
  const saved = useRef(read(storageKey, initial.current));
  const savedFaces = useRef(read(faceKey, initial.current));
  // Load the new project's face materials on open; body materials load the same way below.
  const loadedFaces = useRef(faceKey);
  if (loadedFaces.current !== faceKey) {
    loadedFaces.current = faceKey;
    savedFaces.current = read(faceKey, initial.current);
  }
  const ownerOf = useMemo(() => {
    const owner = new Map<string, string>();
    for (const body of bodies) for (const face of body.faces) owner.set(formatRef(face), body.key);
    return owner;
  }, [bodies]);
  const visible = bodies.filter((b) => !b.hidden).map((b) => b.key);
  const onFaces = picked.filter((face) => ownerOf.has(face));
  const targets =
    onFaces.length > 0 ? [...onFaces] : selected.filter((key) => visible.includes(key));
  if (targets.length === 0) targets.push(...visible);
  // Bumped when faces revert to their body's material, so the inspector rereads them.
  const [version, setVersion] = useState(0);
  const [, setOwned] = useState(0);
  const targetKey = `${onFaces.length > 0 ? 'faces:' : ''}${targets.join('|')}#${String(version)}`;
  const targetList = listOf(targetKey);
  const editsFaces = targetKey.startsWith('faces:');
  const [context, setContext] = useState<string | null>(null);
  const last = useRef<string | null>(null);
  const edited = useRef('');
  const request = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: read once per target, as it was then
  useLayoutEffect(() => {
    if (last.current === targetKey) return;
    last.current = targetKey;
    const first = listOf(targetKey)[0] ?? '';
    // A face without an override starts from its body's finish.
    const appearance =
      (editsFaces
        ? (savedFaces.current[first] ?? saved.current[ownerOf.get(first) ?? ''])
        : saved.current[first]) ?? initial.current;
    edited.current = JSON.stringify([appearance.name, appearance.settings]);
    setName(appearance.name);
    setSurface(appearance.surface);
    setSettings((old) => ({ ...old, ...appearance.settings }));
    setContext(targetKey);
  }, [targetKey, setName, setSettings, setSurface]);

  useEffect(() => {
    if (!ready || !renderer.current || geometry === null || context !== targetKey) return;
    const chosen = { name, surface, settings: finish(settings) };
    const signature = JSON.stringify([name, chosen.settings]);
    if (signature !== edited.current) {
      const into = editsFaces ? savedFaces.current : saved.current;
      for (const key of listOf(targetKey)) into[key] = chosen;
      edited.current = signature;
      // Shown in the panel ("Use the body's material"), which rereads face overrides on next draw.
      if (editsFaces) setOwned((count) => count + 1);
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(saved.current));
      localStorage.setItem(faceKey, JSON.stringify(savedFaces.current));
    } catch {
      /* Storage can be disabled; editing still works. */
    }
    void renderer.current.setFaceAppearances(
      Object.entries(savedFaces.current)
        .filter(([face]) => ownerOf.has(face))
        .map(([face, own]) => ({
          face,
          settings: { ...settings, ...own.settings },
          surface: own.surface,
        })),
    );
    const mine = ++request.current;
    onLoading(surface !== null);
    void renderer.current
      .setBodyAppearances(
        bodies.map((body) => {
          const stored = saved.current[body.key] ?? initial.current;
          return {
            key: body.key,
            settings: { ...settings, ...stored.settings },
            surface: stored.surface,
          };
        }),
      )
      .catch((error: unknown) => {
        if (mine === request.current)
          onError(error instanceof Error ? error.message : 'The body material could not load.');
      })
      .finally(() => {
        if (mine === request.current) onLoading(false);
      });
  }, [
    settings,
    surface,
    name,
    context,
    targetKey,
    bodies,
    ready,
    geometry,
    renderer,
    storageKey,
    faceKey,
    ownerOf,
    editsFaces,
    onLoading,
    onError,
  ]);
  // Outline only when picked: with nothing picked the panel edits every body, and outlining all
  // of them conveys nothing.
  const outlined = selected.filter((key) => visible.includes(key)).join('|');
  // biome-ignore lint/correctness/useExhaustiveDependencies: a rebuilt mesh is a new object to outline
  useEffect(() => {
    if (ready) renderer.current?.setOutlined(outlined.split('|').filter(Boolean));
  }, [outlined, ready, geometry, renderer]);
  const bodyLabel = (key: string) => bodies.find((b) => b.key === key)?.label ?? key;
  return {
    label: editsFaces
      ? targetList.length === 1
        ? `1 face of ${bodyLabel(ownerOf.get(targetList[0] ?? '') ?? '')}`
        : `${String(targetList.length)} faces`
      : selected.length === 0
        ? 'All visible bodies'
        : targets.map(bodyLabel).join(', '),
    /** Whether materials currently apply to faces. */
    onFaces: editsFaces,
    /** Whether any picked face has its own material. */
    facesOwn: editsFaces && targetList.some((face) => savedFaces.current[face] !== undefined),
    /** Reverts the picked faces to their bodies' material. */
    resetFaces: () => {
      for (const face of targetList) delete savedFaces.current[face];
      setVersion((value) => value + 1);
    },
    prepare: (
      key: string | undefined,
      next: PresentationSettings,
      name: string,
      surface: PresentationMaterialSurface | null,
    ) => {
      // Choosing a preset is an explicit assignment even if the inspector already shows it.
      // Mixed selections otherwise leave their other bodies untouched when the first matches.
      const chosen = { name, surface, settings: finish(next) };
      if (key !== undefined) saved.current[key] = chosen;
      else for (const id of targetList) (editsFaces ? savedFaces : saved).current[id] = chosen;
    },
  };
}
