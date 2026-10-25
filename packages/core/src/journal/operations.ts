/**
 * Every document edit, journalled then applied (ADR 0009). Operations must be serialisable and
 * deterministic: no clock, randomness or reliance on key order.
 */

import type { SavedView } from '../document.js';
import type { FeatureId, SketchPlane } from '../features/types.js';

export type Operation =
  | {
      readonly op: 'addFeature';
      readonly id: FeatureId;
      readonly type: string;
      readonly name: string;
      /** Position in the history; `features.length` appends. */
      readonly index: number;
      readonly params: Readonly<Record<string, unknown>>;
      /** Parameter expressions, present when restoring a deleted feature. */
      readonly expressions?: Readonly<Record<string, string>>;
    }
  /** Replaces all parameters. */
  | {
      readonly op: 'updateParams';
      readonly id: FeatureId;
      readonly params: Readonly<Record<string, unknown>>;
    }
  /**
   * Changes some parameters, for features with large params (e.g. a picture). null removes a
   * parameter.
   */
  | {
      readonly op: 'patchParams';
      readonly id: FeatureId;
      readonly params: Readonly<Record<string, unknown>>;
    }
  | { readonly op: 'renameFeature'; readonly id: FeatureId; readonly name: string }
  | { readonly op: 'removeFeature'; readonly id: FeatureId }
  | { readonly op: 'moveFeature'; readonly id: FeatureId; readonly toIndex: number }
  | { readonly op: 'suppressFeature'; readonly id: FeatureId; readonly suppressed: boolean }
  | { readonly op: 'renameDocument'; readonly name: string }
  | { readonly op: 'setDisplayUnits'; readonly units: 'mm' | 'cm' | 'in' }
  | {
      readonly op: 'setSketchPlane';
      readonly id: FeatureId;
      readonly plane: SketchPlane;
    }
  /** Shows or hides a body by key (`bodyKeys`, ADR 0012). */
  | { readonly op: 'setBodyVisible'; readonly key: string; readonly visible: boolean }
  /** Names a body; an empty name removes it. */
  | { readonly op: 'renameBody'; readonly key: string; readonly name: string }
  /** Puts a body in an Items panel folder; an empty folder takes it out. */
  | { readonly op: 'setBodyFolder'; readonly key: string; readonly folder: string }
  /**
   * Sets a variable; an empty expression removes it. `index` positions a new one, so undoing a
   * removal restores its place.
   */
  | {
      readonly op: 'setVariable';
      readonly name: string;
      readonly expression: string;
      readonly index?: number;
    }
  /** Saves or replaces a named view; `view: null` removes it. */
  | { readonly op: 'setSavedView'; readonly name: string; readonly view: SavedView | null }
  /** Sets a parameter expression; an empty one reverts to the plain number. */
  | {
      readonly op: 'setExpression';
      readonly id: FeatureId;
      readonly param: string;
      readonly expression: string;
    };

export type OperationKind = Operation['op'];

/** Undo menu label. Kept here so every operation type must have one. */
export function describeOperation(operation: Operation): string {
  switch (operation.op) {
    case 'addFeature':
      return `Add ${operation.name}`;
    case 'updateParams':
    case 'patchParams':
      return 'Change parameters';
    case 'renameFeature':
      return `Rename to ${operation.name}`;
    case 'removeFeature':
      return 'Delete feature';
    case 'moveFeature':
      return 'Reorder feature';
    case 'suppressFeature':
      return operation.suppressed ? 'Suppress feature' : 'Unsuppress feature';
    case 'renameDocument':
      return 'Rename document';
    case 'setDisplayUnits':
      return `Show units in ${operation.units}`;
    case 'setSketchPlane':
      return `Move sketch to ${operation.plane}`;
    case 'setBodyVisible':
      return operation.visible ? 'Show body' : 'Hide body';
    case 'renameBody':
      return operation.name === '' ? 'Unname body' : `Rename body to ${operation.name}`;
    case 'setBodyFolder':
      return operation.folder === ''
        ? 'Take body out of folder'
        : `Move body to ${operation.folder}`;
    case 'setVariable':
      return operation.expression === ''
        ? `Remove variable ${operation.name}`
        : `Set ${operation.name} = ${operation.expression}`;
    case 'setExpression':
      return operation.expression === '' ? 'Remove expression' : `Set to ${operation.expression}`;
    case 'setSavedView':
      return operation.view === null
        ? `Remove view ${operation.name}`
        : `Save view ${operation.name}`;
  }
}
