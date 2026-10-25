/**
 * Hover and selection written directly into the vertex colours of changed faces. ADR 0007 gives
 * hover an 8 ms budget and no React render on the path. Vertex colours avoid recompiles, extra
 * draw calls and material swaps.
 */

import type { BufferAttribute, BufferGeometry } from 'three';
import type { FaceVertices } from './mesh.js';

export type FaceColour = readonly [number, number, number];

/** Grey with a hint of blue: reads as material and not as "untextured". */
export const BASE_COLOUR: FaceColour = [0.78, 0.8, 0.82];
export const HOVER_COLOUR: FaceColour = [0.55, 0.76, 0.98];
export const SELECTED_COLOUR: FaceColour = [0.16, 0.66, 0.81];

/** Line colour for a picked edge or face border: the selection cyan at full strength. */
export const OUTLINE_COLOUR = 0x2ec0f0;

/**
 * Fill and hover colours for a selection colour, as `0xRRGGBB` (audit D12). The default has tuned
 * values; any other colour fills at 90% over the base grey and hovers at 50%.
 */
export function selectionShades(hex: number): { fill: FaceColour; hover: FaceColour } {
  if (hex === OUTLINE_COLOUR) return { fill: SELECTED_COLOUR, hover: HOVER_COLOUR };
  const colour: FaceColour = [
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255,
  ];
  const mix = (t: number): FaceColour => [
    BASE_COLOUR[0] + (colour[0] - BASE_COLOUR[0]) * t,
    BASE_COLOUR[1] + (colour[1] - BASE_COLOUR[1]) * t,
    BASE_COLOUR[2] + (colour[2] - BASE_COLOUR[2]) * t,
  ];
  return { fill: mix(0.9), hover: mix(0.5) };
}

/**
 * Keeps the colour buffer in step with hover and selection, repainting only the difference to stay
 * within the 8 ms budget on large models.
 */
export class Highlighter {
  #colours: BufferAttribute | null = null;
  #faces: FaceVertices | null = null;

  #hovered: readonly number[] = [];
  #selected: readonly number[] = [];
  /** The same two sets for O(1) lookup; list scans are quadratic for large selections. */
  #hoveredSet: ReadonlySet<number> = new Set();
  #selectedSet: ReadonlySet<number> = new Set();
  #fill: FaceColour = SELECTED_COLOUR;
  #hover: FaceColour = HOVER_COLOUR;

  /** Each face's own colour, three floats a face; the base colour where absent. */
  #own: Float32Array | undefined;

  /**
   * Other drawings of the same faces, painted alike: a part drawn finer or coarser (`lod-body.ts`).
   */
  readonly #mirrors = new Set<(face: number, colour: FaceColour) => void>();

  /** Mirrors painting onto another drawing of these faces; returns a function that stops it. */
  addMirror(paint: (face: number, colour: FaceColour) => void): () => void {
    this.#mirrors.add(paint);
    for (const face of new Set([...this.#hovered, ...this.#selected])) {
      paint(face, this.#colourOf(face));
    }
    return () => this.#mirrors.delete(paint);
  }

  setGeometry(
    geometry: BufferGeometry | null,
    faces: FaceVertices | null,
    own?: Float32Array,
  ): void {
    this.#colours = (geometry?.getAttribute('color') as BufferAttribute | undefined) ?? null;
    this.#faces = faces;
    this.#own = own;
    // New geometry arrives in the base colour; the old sets may name faces that no longer exist.
    this.#hovered = [];
    this.#selected = [];
    this.#hoveredSet = new Set();
    this.#selectedSet = new Set();
  }

  /** The selection colour, as `0xRRGGBB`; what is hovered and selected now is repainted in it. */
  setColour(hex: number): void {
    const { fill, hover } = selectionShades(hex);
    this.#fill = fill;
    this.#hover = hover;
    for (const face of new Set([...this.#hovered, ...this.#selected])) {
      this.#paint(face, this.#colourOf(face));
    }
  }

  setHovered(faces: readonly number[]): void {
    if (same(this.#hovered, faces)) return;
    const previous = this.#hovered;
    this.#hovered = faces;
    this.#hoveredSet = new Set(faces);
    this.#repaint(previous, this.#hoveredSet, faces);
  }

  setSelected(faces: readonly number[]): void {
    if (same(this.#selected, faces)) return;
    const previous = this.#selected;
    this.#selected = faces;
    this.#selectedSet = new Set(faces);
    this.#repaint(previous, this.#selectedSet, faces);
  }

  /** Repaints faces that left or joined a set; `#colourOf` decides the resulting colour. */
  #repaint(before: readonly number[], now: ReadonlySet<number>, after: readonly number[]): void {
    for (const face of before) if (!now.has(face)) this.#paint(face, this.#colourOf(face));
    for (const face of after) this.#paint(face, this.#colourOf(face));
  }

  /** Selection outranks hover: a selected face keeps the selection colour while hovered. */
  #colourOf(face: number): FaceColour {
    if (this.#selectedSet.has(face)) return this.#fill;
    if (this.#hoveredSet.has(face)) return this.#hover;
    // Back to the face's own colour (e.g. from an imported file), not the default.
    const own = this.#own;
    if (own === undefined || own.length < face * 3 + 3) return BASE_COLOUR;
    return [
      own[face * 3] ?? BASE_COLOUR[0],
      own[face * 3 + 1] ?? BASE_COLOUR[1],
      own[face * 3 + 2] ?? BASE_COLOUR[2],
    ];
  }

  #paint(face: number, colour: FaceColour): void {
    for (const mirror of this.#mirrors) mirror(face, colour);
    const colours = this.#colours;
    const faces = this.#faces;
    if (colours === null || faces === null) return;
    if (face < 0 || face >= faces.faceCount) return;

    const from = faces.offsets[face] ?? 0;
    const to = faces.offsets[face + 1] ?? from;

    const array = colours.array as Float32Array;
    for (let i = from; i < to; i++) {
      const vertex = (faces.vertices[i] ?? 0) * 3;
      array[vertex] = colour[0];
      array[vertex + 1] = colour[1];
      array[vertex + 2] = colour[2];
    }
    colours.needsUpdate = true;
  }
}

/**
 * Whether two face sets are equal in order. Skips repaints when hover stays on the same face, which
 * would otherwise re-upload the whole colour buffer. Order-sensitive: the picker's order is
 * deterministic.
 */
function same(a: readonly number[], b: readonly number[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
