/**
 * The document model: feature history plus metadata. The solid is derived by replaying the
 * history (ADR 0005).
 */

import type { EdgeSet, Mesh, ShapeId } from '@bezier/kernel';
import type { Variable } from './expressions.js';
import type { FeatureId, FeatureRecord, FeatureStatus } from './features/types.js';
import type { FaceNaming } from './rebuild/naming.js';
import type { PlaneBasis } from './rebuild/plane.js';
import type { SketchRegion } from './rebuild/regions.js';

/** Bumped whenever the saved document format changes. */
export const DOCUMENT_SCHEMA_VERSION = 1;

export interface DocumentMeta {
  schemaVersion: number;
  name: string;
  createdAt: string;
  modifiedAt: string;
  /** Display units only; lengths are always stored in millimetres. */
  displayUnits: 'mm' | 'cm' | 'in';
  /** Hidden bodies by body key (ADR 0012). Absent when none. Saved, not view state. */
  hiddenBodies?: readonly string[];
  /** User-given body names by body key. Absent when none; unnamed bodies are "Body n". */
  bodyNames?: Readonly<Record<string, string>>;
  /**
   * Items panel folder per body key. Absent when none. A folder exists only while it holds a
   * body.
   */
  bodyFolders?: Readonly<Record<string, string>>;
  /** Variables usable in parameter expressions (`expressions.ts`), in user order. */
  variables?: readonly Variable[];
  /** Named camera views in saved order (audit F-034). Absent when none. */
  savedViews?: readonly SavedView[];
}

/** A saved camera: position, target and projection. */
export interface SavedView {
  name: string;
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  /** Parallel projection, and its zoom (1 for perspective). */
  parallel: boolean;
  zoom: number;
}

export interface CadDocument {
  meta: DocumentMeta;
  /** The history, oldest first. */
  features: readonly FeatureRecord[];
}

/** The result of replaying a document through the kernel. */
export interface RebuildResult {
  /** Per-feature outcome. A failed feature does not discard the ones before it. */
  statuses: ReadonlyMap<FeatureId, FeatureStatus>;
  /** Display geometry for the last feature that succeeded. */
  mesh: Mesh | null;
  edges: EdgeSet | null;
  /** The current solid; null when nothing built. */
  body: ShapeId | null;
  /** Face names of the current body, for turning picks into stable references. */
  naming: FaceNaming;
  /** Solved sketches with their plane and regions, for drawing and region picking. */
  sketches: ReadonlyMap<FeatureId, { basis: PlaneBasis; regions: readonly SketchRegion[] }>;
  /** Wall-clock milliseconds. */
  durationMs: number;
}

export function createEmptyDocument(name: string, now: () => Date = () => new Date()): CadDocument {
  const timestamp = now().toISOString();
  return {
    meta: {
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      name,
      createdAt: timestamp,
      modifiedAt: timestamp,
      displayUnits: 'mm',
    },
    features: [],
  };
}
