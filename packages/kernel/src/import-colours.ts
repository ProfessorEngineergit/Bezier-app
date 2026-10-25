/**
 * The colours and part names of imported files, kept beside their shapes in the store. Read from
 * the file's text (`step-colors.ts`) when it is first read, and written under their own keys so a
 * reopened file keeps them without parsing the text again.
 */

import { opened, type ShapeStore, sealed } from './shape-store.js';
import { coloursOf, NO_COLOUR, namesOf, parseStepParts } from './step-colors.js';
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type RawHandle = ReturnType<RawKernel['makeBox']>;

/** Where a file's colours are kept, beside its shape. */
function coloursKey(key: string): string {
  return `${key}-colours-1`;
}

/** Where a file's part names are kept. */
function namesKey(key: string): string {
  return `${key}-names-1`;
}

/** The part name of each solid of an import, in the shape's order, and how many faces each has. */
export interface ImportNames {
  names: (string | null)[];
  faces: number[];
}

export class ImportColours {
  readonly #occt: RawKernel;
  readonly #store: ShapeStore | undefined;
  /** By key: the colours, null for none, absent while unknown. */
  readonly #known = new Map<string, Uint32Array | null>();
  readonly #knownNames = new Map<string, ImportNames | null>();

  constructor(occt: RawKernel, store: ShapeStore | undefined) {
    this.#occt = occt;
    this.#store = store;
  }

  /** Read the file's colours from its text and keep them with its shape. */
  async keep(key: string, data: string, shape: RawHandle): Promise<void> {
    const parts = parseStepParts(data);
    const colours = parts.colors === null ? null : coloursOf(this.#occt, shape, parts.colors);
    this.#known.set(key, colours);
    const names = parts.names === null ? null : namesOf(this.#occt, shape, parts.names);
    this.#knownNames.set(key, names);
    // Names are kept even when empty, so the file is not parsed for them again.
    await this.#store
      ?.write(namesKey(key), await sealed(new TextEncoder().encode(JSON.stringify(names))))
      .catch(() => undefined);
    // Kept even when there are none, as one face without a colour (a sealed entry cannot be
    // empty), so a file without colours is not read for them on every open.
    const kept = colours ?? Uint32Array.of(NO_COLOUR);
    await this.#store?.write(
      coloursKey(key),
      await sealed(new Uint8Array(kept.buffer, kept.byteOffset, kept.byteLength)),
    );
  }

  /** As `GeometryKernel.importColours`. */
  async get(key: string, data?: string): Promise<Uint32Array | null | undefined> {
    let colours = this.#known.get(key);
    if (colours === undefined) {
      const entry = await this.#store
        ?.read(coloursKey(key))
        .then((bytes) => (bytes === null ? null : opened(bytes)))
        .catch(() => null);
      if (entry !== null && entry !== undefined) {
        const read = entry.byteLength % 4 === 0 ? new Uint32Array(entry.slice().buffer) : null;
        colours = read?.some((colour) => colour !== NO_COLOUR) === true ? read : null;
        this.#known.set(key, colours);
      } else if (data !== undefined) {
        await this.#backfill(key, data);
        colours = this.#known.get(key);
      }
    }
    // A copy: what is sent back is moved out of this worker, and the kept one has to stay
    // for the next request.
    return colours === undefined || colours === null ? colours : colours.slice();
  }

  /** As `GeometryKernel.importNames`. */
  async getNames(key: string, data?: string): Promise<ImportNames | null | undefined> {
    let names = this.#knownNames.get(key);
    if (names === undefined) {
      const entry = await this.#store
        ?.read(namesKey(key))
        .then((bytes) => (bytes === null ? null : opened(bytes)))
        .catch(() => null);
      if (entry !== null && entry !== undefined) {
        try {
          names = JSON.parse(new TextDecoder().decode(entry)) as ImportNames | null;
        } catch {
          names = null;
        }
        this.#knownNames.set(key, names);
      } else if (data !== undefined) {
        await this.#backfill(key, data);
        names = this.#knownNames.get(key);
      }
    }
    return names;
  }

  /**
   * Fills in colours for a file stored before colours were kept, read from its text against the
   * kept shape, whose face order matches the faces drawn.
   */
  async #backfill(key: string, data: string): Promise<void> {
    const kept = await this.#store
      ?.read(key)
      .then((entry) => (entry === null ? null : opened(entry)))
      .catch(() => null);
    if (kept === null || kept === undefined) return;
    let shape: RawHandle | undefined;
    try {
      shape = this.#occt.fromBREPBinary(kept);
      await this.keep(key, data, shape);
    } catch {
      // Colours are a nicety; a model without them is still the model.
    } finally {
      if (shape !== undefined) this.#occt.release(shape);
    }
  }
}
