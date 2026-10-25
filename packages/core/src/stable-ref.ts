/**
 * Stable references to geometry and their canonical text form (see ../README.md). Faces are named
 * by the feature that made them; edges and vertices by the faces they lie between. No kernel
 * dependency.
 */

/** Identifies a feature in the document's history, e.g. `extrude-1`. */
export type FeatureId = string;

/**
 * A face of a feature's output, e.g. an extrude's `start`, `end` and `side-<n>`. Part of the
 * feature's contract; must not change once saved documents use it.
 */
export type FaceTag = string;

/**
 * A face, named by the feature that created it. The only primitive reference, since faces are what
 * the kernel tracks through operations.
 */
export interface FaceRef {
  readonly kind: 'face';
  readonly feature: FeatureId;
  readonly tag: FaceTag;
}

/** An edge, named by its two adjacent faces in canonical order. */
export interface EdgeRef {
  readonly kind: 'edge';
  readonly faces: readonly [FaceRef, FaceRef];
}

/** A vertex, named by the faces meeting at it (three or more), in canonical order. */
export interface VertexRef {
  readonly kind: 'vertex';
  readonly faces: readonly FaceRef[];
}

export type StableRef = FaceRef | EdgeRef | VertexRef;

/**
 * Allowed characters in feature ids and face tags. The text form's delimiters (`:`, `|`, `(`, `)`)
 * are forbidden instead of escaped.
 */
const IDENTIFIER = /^[A-Za-z0-9_.-]+$/;

export class InvalidRefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRefError';
  }
}

function assertIdentifier(value: string, what: string): void {
  if (!IDENTIFIER.test(value)) {
    throw new InvalidRefError(
      `${what} must match ${IDENTIFIER.source}, got ${JSON.stringify(value)}`,
    );
  }
}

// Construction.

export function faceRef(feature: FeatureId, tag: FaceTag): FaceRef {
  assertIdentifier(feature, 'feature id');
  assertIdentifier(tag, 'face tag');
  return { kind: 'face', feature, tag };
}

/** Names the edge between two faces. Throws if both are the same face. */
export function edgeRef(a: FaceRef, b: FaceRef): EdgeRef {
  const [first, second] = sortFaces([a, b]);
  if (first === undefined || second === undefined) {
    throw new InvalidRefError('an edge needs exactly two faces');
  }
  if (formatRef(first) === formatRef(second)) {
    throw new InvalidRefError('an edge must lie between two different faces');
  }
  return { kind: 'edge', faces: [first, second] };
}

/** Names the vertex where three or more distinct faces meet. */
export function vertexRef(faces: readonly FaceRef[]): VertexRef {
  const sorted = sortFaces(faces);
  if (sorted.length < 3) {
    throw new InvalidRefError(`a vertex needs at least three faces, got ${sorted.length}`);
  }
  const seen = new Set(sorted.map(formatRef));
  if (seen.size !== sorted.length) {
    throw new InvalidRefError('a vertex cannot list the same face twice');
  }
  return { kind: 'vertex', faces: sorted };
}

/** Canonical order, so the same geometry always gives the same text. */
function sortFaces(faces: readonly FaceRef[]): FaceRef[] {
  return [...faces].sort((x, y) => formatRef(x).localeCompare(formatRef(y), 'en'));
}

// Text form.

/**
 * The canonical text form. Saved in documents: change only with a schema migration.
 *
 *   face    F:extrude-1:side-2
 *   edge    E(F:extrude-1:end|F:extrude-1:side-2)
 *   vertex  V(F:extrude-1:end|F:extrude-1:side-1|F:extrude-1:side-2)
 */
export function formatRef(ref: StableRef): string {
  switch (ref.kind) {
    case 'face':
      return `F:${ref.feature}:${ref.tag}`;
    case 'edge':
      return `E(${ref.faces.map(formatRef).join('|')})`;
    case 'vertex':
      return `V(${ref.faces.map(formatRef).join('|')})`;
  }
}

/** Parses the canonical text form. Throws `InvalidRefError` if malformed. */
export function parseRef(text: string): StableRef {
  if (text.startsWith('F:')) {
    const parts = text.slice(2).split(':');
    const [feature, tag] = parts;
    if (parts.length !== 2 || feature === undefined || tag === undefined) {
      throw new InvalidRefError(`malformed face reference: ${JSON.stringify(text)}`);
    }
    return faceRef(feature, tag);
  }

  if (text.startsWith('E(') && text.endsWith(')')) {
    const faces = parseFaceList(text.slice(2, -1), text);
    const [a, b] = faces;
    if (faces.length !== 2 || a === undefined || b === undefined) {
      throw new InvalidRefError(`an edge reference needs exactly two faces: ${text}`);
    }
    return edgeRef(a, b);
  }

  if (text.startsWith('V(') && text.endsWith(')')) {
    return vertexRef(parseFaceList(text.slice(2, -1), text));
  }

  throw new InvalidRefError(`unrecognised reference: ${JSON.stringify(text)}`);
}

function parseFaceList(inner: string, whole: string): FaceRef[] {
  return inner.split('|').map((part) => {
    const parsed = parseRef(part);
    if (parsed.kind !== 'face') {
      throw new InvalidRefError(`expected only faces inside ${whole}, found ${part}`);
    }
    return parsed;
  });
}

// Comparison.

/** Whether two references name the same geometry. */
export function refEquals(a: StableRef, b: StableRef): boolean {
  return formatRef(a) === formatRef(b);
}

/** The faces a reference depends on; if any is gone, the reference is dangling. */
export function dependentFaces(ref: StableRef): readonly FaceRef[] {
  return ref.kind === 'face' ? [ref] : ref.faces;
}

/** Whether all faces of a reference are in `available` (formatted face references). */
export function isResolvable(ref: StableRef, available: ReadonlySet<string>): boolean {
  return dependentFaces(ref).every((face) => available.has(formatRef(face)));
}
