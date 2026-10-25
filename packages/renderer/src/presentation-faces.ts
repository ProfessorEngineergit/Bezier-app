/**
 * Face hover, selection and colour in the presentation, through a per-vertex colour (white by
 * default) multiplied with the body material, so painted faces keep the body's finish at no extra
 * draw cost. Each face is one contiguous triangle run, found once per geometry.
 */

import { formatRef, type StableRef } from '@bezier/core';
import { BufferAttribute, type BufferGeometry, Color } from 'three/webgpu';

/** One body's mesh as far as faces go. */
export interface FacePiece {
  body: string;
  geometry: BufferGeometry;
  /** The face (index into the display's `faceRefs`) of each triangle. */
  faces: Uint32Array;
}

/** What is painted. */
export interface FaceLook {
  /** Colour per face, by the face's text name (`F:extrude-1:side-2`). */
  colours: Readonly<Record<string, string>>;
  hover: string | null;
  selected: readonly string[];
}

export const NO_FACE_LOOK: FaceLook = { colours: {}, hover: null, selected: [] };

/** How far a tint pulls a face's colour to the accent. */
const SELECTED_TINT = 0.55;
const HOVER_TINT = 0.3;

const scratch = new Color();
const accentScratch = new Color();

interface Run {
  piece: FacePiece;
  start: number;
  count: number;
}

export class PresentationFaces {
  #runs = new Map<number, Run>();
  #refs: readonly (StableRef | null)[] = [];
  #indexOf = new Map<string, number>();
  #painted = new Set<string>();
  #look: FaceLook = NO_FACE_LOOK;
  #accent = '#0a84ff';

  /**
   * The faces of the pieces just built; everything painted before is forgotten with the old mesh.
   */
  setPieces(pieces: readonly FacePiece[], refs: readonly (StableRef | null)[]) {
    this.#runs.clear();
    this.#indexOf.clear();
    this.#painted.clear();
    this.#refs = refs;
    for (const piece of pieces) {
      const { faces } = piece;
      let start = 0;
      for (let t = 1; t <= faces.length; t++) {
        if (t < faces.length && faces[t] === faces[start]) continue;
        const face = faces[start];
        if (face !== undefined) this.#runs.set(face, { piece, start, count: t - start });
        start = t;
      }
    }
    refs.forEach((ref, index) => {
      if (ref?.kind === 'face') this.#indexOf.set(formatRef(ref), index);
    });
    this.paint(this.#look);
  }

  /** The text name of a face by its index, or null for one with no stable name. */
  keyOf(index: number): string | null {
    const ref = this.#refs[index];
    return ref?.kind === 'face' ? formatRef(ref) : null;
  }

  /** The selection colour picked faces are tinted towards; what is painted now takes it at once. */
  setAccent(colour: string) {
    if (colour === this.#accent) return;
    this.#accent = colour;
    this.paint(this.#look);
  }

  /** Bring the mesh to `look`, touching only the faces that were painted or are now. */
  paint(look: FaceLook) {
    const touched = new Set<string>([
      ...this.#painted,
      ...Object.keys(look.colours),
      ...look.selected,
      ...(look.hover === null ? [] : [look.hover]),
    ]);
    this.#look = look;
    this.#painted = new Set([
      ...Object.keys(look.colours),
      ...look.selected,
      ...(look.hover === null ? [] : [look.hover]),
    ]);
    const selected = new Set(look.selected);
    accentScratch.set(this.#accent);
    for (const key of touched) {
      const index = this.#indexOf.get(key);
      const run = index === undefined ? undefined : this.#runs.get(index);
      if (run === undefined) continue;
      scratch.set(look.colours[key] ?? '#ffffff');
      if (selected.has(key)) scratch.lerp(accentScratch, SELECTED_TINT);
      else if (key === look.hover) scratch.lerp(accentScratch, HOVER_TINT);
      const colours = run.piece.geometry.getAttribute('color');
      const indices = run.piece.geometry.getIndex();
      if (!(colours instanceof BufferAttribute) || indices === null) continue;
      for (let t = run.start; t < run.start + run.count; t++) {
        for (let k = 0; k < 3; k++) {
          const vertex = indices.getX(t * 3 + k);
          colours.setXYZ(vertex, scratch.r, scratch.g, scratch.b);
        }
      }
      colours.needsUpdate = true;
    }
  }

  /** The face a triangle of a body belongs to, as its text name. */
  faceOf(body: string, triangle: number, pieces: ReadonlyMap<string, FacePiece>): string | null {
    const face = pieces.get(body)?.faces[triangle];
    return face === undefined ? null : this.keyOf(face);
  }
}
