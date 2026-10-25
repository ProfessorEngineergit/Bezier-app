import { describe, expect, it } from 'vitest';
import { Values } from './channels.js';
import { aimAt, Pointing } from './pointing.js';

describe('pointing', () => {
  it("uses the arm on the side the target is on, from the viewer's point of view", () => {
    expect(aimAt(200, 0).side).toBe('L');
    expect(aimAt(-200, 0).side).toBe('R');
  });

  it('raises the arm toward the target: down for below, out for level, up for above', () => {
    expect(aimAt(100, -300).arm).toBeLessThan(40);
    expect(aimAt(300, 0).arm).toBeCloseTo(90, 5);
    expect(aimAt(100, 300).arm).toBeGreaterThan(120);
  });

  it('never asks for an arm he cannot lift', () => {
    expect(aimAt(0, 5000).arm).toBeLessThanOrEqual(170);
    expect(aimAt(0, -5000).arm).toBeGreaterThanOrEqual(20);
  });

  it('turns the head toward it and looks up for a target above', () => {
    expect(aimAt(240, 0).turn).toBeGreaterThan(0);
    expect(aimAt(-240, 0).turn).toBeLessThan(0);
    expect(aimAt(0, 200).nod).toBeLessThan(0);
    expect(aimAt(0, -200).nod).toBeGreaterThan(0);
  });

  it('holds the arm out while it points, then lets go', () => {
    const layer = new Pointing();
    const target = new Values();
    layer.at(200, 20, 10);
    expect(layer.apply(5, target)?.side).toBe('L');
    expect(target.get('armLOut')).toBeGreaterThan(60);
    expect(layer.active(5)).toBe(true);
    expect(layer.apply(11, new Values())).toBeNull();
    layer.at(-200, 0, 20);
    layer.stop();
    expect(layer.active(12)).toBe(false);
  });
});
