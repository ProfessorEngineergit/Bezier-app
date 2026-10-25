import { describe, expect, it } from 'vitest';
import { transferablesOf } from './protocol.js';

describe('collecting transferables', () => {
  // ADR 0007 requires geometry to move across the worker boundary and not be cloned. A
  // missed buffer is a silent slowdown and not a failure, so nothing else would notice.

  it('finds the buffer behind a typed array', () => {
    const mesh = { positions: new Float32Array(9) };
    expect(transferablesOf(mesh)).toEqual([mesh.positions.buffer]);
  });

  it('finds every buffer in a mesh', () => {
    const mesh = {
      positions: new Float32Array(9),
      normals: new Float32Array(9),
      indices: new Uint32Array(3),
      triangleFaces: new Uint32Array(1),
    };
    expect(transferablesOf(mesh)).toHaveLength(4);
  });

  it('looks inside a KernelResult', () => {
    const result = { ok: true, value: { positions: new Float32Array(3) } };
    expect(transferablesOf(result)).toHaveLength(1);
  });

  it('looks inside arrays', () => {
    const batch = [{ data: new Uint8Array(4) }, { data: new Uint8Array(4) }];
    expect(transferablesOf(batch)).toHaveLength(2);
  });

  it('lists a shared buffer once, not once per view', () => {
    // Two views over one buffer. Transferring it twice is an error at runtime.
    const buffer = new ArrayBuffer(32);
    const value = { a: new Float32Array(buffer, 0, 4), b: new Uint32Array(buffer, 16, 4) };
    expect(transferablesOf(value)).toEqual([buffer]);
  });

  it('survives a cycle', () => {
    const value: Record<string, unknown> = { data: new Uint8Array(4) };
    value.self = value;
    expect(transferablesOf(value)).toHaveLength(1);
  });

  it('finds nothing in plain data', () => {
    expect(transferablesOf({ ok: true, value: 42 })).toEqual([]);
    expect(transferablesOf(null)).toEqual([]);
    expect(transferablesOf('a string')).toEqual([]);
  });
});
