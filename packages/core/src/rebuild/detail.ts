/**
 * Picks the display tessellation setting from the body's face count. Large assemblies use a
 * coarser setting (Voron printer, 1,700 parts: 4.0 M triangles at default, 2.7 M at draft).
 */

import type { GeometryKernel, ShapeId, TessellationOptions } from '@bezier/kernel';

/** A fixed setting, or one chosen from the number of faces being drawn. */
export type TessellationChoice = TessellationOptions | ((faces: number) => TessellationOptions);

/**
 * Draft setting: 0.4 rad keeps sixteen segments per circle. On the Voron, 2.71 M triangles vs
 * 4.00 M at default (`tools/spikes/tessellation-levels.ts`). 0.8 rad (eight segments) looked
 * faceted and facets poked through touching parts.
 */
export const LIGHTWEIGHT_TESSELLATION: TessellationOptions = {
  linearDeflection: 0.2,
  angularDeflection: 0.4,
};

/**
 * Face count above which a body is large: well above a detailed part (a few thousand), well below
 * an assembly (the Voron has 108,000).
 */
export const LARGE_MODEL_FACES = 20_000;

/** The tessellation setting for `body`, or undefined for the kernel default. */
export async function tessellationFor(
  kernel: GeometryKernel,
  body: ShapeId,
  choice: TessellationChoice | undefined,
): Promise<TessellationOptions | undefined> {
  if (typeof choice !== 'function') return choice;
  const faces = await kernel.faceHashes(body);
  return choice(faces.ok ? faces.value.length : 0);
}
