import { describe, expect, it } from 'vitest';
import { updateCameraFacingSigns } from './move-gizmo-frame.js';

describe('updateCameraFacingSigns', () => {
  it('chooses the half of every world axis nearest the camera', () => {
    const signs = [1, 1, 1];
    updateCameraFacingSigns({ x: -20, y: 30, z: -40 }, { x: 0, y: 0, z: 0 }, signs);
    expect(signs).toEqual([-1, 1, -1]);
  });

  it('jumps once the camera is decisively past a body plane', () => {
    const signs = [1, -1, 1];
    updateCameraFacingSigns({ x: -20, y: -30, z: 40 }, { x: 0, y: 0, z: 0 }, signs);
    expect(signs).toEqual([-1, -1, 1]);
  });

  /**
   * An absolute dead band of 1e-4 mm is zero at any real viewing distance, so a handle would flip
   * each time the camera grazed a plane. Here the camera is a hair over the X plane from 200 mm
   * away, not a real crossing, so the handle must not move.
   */
  it('holds its side while the camera merely grazes a plane', () => {
    const signs = [-1, 1, -1];
    updateCameraFacingSigns({ x: 0.5, y: -0.5, z: 200 }, { x: 0, y: 0, z: 0 }, signs);

    // X and Y are grazed (half a millimetre off, from 200 mm away), so those handles hold. Z is on
    // the other side and must move: a handle that refused would end up behind the solid, which is
    // what facing the camera exists to prevent.
    expect(signs[0]).toBe(-1);
    expect(signs[1]).toBe(1);
    expect(signs[2]).toBe(1);
  });

  it('does not drift back and forth across repeated small crossings', () => {
    const signs = [1, 1, 1];
    // Wobbling either side of the X plane, as a settling orbit does.
    for (const x of [1, -1, 2, -2, 1.5, -1.5]) {
      updateCameraFacingSigns({ x, y: 0, z: 150 }, { x: 0, y: 0, z: 0 }, signs);
    }
    expect(signs[0]).toBe(1);
  });

  it('survives a camera sitting exactly on the body centre', () => {
    // No side to be on, and the threshold would be a division by nothing.
    const signs = [-1, 1, -1];
    updateCameraFacingSigns({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, signs);
    expect(signs).toEqual([-1, 1, -1]);
  });
});
