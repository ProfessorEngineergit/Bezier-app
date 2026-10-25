/**
 * Part colours and names read from a STEP file's text. Reading through XCAF took 408 s against
 * 52 s for the plain reader on the Voron, and occt-wasm then reported no colours
 * (`tools/spikes/step-colors.ts`). So the text is scanned for
 * `STYLED_ITEM → PRESENTATION_STYLE_ASSIGNMENT → SURFACE_STYLE_USAGE → … → COLOUR_RGB`
 * on a `MANIFOLD_SOLID_BREP` or its `ADVANCED_FACE`s.
 *
 * Solids are matched to breps by signature (the kinds of their faces in shell order). Solids that
 * share a signature are matched by order, since OCCT builds solids in file order (audit F-056);
 * only where the counts differ (one part placed several times) is the majority colour used.
 * Unmatched solids keep the default look. Per-placement colours
 * (`CONTEXT_DEPENDENT_OVER_RIDING_STYLED_ITEM`) are not read.
 */

/** A colour as 0xRRGGBB; `NO_COLOUR` where the file gives none. */
export const NO_COLOUR = 0xffffffff;

/** What colours a file holds, by the signature of the solids they belong to. */
export interface StepColors {
  /** Signature → the solid's colour and each face's, in face order: the one most share. */
  solids: ReadonlyMap<string, { solid: number; faces: readonly number[] | null }>;
  /** Signature → every brep with it, in file order, coloured or not. */
  inOrder: ReadonlyMap<string, readonly { solid: number; faces: readonly number[] | null }[]>;
}

/** What names a file gives its parts: each brep's part name, by the signature of the solid. */
export interface StepNames {
  /** Signature → the name of every brep with it, in file order; null where the file has none. */
  inOrder: ReadonlyMap<string, readonly (string | null)[]>;
}

/** What a file's text says about its parts: colours and names. */
export interface StepParts {
  colors: StepColors | null;
  names: StepNames | null;
}

/** Surface entities, by the one-letter kind OCCT's `surfaceType` agrees with. */
const SURFACE_KIND: Readonly<Record<string, string>> = {
  PLANE: 'p',
  CYLINDRICAL_SURFACE: 'c',
  CONICAL_SURFACE: 'k',
  SPHERICAL_SURFACE: 's',
  TOROIDAL_SURFACE: 't',
  DEGENERATE_TOROIDAL_SURFACE: 't',
  B_SPLINE_SURFACE_WITH_KNOTS: 'b',
  B_SPLINE_SURFACE: 'b',
  UNIFORM_SURFACE: 'b',
  QUASI_UNIFORM_SURFACE: 'b',
  BEZIER_SURFACE: 'z',
  SURFACE_OF_REVOLUTION: 'r',
  SURFACE_OF_LINEAR_EXTRUSION: 'e',
  OFFSET_SURFACE: 'o',
};

/** OCCT's `surfaceType` names, in the same letters. */
export const OCCT_KIND: Readonly<Record<string, string>> = {
  plane: 'p',
  cylinder: 'c',
  cone: 'k',
  sphere: 's',
  torus: 't',
  bspline: 'b',
  bezier: 'z',
  revolution: 'r',
  extrusion: 'e',
  offset: 'o',
};

const STYLE_TYPES = new Set([
  'FILL_AREA_STYLE_COLOUR',
  'FILL_AREA_STYLE',
  'SURFACE_STYLE_FILL_AREA',
  'SURFACE_SIDE_STYLE',
  'SURFACE_STYLE_USAGE',
  'PRESENTATION_STYLE_ASSIGNMENT',
  'PRESENTATION_STYLE_BY_CONTEXT',
]);

/** Every `#id` reference in a stretch of a statement, in order. */
export function refsIn(text: string): number[] {
  const out: number[] = [];
  let at = text.indexOf('#');
  while (at !== -1) {
    let end = at + 1;
    let id = 0;
    while (end < text.length) {
      const code = text.charCodeAt(end);
      if (code < 48 || code > 57) break;
      id = id * 10 + (code - 48);
      end += 1;
    }
    if (end > at + 1) out.push(id);
    at = text.indexOf('#', end);
  }
  return out;
}

/** The file's colours, or null when it has none. */
export function parseStepColors(text: string): StepColors | null {
  return parseStepParts(text).colors;
}

/**
 * The name if user-given, not exporter-generated: Open CASCADE's writer calls every product
 * "Open CASCADE STEP translator 7.8 1".
 */
function usable(name: string | undefined): string | null {
  if (name === undefined) return null;
  const trimmed = name.trim();
  return trimmed === '' || /^(Open CASCADE|NONE$|UNKNOWN$)/i.test(trimmed) ? null : trimmed;
}

/** The text between the first two quotes of a statement's argument list, or the nth string. */
function stringAt(body: string, nth: number): string | undefined {
  let at = 0;
  for (let i = 0; i <= nth; i++) {
    const open = body.indexOf("'", at);
    if (open === -1) return undefined;
    // A quote inside a string is written twice.
    let close = open + 1;
    while (close < body.length) {
      const next = body.indexOf("'", close);
      if (next === -1) return undefined;
      if (body[next + 1] === "'") {
        close = next + 2;
        continue;
      }
      close = next;
      break;
    }
    if (i === nth) return body.slice(open + 1, close).replace(/''/g, "'");
    at = close + 1;
  }
  return undefined;
}

/** The file's colours and the names it gives its parts. */
export function parseStepParts(text: string): StepParts {
  const rgb = new Map<number, number>();
  const styles = new Map<number, number[]>();
  const styled: { styles: number[]; item: number }[] = [];
  const breps = new Map<number, number[]>();
  const shells = new Map<number, number[]>();
  /** An oriented shell, by the shell it turns: often defined further down the file. */
  const shellAlias = new Map<number, number>();
  const faceSurface = new Map<number, number>();
  const surfaceKind = new Map<number, string>();
  const trimmedBasis = new Map<number, number>();
  // The chain from a brep to the name of its part: the representation that lists it, the product
  // definition shape that representation is of, and from there the definition, its formation and
  // the product, which carries the name.
  const repItems = new Map<number, number[]>();
  const repShape = new Map<number, number>();
  /** Representations a file says are of one thing: the brep's is linked to the product's. */
  const repLinks = new Map<number, number[]>();
  const shapeDefinition = new Map<number, number>();
  const definitionFormation = new Map<number, number>();
  const formationProduct = new Map<number, number>();
  const productName = new Map<number, string>();
  /** What the file calls each brep itself: the part's name in some programs, "Body1" in others. */
  const brepLabel = new Map<number, string>();

  // One statement at a time, up to the `;` that ends it outside a string. Statements run
  // across lines and names can hold anything.
  let start = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 39) quoted = !quoted;
    else if (code === 59 && !quoted) {
      handle(text.slice(start, i));
      start = i + 1;
    }
  }

  function handle(statement: string): void {
    const hash = statement.indexOf('#');
    const equals = statement.indexOf('=', hash);
    if (hash === -1 || equals === -1) return;
    const id = Number(statement.slice(hash + 1, equals));
    if (!Number.isFinite(id)) return;
    let body = statement.slice(equals + 1).trimStart();
    if (body.startsWith('(')) {
      // A complex entity: a rational B-spline surface is the one that matters.
      if (body.includes('B_SPLINE_SURFACE')) surfaceKind.set(id, 'b');
      return;
    }
    const open = body.indexOf('(');
    if (open === -1) return;
    const type = body.slice(0, open).trim();
    body = body.slice(open);
    const kind = SURFACE_KIND[type];
    if (kind !== undefined) {
      surfaceKind.set(id, kind);
      return;
    }
    switch (type) {
      case 'COLOUR_RGB': {
        const numbers = body.slice(body.lastIndexOf("'") + 1).match(/-?[\d.]+(?:[eE][-+]?\d+)?/g);
        if (numbers === null || numbers.length < 3) return;
        const [r, g, b] = numbers
          .slice(-3)
          .map((n) => Math.round(Math.min(1, Math.max(0, Number(n))) * 255));
        rgb.set(id, ((r ?? 0) << 16) | ((g ?? 0) << 8) | (b ?? 0));
        return;
      }
      case 'STYLED_ITEM':
      case 'OVER_RIDING_STYLED_ITEM': {
        // ('name', (#style, …), #item[, #over])
        const close = body.indexOf(')', body.indexOf('(', 1));
        const [item] = refsIn(body.slice(close));
        if (item !== undefined) styled.push({ styles: refsIn(body.slice(0, close)), item });
        return;
      }
      case 'SHAPE_REPRESENTATION':
      case 'ADVANCED_BREP_SHAPE_REPRESENTATION':
      case 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION':
        repItems.set(id, refsIn(body));
        return;
      case 'SHAPE_REPRESENTATION_RELATIONSHIP': {
        const [one, other] = refsIn(body);
        if (one !== undefined && other !== undefined) {
          repLinks.set(one, [...(repLinks.get(one) ?? []), other]);
          repLinks.set(other, [...(repLinks.get(other) ?? []), one]);
        }
        return;
      }
      case 'SHAPE_DEFINITION_REPRESENTATION': {
        const [shape, rep] = refsIn(body);
        if (shape !== undefined && rep !== undefined) repShape.set(rep, shape);
        return;
      }
      case 'PRODUCT_DEFINITION_SHAPE': {
        const definition = refsIn(body)[0];
        if (definition !== undefined) shapeDefinition.set(id, definition);
        return;
      }
      case 'PRODUCT_DEFINITION': {
        const formation = refsIn(body)[0];
        if (formation !== undefined) definitionFormation.set(id, formation);
        return;
      }
      case 'PRODUCT_DEFINITION_FORMATION':
      case 'PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE': {
        const product = refsIn(body)[0];
        if (product !== undefined) formationProduct.set(id, product);
        return;
      }
      case 'PRODUCT': {
        const name = usable(stringAt(body, 1)) ?? usable(stringAt(body, 0));
        if (name !== null) productName.set(id, name);
        return;
      }
      case 'MANIFOLD_SOLID_BREP':
      case 'BREP_WITH_VOIDS': {
        const label = usable(stringAt(body, 0));
        // "Body1", "Body1 (1)", "Solid 3": a body of the program it came from, not a name.
        if (label !== null && !/^(body|solid|part|brep)[\s_-]*\d*(\s*\(\d+\))?$/i.test(label))
          brepLabel.set(id, label);
        breps.set(id, refsIn(body));
        return;
      }
      case 'CLOSED_SHELL':
      case 'OPEN_SHELL':
        shells.set(id, refsIn(body));
        return;
      case 'ORIENTED_CLOSED_SHELL': {
        const [shell] = refsIn(body);
        if (shell !== undefined) shellAlias.set(id, shell);
        return;
      }
      case 'ADVANCED_FACE':
      case 'FACE_SURFACE': {
        const refs = refsIn(body);
        const surface = refs[refs.length - 1];
        if (surface !== undefined) faceSurface.set(id, surface);
        return;
      }
      case 'RECTANGULAR_TRIMMED_SURFACE':
      case 'CURVE_BOUNDED_SURFACE': {
        const [basis] = refsIn(body);
        if (basis !== undefined) trimmedBasis.set(id, basis);
        return;
      }
      default:
        if (STYLE_TYPES.has(type)) styles.set(id, refsIn(body));
    }
  }

  // A brep's part: found backwards, from the representations that list the brep.
  const partOf = new Map<number, string>();
  const productOf = (rep: number): string | undefined =>
    productName.get(
      formationProduct.get(
        definitionFormation.get(shapeDefinition.get(repShape.get(rep) ?? -1) ?? -1) ?? -1,
      ) ?? -1,
    );
  for (const [rep, items] of repItems) {
    // The representation's own product, or that of one the file links it to.
    const name =
      productOf(rep) ?? (repLinks.get(rep) ?? []).map(productOf).find((n) => n !== undefined);
    if (name === undefined) continue;
    for (const item of items) if (breps.has(item) && !partOf.has(item)) partOf.set(item, name);
  }
  for (const [brep, label] of brepLabel) if (!partOf.has(brep)) partOf.set(brep, label);

  const colourOf = (id: number, depth = 0): number | undefined => {
    const direct = rgb.get(id);
    if (direct !== undefined || depth > 8) return direct;
    for (const next of styles.get(id) ?? []) {
      const found = colourOf(next, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  const itemColour = new Map<number, number>();
  for (const { styles: assigned, item } of styled) {
    for (const style of assigned) {
      const colour = colourOf(style);
      if (colour !== undefined) {
        itemColour.set(item, colour);
        break;
      }
    }
  }

  const kindOfFace = (face: number): string => {
    let surface = faceSurface.get(face);
    for (let i = 0; surface !== undefined && i < 4; i++) {
      const kind = surfaceKind.get(surface);
      if (kind !== undefined) return kind;
      surface = trimmedBasis.get(surface);
    }
    return '?';
  };

  // Every brep's signature and the colours it was given; votes where parts that look alike
  // were coloured differently.
  const votes = new Map<string, Map<string, number>>();
  const inOrder = new Map<string, { solid: number; faces: readonly number[] | null }[]>();
  const namesInOrder = new Map<string, (string | null)[]>();
  for (const [brep, refs] of breps) {
    const faces = refs.flatMap((shell) => shells.get(shellAlias.get(shell) ?? shell) ?? []);
    if (faces.length === 0) continue;
    const signature = faces.map(kindOfFace).join('');
    const solid =
      itemColour.get(brep) ??
      refs.map((shell) => itemColour.get(shell)).find((c) => c !== undefined);
    const perFace = faces.map((face) => itemColour.get(face) ?? NO_COLOUR);
    const hasFaces = perFace.some((colour) => colour !== NO_COLOUR);
    const listed = inOrder.get(signature) ?? [];
    listed.push({ solid: solid ?? NO_COLOUR, faces: hasFaces ? perFace : null });
    inOrder.set(signature, listed);
    const named = namesInOrder.get(signature) ?? [];
    named.push(partOf.get(brep) ?? null);
    namesInOrder.set(signature, named);
    if (solid === undefined && !hasFaces) continue;
    const entry = JSON.stringify([solid ?? NO_COLOUR, hasFaces ? perFace : null]);
    const tally = votes.get(signature) ?? new Map<string, number>();
    tally.set(entry, (tally.get(entry) ?? 0) + 1);
    votes.set(signature, tally);
  }

  const solids = new Map<string, { solid: number; faces: readonly number[] | null }>();
  for (const [signature, tally] of votes) {
    let best = '';
    let most = 0;
    for (const [entry, count] of tally) {
      if (count > most) {
        best = entry;
        most = count;
      }
    }
    const [solid, faces] = JSON.parse(best) as [number, number[] | null];
    solids.set(signature, { solid, faces });
  }
  const hasNames = [...namesInOrder.values()].some((list) => list.some((name) => name !== null));
  return {
    colors: solids.size === 0 ? null : { solids, inOrder },
    names: hasNames ? { inOrder: namesInOrder } : null,
  };
}

type RawKernel = Awaited<ReturnType<typeof import('./wasm.js').loadOcct>>;
type RawHandle = ReturnType<RawKernel['makeBox']>;

/**
 * Each face's colour in `faceHashes` order, or null when no solid was recognised. Valid only for a
 * compound of solids sharing no faces (as imports are); anything else gets no colours.
 */
export function coloursOf(
  occt: RawKernel,
  shape: RawHandle,
  colours: StepColors,
): Uint32Array | null {
  const solids = occt.getSubShapes(shape, 'solid');
  const out: number[] = [];
  let matched = 0;
  try {
    const signatures = solids.map((solid) => {
      const faces = occt.getSubShapes(solid, 'face');
      const kinds = faces.map((face) => OCCT_KIND[String(occt.surfaceType(face))] ?? '?');
      for (const face of faces) occt.release(face);
      return kinds;
    });
    const built = new Map<string, number>();
    for (const kinds of signatures) built.set(kinds.join(''), (built.get(kinds.join('')) ?? 0) + 1);
    const seen = new Map<string, number>();
    for (const kinds of signatures) {
      const signature = kinds.join('');
      const nth = seen.get(signature) ?? 0;
      seen.set(signature, nth + 1);
      const listed = colours.inOrder.get(signature);
      const own = listed?.length === built.get(signature) ? listed?.[nth] : undefined;
      const coloured = own !== undefined && (own.solid !== NO_COLOUR || own.faces !== null);
      const known = coloured ? own : own !== undefined ? undefined : colours.solids.get(signature);
      if (known !== undefined) matched += 1;
      kinds.forEach((_, index) => {
        if (known === undefined) {
          out.push(NO_COLOUR);
          return;
        }
        const own = known.faces?.[index] ?? NO_COLOUR;
        out.push(own !== NO_COLOUR ? own : known.solid);
      });
    }
  } finally {
    for (const solid of solids) occt.release(solid);
  }
  if (matched === 0 || out.length !== occt.subShapeCount(shape, 'face')) return null;
  return Uint32Array.from(out);
}

/**
 * Each solid's part name in shape order, with its face count (faces are numbered across the shape).
 * Null when no solid was recognised. Matched as colours are; a part placed several times is one
 * brep and several solids sharing its name.
 */
export function namesOf(
  occt: RawKernel,
  shape: RawHandle,
  names: StepNames,
): { names: (string | null)[]; faces: number[] } | null {
  const solids = occt.getSubShapes(shape, 'solid');
  const out: (string | null)[] = [];
  const faceCounts: number[] = [];
  try {
    const signatures = solids.map((solid) => {
      const faces = occt.getSubShapes(solid, 'face');
      const kinds = faces.map((face) => OCCT_KIND[String(occt.surfaceType(face))] ?? '?');
      for (const face of faces) occt.release(face);
      return kinds.join('');
    });
    const built = new Map<string, number>();
    for (const signature of signatures) built.set(signature, (built.get(signature) ?? 0) + 1);
    const seen = new Map<string, number>();
    signatures.forEach((signature) => {
      const nth = seen.get(signature) ?? 0;
      seen.set(signature, nth + 1);
      const listed = names.inOrder.get(signature);
      let name: string | null = null;
      if (listed !== undefined) {
        if (listed.length === built.get(signature)) name = listed[nth] ?? null;
        else if (listed.length === 1) name = listed[0] ?? null;
      }
      out.push(name);
      faceCounts.push(signature.length);
    });
  } finally {
    for (const solid of solids) occt.release(solid);
  }
  return out.some((name) => name !== null) ? { names: out, faces: faceCounts } : null;
}
