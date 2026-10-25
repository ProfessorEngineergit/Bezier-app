import { describe, expect, it } from 'vitest';
import {
  evaluate,
  evaluateVariables,
  lookupIn,
  namesIn,
  variableNameProblem,
} from './expressions.js';

const none = (name: string) => ({ ok: false as const, message: `There is no variable "${name}".` });
const value = (text: string) => {
  const result = evaluate(text, none);
  if (!result.ok) throw new Error(result.message);
  return result.value;
};

describe('an expression', () => {
  it('does arithmetic in the usual order', () => {
    expect(value('2 + 3 * 4')).toBe(14);
    expect(value('(2 + 3) * 4')).toBe(20);
    expect(value('-2 ^ 2')).toBe(-4);
    expect(value('2 ^ 3 ^ 2')).toBe(512);
    expect(value('10 / 4')).toBe(2.5);
  });

  it('reads units into millimetres and degrees', () => {
    expect(value('2 cm')).toBe(20);
    expect(value('1 in + 1 mm')).toBeCloseTo(26.4);
    expect(value('(1 + 1) m')).toBe(2000);
    expect(value('90°')).toBe(90);
    expect(value('pi rad')).toBeCloseTo(180);
  });

  it('takes a decimal comma, and a comma between function arguments', () => {
    expect(value('12,5')).toBe(12.5);
    expect(value('max(1,5; 2)')).toBe(2);
    expect(value('max(1, 3)')).toBe(3);
    expect(value('min(2,5 * 2)')).toBe(2);
  });

  it('works trigonometry in degrees', () => {
    expect(value('sin(30)')).toBeCloseTo(0.5);
    expect(value('atan(1)')).toBeCloseTo(45);
  });

  it('says what is wrong in words', () => {
    expect(evaluate('2 +', none)).toEqual({ ok: false, message: 'The expression ends too early.' });
    expect(evaluate('(2', none)).toEqual({ ok: false, message: 'A bracket is not closed.' });
    expect(evaluate('width * 2', none)).toEqual({
      ok: false,
      message: 'There is no variable "width".',
    });
    expect(evaluate('1 / 0', none).ok).toBe(false);
    expect(evaluate('2 $ 3', none).ok).toBe(false);
  });
});

describe('variables', () => {
  it('resolve in any order', () => {
    const values = evaluateVariables([
      { name: 'depth', expression: 'width / 2' },
      { name: 'width', expression: '40' },
    ]);
    expect(values.get('depth')).toEqual({ ok: true, value: 20 });
    expect(evaluate('depth + 1 cm', lookupIn(values))).toEqual({ ok: true, value: 30 });
  });

  it('name a loop instead of hanging on it', () => {
    const values = evaluateVariables([
      { name: 'a', expression: 'b + 1' },
      { name: 'b', expression: 'a * 2' },
    ]);
    const a = values.get('a');
    expect(a?.ok).toBe(false);
    expect(a?.ok === false && a.message).toContain('a → b → a');
  });

  it('may not be called like a unit or a function', () => {
    expect(variableNameProblem('width')).toBeNull();
    expect(variableNameProblem('mm')).not.toBeNull();
    expect(variableNameProblem('sin')).not.toBeNull();
    expect(variableNameProblem('2x')).not.toBeNull();
  });

  it('are found in an expression, units and functions aside', () => {
    expect(namesIn('max(width, 2 cm) + depth * sin(a)')).toEqual(['width', 'depth', 'a']);
  });
});

it('says a division by zero is one', () => {
  const result = evaluate('10 / (2 - 2)', () => ({ ok: false, message: 'none' }));
  expect(result).toEqual({ ok: false, message: '"10 / (2 - 2)" divides by zero.' });
});
