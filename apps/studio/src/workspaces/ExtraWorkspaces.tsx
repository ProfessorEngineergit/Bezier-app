/** Keep workspace editors alive across navigation without running a hidden presentation loop. */

import type { StableRef } from '@bezier/core';
import { lazy, type MutableRefObject, Suspense, useState } from 'react';
import { live } from '../automation/live.js';
import { Isolated } from '../Isolated.js';
import type { Session, SessionView } from '../session.js';
import { bodiesPicked } from '../use-bodies.js';
import type { StudioMode } from './WorkspaceModes.js';

const Drawings = lazy(() =>
  import('./DrawingsWorkspace.js').then((m) => ({ default: m.DrawingsWorkspace })),
);
const Visualize = lazy(() =>
  import('./VisualizeWorkspace.js').then((m) => ({ default: m.VisualizeWorkspace })),
);
export function ExtraWorkspaces({
  mode,
  view,
  sessionRef,
  itemsOpen,
  itemsWidth,
  onItemsWidth,
  onItemsToggle,
  selectedRefs,
  onSelectBody,
}: {
  mode: StudioMode;
  view: SessionView | null;
  sessionRef: MutableRefObject<Session | null>;
  itemsOpen: boolean;
  itemsWidth: number;
  onItemsWidth: (width: number) => void;
  onItemsToggle: () => void;
  selectedRefs: readonly StableRef[];
  onSelectBody: (key: string, additive: boolean) => void;
}) {
  // Every workspace change passes through here, so the automation link reads it here.
  live.workspace = mode;
  const [visited, setVisited] = useState<StudioMode[]>([]);
  if (!visited.includes(mode)) setVisited([...visited, mode]);
  return (
    <Suspense
      fallback={
        <div className="mode-workspace">
          <p className="mode-empty">Opening workspace…</p>
        </div>
      }
    >
      {visited.includes('drawings') && (
        <div className={mode === 'drawings' ? '' : 'mode-hidden'}>
          <Isolated name="Drawings">
            <Drawings
              key={sessionRef.current?.id}
              active={mode === 'drawings'}
              session={sessionRef.current}
              model={view}
              itemsOpen={itemsOpen}
              itemsWidth={itemsWidth}
              onItemsWidth={onItemsWidth}
              onItemsToggle={onItemsToggle}
              name={view?.document.meta.name ?? 'Untitled'}
            />
          </Isolated>
        </div>
      )}
      {visited.includes('visualize') && (
        <div className={mode === 'visualize' ? '' : 'mode-hidden'}>
          <Isolated name="Visualize">
            <Visualize
              key={sessionRef.current?.id}
              documentId={sessionRef.current?.id ?? 'preview'}
              bodies={view?.bodies ?? []}
              selectedBodies={bodiesPicked(view?.bodies ?? [], selectedRefs).map((b) => b.key)}
              onSelectBody={onSelectBody}
              geometry={view?.display ?? null}
              active={mode === 'visualize'}
              itemsWidth={itemsWidth}
              itemsOpen={itemsOpen}
              onItemsToggle={onItemsToggle}
            />
          </Isolated>
        </div>
      )}
    </Suspense>
  );
}
