/**
 * STL/3MF tessellation quality, chosen in the export menu and stored on this device. The tolerance
 * is the maximum distance of a triangle from the true surface.
 */
import type { TessellationOptions } from '@bezier/kernel';

export const MESH_QUALITIES = {
  coarse: { label: 'Coarse', linearDeflection: 0.1, angularDeflection: 0.5 },
  standard: { label: 'Standard', linearDeflection: 0.02, angularDeflection: 0.25 },
  fine: { label: 'Fine', linearDeflection: 0.005, angularDeflection: 0.1 },
} as const;

export type MeshQuality = keyof typeof MESH_QUALITIES;

const KEY = 'bezier.mesh-quality';

export function meshQuality(): MeshQuality {
  try {
    const kept = localStorage.getItem(KEY);
    return kept !== null && kept in MESH_QUALITIES ? (kept as MeshQuality) : 'standard';
  } catch {
    return 'standard';
  }
}

export function setMeshQuality(quality: MeshQuality): void {
  try {
    localStorage.setItem(KEY, quality);
  } catch {
    // Not persisted: the next export uses Standard.
  }
}

export function meshTolerance(quality: MeshQuality = meshQuality()): TessellationOptions {
  const { linearDeflection, angularDeflection } = MESH_QUALITIES[quality];
  return { linearDeflection, angularDeflection };
}
