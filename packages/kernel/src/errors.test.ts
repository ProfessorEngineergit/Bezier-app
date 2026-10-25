import { describe, expect, it } from 'vitest';
import { err, isRecoverable, ok } from './errors.js';

describe('KernelResult', () => {
  it('narrows to the value on success', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it('omits detail when none is given, rather than storing undefined', () => {
    const result = err('boolean-failed', 'Could not combine these shapes.');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toHaveProperty('detail');
    }
  });

  it('carries raw kernel detail when given', () => {
    const result = err('unknown', 'Something went wrong.', 'BRepAlgoAPI: null shape');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail).toBe('BRepAlgoAPI: null shape');
    }
  });
});

describe('isRecoverable', () => {
  it('marks size-dependent failures as worth retrying', () => {
    expect(isRecoverable({ code: 'radius-too-large', message: '' })).toBe(true);
    expect(isRecoverable({ code: 'blend-failed', message: '' })).toBe(true);
  });

  it('marks structural failures as not worth retrying', () => {
    expect(isRecoverable({ code: 'open-profile', message: '' })).toBe(false);
    expect(isRecoverable({ code: 'out-of-memory', message: '' })).toBe(false);
  });
});
