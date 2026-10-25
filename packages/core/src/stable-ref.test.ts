import { describe, expect, it } from 'vitest';
import {
  dependentFaces,
  edgeRef,
  faceRef,
  formatRef,
  InvalidRefError,
  isResolvable,
  parseRef,
  refEquals,
  vertexRef,
} from './stable-ref.js';

const end = faceRef('extrude-1', 'end');
const side1 = faceRef('extrude-1', 'side-1');
const side2 = faceRef('extrude-1', 'side-2');

describe('faceRef', () => {
  it('formats as F:<feature>:<tag>', () => {
    expect(formatRef(end)).toBe('F:extrude-1:end');
  });

  it('rejects identifiers containing format delimiters', () => {
    expect(() => faceRef('extrude:1', 'end')).toThrow(InvalidRefError);
    expect(() => faceRef('extrude-1', 'si|de')).toThrow(InvalidRefError);
    expect(() => faceRef('extrude-1', 'side(1)')).toThrow(InvalidRefError);
  });
});

describe('edgeRef', () => {
  it('is order-independent — the seam between A and B is the seam between B and A', () => {
    expect(refEquals(edgeRef(end, side1), edgeRef(side1, end))).toBe(true);
  });

  it('orders its faces canonically regardless of how it was built', () => {
    expect(formatRef(edgeRef(side1, end))).toBe('E(F:extrude-1:end|F:extrude-1:side-1)');
  });

  it('rejects an edge between a face and itself', () => {
    expect(() => edgeRef(end, faceRef('extrude-1', 'end'))).toThrow(InvalidRefError);
  });
});

describe('vertexRef', () => {
  it('needs at least three faces, because two faces meet along an edge', () => {
    expect(() => vertexRef([end, side1])).toThrow(InvalidRefError);
  });

  it('is order-independent', () => {
    expect(refEquals(vertexRef([end, side1, side2]), vertexRef([side2, end, side1]))).toBe(true);
  });

  it('rejects a repeated face', () => {
    expect(() => vertexRef([end, side1, faceRef('extrude-1', 'side-1')])).toThrow(InvalidRefError);
  });
});

describe('round-tripping through text', () => {
  // The text form is written into saved documents, so this is a compatibility guarantee and not an
  // internal detail.
  const cases = [end, edgeRef(end, side1), vertexRef([end, side1, side2])];

  for (const ref of cases) {
    it(`survives format → parse: ${formatRef(ref)}`, () => {
      expect(refEquals(parseRef(formatRef(ref)), ref)).toBe(true);
    });
  }

  it('rejects text that is not a reference', () => {
    expect(() => parseRef('nonsense')).toThrow(InvalidRefError);
    expect(() => parseRef('F:only-one-part')).toThrow(InvalidRefError);
    expect(() => parseRef('E(F:extrude-1:end)')).toThrow(InvalidRefError);
    expect(() => parseRef('E(E(F:a:b|F:c:d)|F:e:f)')).toThrow(InvalidRefError);
  });
});

describe('resolving against a rebuilt model', () => {
  it('lists every face a reference depends on', () => {
    expect(dependentFaces(edgeRef(end, side1)).map(formatRef)).toEqual([
      'F:extrude-1:end',
      'F:extrude-1:side-1',
    ]);
  });

  it('resolves when all the faces it names still exist', () => {
    const available = new Set([formatRef(end), formatRef(side1)]);
    expect(isResolvable(edgeRef(end, side1), available)).toBe(true);
  });

  it('goes dangling when a face it names has been deleted', () => {
    // An earlier edit removed one of the faces the user's fillet was attached to: the feature must
    // be reported as broken, by name, and not land on some other edge.
    const available = new Set([formatRef(end)]);
    expect(isResolvable(edgeRef(end, side1), available)).toBe(false);
  });
});
