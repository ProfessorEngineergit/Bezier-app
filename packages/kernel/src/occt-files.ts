/**
 * File I/O for `occt-kernel.ts`: STEP and STL export by part (`export-parts.ts`), STEP and IGES
 * import, and caching of imports beside their shapes (`shape-store.ts`).
 */
import { type KernelResult, ok } from './errors.js';
import {
  exportStepFileInParts,
  exportStepInParts,
  exportStlInParts,
  partsByFace,
} from './export-parts.js';
import { type FaceOutline, faceOutlines } from './face-outlines.js';
import { solidsFromIges } from './iges.js';
import type { ImportColours, ImportNames } from './import-colours.js';
import type { KeptDisplays } from './kept-displays.js';
import type { ImportOptions, StepPart } from './kernel.js';
import { attempt } from './occt-support.js';
import { keyOf, opened, type ShapeStore, sealed } from './shape-store.js';
import { DEFAULT_TESSELLATION, type FaceHash, type ShapeId } from './types.js';
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type RawHandle = ReturnType<RawKernel['makeBox']>;

/** What the kernel lends this: its shape table and the means it was built with. */
interface Lent {
  track: (handle: RawHandle) => ShapeId;
  resolve: (id: ShapeId) => RawHandle;
  faceHashes: (shape: RawHandle) => FaceHash[];
  alive: (budgetMs?: number) => void;
  store: ShapeStore | undefined;
  kept: KeptDisplays | undefined;
  colours: ImportColours;
}

export class ShapeFiles {
  readonly #occt: RawKernel;
  readonly #with: Lent;

  constructor(occt: RawKernel, lent: Lent) {
    this.#occt = occt;
    this.#with = lent;
  }

  async exportStep(shape: ShapeId): Promise<KernelResult<string>> {
    const write = () => exportStepInParts(this.#occt, this.#with.resolve(shape), this.#with.alive);
    return attempt('io-failed', 'This shape could not be written as STEP.', write);
  }

  async exportStepFile(
    shape: ShapeId,
    parts?: readonly StepPart[],
  ): Promise<KernelResult<Uint8Array>> {
    const nameOf =
      parts === undefined ? undefined : partsByFace(parts, (s) => this.#with.faceHashes(s));
    const write = () =>
      exportStepFileInParts(this.#occt, this.#with.resolve(shape), this.#with.alive, nameOf);
    return attempt('io-failed', 'This shape could not be written as STEP.', write);
  }

  /** Binary STL, as bytes since occt-wasm 5. */
  async exportStl(
    shape: ShapeId,
    options = DEFAULT_TESSELLATION,
  ): Promise<KernelResult<Uint8Array>> {
    const write = () =>
      exportStlInParts(this.#occt, this.#with.resolve(shape), options, this.#with.alive);
    return attempt('io-failed', 'This shape could not be written as STL.', write);
  }

  async importStep(data: string, options: ImportOptions = {}): Promise<KernelResult<ShapeId>> {
    const reuse = options.reuse === true;
    const store = reuse ? this.#with.store : undefined;
    // Keyed whenever the import is named in file order, with or without a store: colours are kept
    // under the key too and are needed without file storage as well.
    const key = reuse ? (options.key ?? keyOf(data)) : null;
    if (store !== undefined && key !== null) {
      const kept = await this.importKept(key);
      if (kept.ok && kept.value !== null) return ok(kept.value);
    }
    const read = attempt('io-failed', 'This STEP file could not be read.', () =>
      // Loose surfaces that close around a volume come in as that solid (F-017).
      this.#with.track(solidsFromIges(this.#occt, this.#occt.importStep(data))),
    );
    if (read.ok && key !== null) {
      const shape = this.#with.resolve(read.value);
      if (store !== undefined) {
        try {
          await store.write(key, await sealed(this.#occt.toBREPBinary(shape)));
          this.#with.kept?.remember(key, shape);
        } catch {
          // Storing only saves time later.
        }
      }
      // Stored apart from the shape, whose write can fail (WebKit offers the file system and then
      // refuses to open it in a restricted profile; WebKit on Linux has none).
      try {
        await this.#with.colours.keep(key, data, shape);
      } catch {
        // Colours are a nicety; a model without them is still the model.
      }
    }
    return read;
  }

  async importIges(data: string): Promise<KernelResult<ShapeId>> {
    const read = () => this.#with.track(solidsFromIges(this.#occt, this.#occt.importIges(data)));
    return attempt('io-failed', 'This IGES file could not be read.', read);
  }

  /** The flat faces of a shape as outlines on their planes (`face-outlines.ts`). */
  async flatOutlines(shape: ShapeId): Promise<KernelResult<FaceOutline[]>> {
    const read = () => faceOutlines(this.#occt, this.#with.resolve(shape));
    return attempt('invalid-result', 'The faces of this shape could not be read.', read);
  }

  async importColours(
    key: string,
    data?: string,
  ): Promise<KernelResult<Uint32Array | null | undefined>> {
    return ok(await this.#with.colours.get(key, data));
  }

  async importNames(
    key: string,
    data?: string,
  ): Promise<KernelResult<ImportNames | null | undefined>> {
    return ok(await this.#with.colours.getNames(key, data));
  }

  async importKept(key: string): Promise<KernelResult<ShapeId | null>> {
    const store = this.#with.store;
    if (store === undefined) return ok(null);
    const kept = await store
      .read(key)
      .then((entry) => (entry === null ? null : opened(entry)))
      .catch(() => null);
    if (kept === null) return ok(null);
    const restored = attempt('io-failed', 'This STEP file could not be read.', () =>
      this.#with.track(this.#occt.fromBREPBinary(kept)),
    );
    if (!restored.ok) return ok(null);
    this.#with.kept?.remember(key, this.#with.resolve(restored.value));
    return restored;
  }
}
