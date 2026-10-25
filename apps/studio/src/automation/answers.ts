/**
 * Answers to assistant requests, one function per request (`apps/mcp-server/server/app-link.ts`
 * lists the same set), read from `live` at call time. Read-only except settings, which go through
 * `parsePrefs` like a stored file, so an assistant cannot set a value Settings could not show.
 */

import { formatRef } from '@bezier/core';
import type { ViewName } from '@bezier/renderer';
import { type AppPrefs, DEFAULT_PREFS, parsePrefs } from '../preferences.js';
import { live } from './live.js';
import { measurePerformance } from './performance.js';
import { uiMap } from './ui-map.js';

export const APP_METHODS = [
  'status',
  'project',
  'selection',
  'screenshot',
  'ui',
  'settings.read',
  'settings.write',
  'performance',
] as const;
export type AppMethod = (typeof APP_METHODS)[number];

/** A change an assistant made, so the user can see and revert it. */
export interface SettingChange {
  key: keyof AppPrefs;
  from: unknown;
  to: unknown;
}

/**
 * Settings an assistant may change: appearance and rendering, never where data goes. Update
 * channel, keymap and navigation stay with the user; Collaboration and Community have their own
 * pages and consent.
 */
export const WRITABLE: Readonly<
  Partial<Record<keyof AppPrefs, readonly unknown[] | 'boolean' | 'percent'>>
> = {
  theme: ['system', 'light', 'dark'],
  interfaceScale: ['small', 'default', 'large'],
  density: ['compact', 'comfortable'],
  glass: ['auto', 'full', 'reduced', 'solid'],
  contrast: ['standard', 'high'],
  motion: ['system', 'reduced', 'full'],
  showLabels: 'boolean',
  showPerformance: 'boolean',
  quality: ['low', 'medium', 'high'],
  detail: ['auto', 'full', 'light'],
  smoothness: 'percent',
  startupWorkspace: ['design', 'visualize', 'drawings'],
  showHistory: 'boolean',
  showReferences: 'boolean',
};

const need = <T>(value: T | null, what: string): T => {
  if (value === null) throw new Error(`${what} is not available: no project is open.`);
  return value;
};

export async function answer(
  method: AppMethod,
  params: Record<string, unknown>,
  onSettings: (changes: readonly SettingChange[]) => void,
): Promise<unknown> {
  switch (method) {
    case 'status':
      return status();
    case 'project':
      return modelSummary(params.detail === 'full');
    case 'selection':
      return selection();
    case 'screenshot':
      return screenshot(String(params.view ?? 'current'), Number(params.scale ?? 1));
    case 'ui':
      return uiMap(typeof params.filter === 'string' ? params.filter : '');
    case 'settings.read':
      return { values: live.prefs ?? DEFAULT_PREFS, writable: WRITABLE };
    case 'settings.write':
      return writeSettings(params.changes, onSettings);
    case 'performance':
      return measurePerformance(Math.min(5000, Math.max(250, Number(params.sampleMs ?? 1000))));
  }
}

function status() {
  const view = live.view;
  const open = document.querySelector('[role="dialog"], dialog[open]');
  return {
    workspace: live.workspace,
    project:
      view === null
        ? null
        : { name: view.document.meta.name, steps: view.document.features.length },
    sketch: live.sketch,
    selected: live.selected.length,
    dialog:
      open === null
        ? null
        : (open.getAttribute('aria-label') ?? open.textContent?.trim().slice(0, 80) ?? ''),
    keymap: live.prefs?.keymap.preset ?? 'native',
    window: { width: innerWidth, height: innerHeight, devicePixelRatio },
    canUndo: view?.canUndo ?? false,
    canRedo: view?.canRedo ?? false,
  };
}

/** The open model as data: for an assistant here, and for a plugin's `bezier.model.read()`. */
export function modelSummary(full: boolean) {
  const view = need(live.view, 'The model');
  const doc = view.document;
  const positions = view.display?.mesh.positions;
  return {
    name: doc.meta.name,
    units: doc.meta.displayUnits,
    variables: doc.meta.variables ?? [],
    steps: doc.features.map((feature) => {
      const status = view.statuses.get(feature.id) ?? { state: 'ok' };
      return {
        id: feature.id,
        type: feature.type,
        name: feature.name,
        ...status,
        ...(feature.expressions === undefined ? {} : { expressions: feature.expressions }),
        ...(full ? { params: feature.params } : {}),
      };
    }),
    bodies: view.bodies.map((body) => ({
      key: body.key,
      label: doc.meta.bodyNames?.[body.key] ?? body.label,
      hidden: body.hidden,
      faces: body.faces.length,
    })),
    // Millimetres, of what is shown; hidden bodies are excluded.
    bounds: positions === undefined ? null : bounds(positions),
    triangles: view.display === null ? 0 : view.display.mesh.indices.length / 3,
    rebuildMs: Math.round(view.durationMs),
    recentEdits: view.history.slice(-15),
  };
}

function bounds(positions: Float32Array) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 1) {
    const axis = i % 3;
    const value = positions[i] ?? 0;
    if (value < (min[axis] ?? 0)) min[axis] = value;
    if (value > (max[axis] ?? 0)) max[axis] = value;
  }
  const round = (values: number[]) => values.map((value) => Math.round(value * 1000) / 1000);
  return {
    min: round(min),
    max: round(max),
    size: round(max.map((value, i) => value - (min[i] ?? 0))),
  };
}

function selection() {
  const view = live.view;
  const keys = new Set(live.selected.map(formatRef));
  return {
    refs: [...keys],
    bodies:
      view?.bodies
        .filter((body) => body.faces.some((face) => keys.has(formatRef(face))))
        .map((body) => body.label) ?? [],
  };
}

const VIEW_NAMES: Readonly<Record<string, ViewName>> = {
  front: 'front',
  back: 'back',
  top: 'top',
  bottom: 'bottom',
  left: 'left',
  right: 'right',
  iso: 'default',
};

async function screenshot(view: string, scale: number) {
  const viewport = need(live.viewportRef?.current ?? null, 'The viewport');
  const named = VIEW_NAMES[view];
  if (named !== undefined) {
    viewport.setView(named, false);
    // Two frames: one for the camera to move, one to render from there.
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  }
  const blob = await viewport.capture({ scale: Math.min(2, Math.max(0.25, scale)) });
  if (blob === null) throw new Error('The frame could not be captured.');
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return { png: btoa(binary), view: named === undefined ? 'current' : view, ...size };
}

function writeSettings(
  given: unknown,
  onSettings: (changes: readonly SettingChange[]) => void,
): { changed: readonly SettingChange[] } {
  const prefs = need(live.prefs, 'Settings');
  const setPrefs = need(live.setPrefs, 'Settings');
  if (given === null || typeof given !== 'object') throw new Error('changes must be an object.');
  const entries = Object.entries(given as Record<string, unknown>);
  for (const [key, value] of entries) {
    const rule = WRITABLE[key as keyof AppPrefs];
    if (rule === undefined) throw new Error(`${key} cannot be changed by an assistant.`);
    const valid =
      rule === 'boolean'
        ? typeof value === 'boolean'
        : rule === 'percent'
          ? typeof value === 'number' && value >= 0 && value <= 100
          : rule.includes(value);
    if (!valid) {
      const allowed =
        rule === 'boolean' ? 'true or false' : rule === 'percent' ? '0 to 100' : rule.join(', ');
      throw new Error(`${key} cannot be ${JSON.stringify(value)}. It takes ${allowed}.`);
    }
  }
  const next = parsePrefs({ ...prefs, ...(given as object) });
  const changed = entries
    .map(([key]) => key as keyof AppPrefs)
    .filter((key) => next[key] !== prefs[key])
    .map((key) => ({ key, from: prefs[key], to: next[key] }));
  if (changed.length > 0) {
    setPrefs(next);
    onSettings(changed);
  }
  return { changed };
}
