import { describe, expect, it } from 'vitest';
import {
  chosenVariants,
  commandOf,
  defaultVariant,
  isDrawingCommand,
  toolAsVariant,
  variantAsTool,
} from './sketch-variants.js';

describe('sketch rail names and tools', () => {
  it('takes a variant to its tool and back', () => {
    for (const [variant, tool] of [
      ['diagonal-rectangle', 'rectangle'],
      ['three-point-arc', 'arc'],
      ['center-circle', 'circle'],
      ['trim-cut', 'trim'],
      ['sketch-split', 'split'],
      ['tangent-arc', 'tangent-arc'],
      ['polygon-6', 'polygon-6'],
    ] as const) {
      expect(variantAsTool(variant)).toBe(tool);
      expect(toolAsVariant(tool)).toBe(variant);
    }
    expect(variantAsTool('sketch-offset')).toBeNull();
  });

  it('knows which command a tool belongs to, and what it opens on', () => {
    expect(commandOf('center-arc')).toBe('arc');
    expect(commandOf('arc')).toBe('arc');
    expect(commandOf('split')).toBe('trim');
    expect(commandOf('slot')).toBe('slot');
    expect(defaultVariant('polygon')).toBe('polygon-6');
    expect(defaultVariant('arc')).toBe('three-point-arc');
    expect(defaultVariant('line')).toBeNull();
  });

  it('tells drawing commands from changes to what is picked', () => {
    expect(isDrawingCommand('polygon')).toBe(true);
    expect(isDrawingCommand('point')).toBe(true);
    expect(isDrawingCommand('sketch-modify')).toBe(false);
    expect(isDrawingCommand('extrude')).toBe(false);
    // Tools' Split cuts bodies; the sketch's is `sketch-split`.
    expect(isDrawingCommand('split')).toBe(false);
    expect(isDrawingCommand('sketch-split')).toBe(true);
  });

  it('labels the variant in hand for the rail', () => {
    expect(chosenVariants('center-arc')).toEqual({ arc: 'Center' });
    expect(chosenVariants('rectangle')).toEqual({ rectangle: 'Diagonal' });
    expect(chosenVariants('sketch-pattern')).toEqual({ 'sketch-modify': 'Pattern' });
    expect(chosenVariants(null)).toEqual({});
  });
});
