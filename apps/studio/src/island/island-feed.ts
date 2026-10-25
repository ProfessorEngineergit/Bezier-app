/**
 * Events from the app to the title-bar island, without shared React. The island has its own root
 * (`mount.ts`) so it survives an app crash and cannot read app state: the app writes here and the
 * island listens. With the island off or absent, a write costs a Set lookup.
 */

import type { IslandTask } from '@bezier/nib';

export type IslandEvent =
  | { kind: 'tasks'; tasks: readonly IslandTask[] }
  /** A notice the app showed: an export done, a feature that failed. */
  | { kind: 'notice'; tone: 'info' | 'ok' | 'fail'; title: string }
  /** A change to the model, by its journal operation, as the guides hear it. */
  | { kind: 'edit'; op: string; type?: string }
  /** A model finished loading into a project the user already left; Nib offers to open it. */
  | { kind: 'arrived'; project: string; name: string };

/** Asks the app to open a project, by id (the event's detail). */
export const OPEN_PROJECT_EVENT = 'bezier:open-project';

const listeners = new Set<(event: IslandEvent) => void>();
let lastTasks: readonly IslandTask[] = [];

export function tellIsland(event: IslandEvent): void {
  if (event.kind === 'tasks') lastTasks = event.tasks;
  for (const listener of listeners) listener(event);
}

/** Whether anything is under way now: closing the window would lose it. */
export function workUnderWay(): boolean {
  return lastTasks.some((task) => task.light !== true);
}

/** Subscribes, reporting current tasks immediately so a late-mounted island is in sync. */
export function listenToApp(listener: (event: IslandEvent) => void): () => void {
  listeners.add(listener);
  if (lastTasks.length > 0) listener({ kind: 'tasks', tasks: lastTasks });
  return () => listeners.delete(listener);
}
