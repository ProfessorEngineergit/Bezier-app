import { describe, expect, it } from 'vitest';
import { sameSaid, spoken } from './said.js';

describe('what the app says', () => {
  it('keeps a plain sentence as it is', () => {
    expect(spoken('Select an edge in the viewport first.')).toEqual({
      title: 'Select an edge in the viewport first.',
    });
  });

  it('splits a refusal into what happened and why', () => {
    expect(spoken('Fillet could not be applied: a 3 mm round does not fit on this edge.')).toEqual({
      title: 'Fillet could not be applied',
      detail: 'A 3 mm round does not fit on this edge.',
      tone: 'fail',
    });
    expect(spoken('Duplicate could not be made: nothing is selected')).toMatchObject({
      title: 'Duplicate could not be made',
      tone: 'fail',
    });
  });

  it('passes a notice that is already shaped through untouched', () => {
    const said = { title: 'Projects will not be saved', tone: 'fail' as const, sticky: true };
    expect(spoken(said)).toBe(said);
  });

  it('counts the same words as the same notice', () => {
    expect(sameSaid(spoken('Nothing to redo.'), { title: 'Nothing to redo.' })).toBe(true);
    expect(sameSaid({ title: 'A', detail: 'x' }, { title: 'A', detail: 'y' })).toBe(false);
  });
});
