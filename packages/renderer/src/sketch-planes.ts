/**
 * The three origin planes as translucent, hoverable quads, shown while choosing a sketch plane.
 * Raycast directly rather than through the pick BVH: they have no stable references, and this keeps
 * plane picks separate from face picks.
 */

/// <reference lib="dom" />

import {
  DoubleSide,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Raycaster,
  Vector2,
} from 'three';
import type { ActiveCamera } from './camera.js';

/** Which datum plane a sketch is drawn on. Matches the core's `SketchPlane`. */
export type PlaneName = 'XY' | 'XZ' | 'YZ';

/** Drawn size of the quads in millimetres: one grid decade, suited to printed parts. */
const SIZE = 60;

/** Fill and edge, measured off the reference: a near-white wash at low opacity. */
const FILL = 0xc2c6ca;
const EDGE = 0x8a928a;

export interface SketchPlanes {
  group: Group;
  /** Show or hide all three. Hidden means they cannot be hovered or picked either. */
  setVisible(visible: boolean): void;
  /** Brighten the plane under the cursor, or clear the hover with null. */
  setHovered(plane: PlaneName | null): void;
  /** Which plane a normalised device coordinate is over, or null. */
  pick(camera: ActiveCamera, ndcX: number, ndcY: number): PlaneName | null;
  dispose(): void;
}

interface Panel {
  name: PlaneName;
  mesh: Mesh;
  fill: MeshBasicMaterial;
}

export function createSketchPlanes(): SketchPlanes {
  const group = new Group();
  group.visible = false;
  // Never framed: `fit()` measures the model, and a datum plane is scaffolding.
  group.frustumCulled = false;

  const raycaster = new Raycaster();
  const pointer = new Vector2();

  const panels: Panel[] = (['XY', 'XZ', 'YZ'] as const).map((name) => {
    const fill = new MeshBasicMaterial({
      color: FILL,
      transparent: true,
      opacity: 0.1,
      side: DoubleSide,
      // No depth write, so the planes never hide the grid or a body behind them.
      depthWrite: false,
    });

    const geometry = new PlaneGeometry(SIZE, SIZE);
    const mesh = new Mesh(geometry, fill);
    orient(mesh, name);
    mesh.userData.plane = name;
    mesh.renderOrder = 1;

    const edge = new LineSegments(
      new EdgesGeometry(geometry),
      new LineBasicMaterial({ color: EDGE, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    mesh.add(edge);

    group.add(mesh);
    return { name, mesh, fill };
  });

  return {
    group,

    setVisible(visible) {
      group.visible = visible;
      if (!visible) for (const panel of panels) panel.fill.opacity = 0.1;
    },

    setHovered(plane) {
      for (const panel of panels) panel.fill.opacity = panel.name === plane ? 0.24 : 0.1;
    },

    pick(camera, ndcX, ndcY) {
      if (!group.visible) return null;
      pointer.set(ndcX, ndcY);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(
        panels.map((panel) => panel.mesh),
        false,
      )[0];
      const name = hit?.object.userData.plane;
      return name === 'XY' || name === 'XZ' || name === 'YZ' ? name : null;
    },

    dispose() {
      for (const panel of panels) {
        panel.mesh.geometry.dispose();
        panel.fill.dispose();
        for (const child of panel.mesh.children) {
          if (child instanceof LineSegments) {
            child.geometry.dispose();
            (child.material as LineBasicMaterial).dispose();
          }
        }
      }
    },
  };
}

/**
 * Orients a quad into its plane. `PlaneGeometry` starts in XY; a quarter turn about X gives XZ and
 * about Y gives YZ.
 */
function orient(mesh: Mesh, name: PlaneName): void {
  if (name === 'XZ') mesh.rotation.x = Math.PI / 2;
  else if (name === 'YZ') mesh.rotation.y = Math.PI / 2;
}
