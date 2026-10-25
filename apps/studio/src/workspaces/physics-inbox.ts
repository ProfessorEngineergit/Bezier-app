/**
 * Hands physics drawings from Simulation to Drawings. Drawings owns and saves its sheets (if both
 * wrote them, the last save would undo the other), so new drawing content is queued here and
 * Drawings takes it when open or next opened.
 */

import type { PhysicsContent } from './physics-sheets.js';

const waiting: PhysicsContent[] = [];
const listeners = new Set<() => void>();

export function sendPhysicsSheet(sheet: PhysicsContent): void {
  waiting.push(sheet);
  for (const listener of listeners) listener();
}

/** Every sheet handed over and not yet taken, oldest first. */
export function takePhysicsSheets(): PhysicsContent[] {
  return waiting.splice(0);
}

export function onPhysicsSheet(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
