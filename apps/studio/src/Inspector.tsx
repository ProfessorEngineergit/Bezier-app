/**
 * The selection at its two layers: a feature's parameters (a history step to edit) and the picked
 * references (geometry resolved by the naming layer). Shown separately so the reference readout
 * reports a click even with no feature selected.
 */

import { type FeatureRecord, formatRef, type StableRef } from '@bezier/core';
import { PropertyPanel } from '@bezier/ui';
import type { ComponentProps, RefObject } from 'react';
import { ImageEditor } from './ImageEditor.js';
import './move-gizmo.css';
import type { Variables } from './use-variables.js';
import type { ViewportHandle } from './Viewport.js';

/** Derived from the panel's props so this file declares no shape of its own. */
type ParamSpec = ComponentProps<typeof PropertyPanel>['spec'];

export function FeatureInspector({
  feature,
  definition,
  features,
  onChangeParam,
  onPatch,
  onClose,
  viewportRef,
  variables,
}: {
  feature: FeatureRecord | null;
  definition: { params: ParamSpec } | undefined;
  features: readonly FeatureRecord[];
  onChangeParam: (id: FeatureRecord['id'], key: string, value: unknown) => void;
  /** Several parameters at once, as one step in the history. */
  onPatch: (id: FeatureRecord['id'], params: Record<string, unknown>) => void;
  /** Stops editing the selected feature. */
  onClose: () => void;
  viewportRef: RefObject<ViewportHandle | null>;
  variables: Variables;
}) {
  if (feature === null || definition === undefined) return null;
  // A reference image has on-canvas handles and its own panel instead of a field list.
  if (feature.type === 'reference-image')
    return (
      <ImageEditor feature={feature} handleRef={viewportRef} onClose={onClose} onPatch={onPatch} />
    );
  return (
    <aside aria-label={feature.name} className="inspector move-gizmo__toolbar">
      <div className="move-gizmo__heading">
        <strong>{feature.name}</strong>
      </div>
      <PropertyPanel
        check={variables.check}
        {...(feature.expressions !== undefined ? { expressions: feature.expressions } : {})}
        featureId={feature.id}
        onChange={(key, value) => onChangeParam(feature.id, key, value)}
        onExpression={(key, text) => variables.setExpression(feature.id, key, text)}
        params={feature.params}
        selectableFeatures={features.map((f) => ({ id: f.id, name: f.name }))}
        spec={definition.params}
      />
      <button className="move-gizmo__done" onClick={onClose} type="button">
        Done
      </button>
    </aside>
  );
}

/** How many picked references are named before the rest are counted. */
const SHOWN_REFS = 6;

/**
 * The references under the last click. `quiet` while a gizmo is open on the pick, so an internal
 * name beside the gizmo's readout is not mistaken for a message about it; still in the DOM.
 */
export function PickedRefs({
  refs,
  quiet = false,
}: {
  refs: readonly StableRef[];
  quiet?: boolean;
}) {
  if (refs.length === 0) return null;
  // A body picked from the list selects all its faces (386 for one Voron part), which filled the
  // screen when listed in full. Show the first few and count the rest.
  const shown = refs.slice(0, SHOWN_REFS);
  return (
    <ul className="selection" data-count={refs.length} hidden={quiet}>
      {shown.map((ref) => (
        <li key={formatRef(ref)}>
          <code>{formatRef(ref)}</code>
        </li>
      ))}
      {refs.length > shown.length && (
        <li className="selection__more">and {refs.length - shown.length} more</li>
      )}
    </ul>
  );
}
