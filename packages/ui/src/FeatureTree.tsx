/**
 * The history panel: all features in order. Failed and dangling features are shown with their
 * reason so the user can see which step broke (ADR 0009).
 */

import type { FeatureId, FeatureRecord, FeatureStatus } from '@bezier/core';

export interface FeatureTreeProps {
  features: readonly FeatureRecord[];
  statuses: ReadonlyMap<FeatureId, FeatureStatus>;
  selectedId: FeatureId | null;
  onSelect: (id: FeatureId) => void;
}

/**
 * Explanation for a feature that is not ok, or null. Exhaustive over `FeatureStatus`, so a new
 * status without an explanation is a type error.
 */
function problemOf(status: FeatureStatus): string | null {
  switch (status.state) {
    case 'ok':
      return null;
    case 'suppressed':
      return 'Turned off';
    case 'failed':
    case 'blocked':
    case 'dangling':
    case 'unknown-type':
      return status.message;
  }
}

export function FeatureTree({ features, statuses, selectedId, onSelect }: FeatureTreeProps) {
  return (
    <ul className="feature-tree" aria-label="Feature history">
      {features.map((feature) => {
        const status = statuses.get(feature.id) ?? ({ state: 'ok' } as const);
        const problem = problemOf(status);

        return (
          <li key={feature.id}>
            <button
              type="button"
              aria-current={feature.id === selectedId}
              data-state={status.state}
              onClick={() => onSelect(feature.id)}
            >
              <span className="feature-tree__name">{feature.name}</span>
              {problem !== null && (
                <span className="feature-tree__problem" role="status">
                  {problem}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
