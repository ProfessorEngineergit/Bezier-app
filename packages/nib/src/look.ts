/**
 * Material finish for Nib on a page. The film's materials rely on a softbox studio; in a small
 * window they act as mirrors. Here they are rougher, without clear coat, and lit mostly diffusely.
 */

import {
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
} from 'three';

interface Finish {
  roughness: number;
  clearcoat?: number;
}

/** Keyed by material name in the model. */
export const FINISH: Readonly<Record<string, Finish>> = {
  'Schale weiß': { roughness: 0.52, clearcoat: 0 },
  'Display dunkel': { roughness: 0.6 },
  'Aluminium satin': { roughness: 0.5 },
  'Eloxal schwarz': { roughness: 0.55 },
  'Gelenk dunkel': { roughness: 0.55 },
  Kolbenstange: { roughness: 0.32 },
  Kameraglas: { roughness: 0.22 },
  'Linse vergütet': { roughness: 0.12 },
};

/** Environment light intensity; the rest comes from two soft lamps. */
export const ENVIRONMENT = 0.3;

export function applyFinish(materials: ReadonlyMap<string, Material>): void {
  for (const [name, finish] of Object.entries(FINISH)) {
    const material = materials.get(name);
    if (!(material instanceof MeshStandardMaterial)) continue;
    material.roughness = finish.roughness;
    if (finish.clearcoat !== undefined && material instanceof MeshPhysicalMaterial)
      material.clearcoat = finish.clearcoat;
  }
}

/**
 * The smoked glass of the face and belly window. Its decimated mesh (a few hundred triangles)
 * streaks under specular light, and diffuse light from the key lamp washes over the face, so it is
 * unlit: an even dark pane, with the eyes behind it.
 */
export function flattenGlass(root: Object3D): void {
  const glass = new MeshBasicMaterial({ color: 0x0a0c0f, name: 'Rauchglas' });
  root.traverse((node) => {
    if (!(node instanceof Mesh) || Array.isArray(node.material)) return;
    // Match by base name: Blender's exporter suffixes repeated materials ("Rauchglas.001").
    if (node.material.name.replace(/\.\d+$/, '') !== 'Rauchglas') return;
    node.material.dispose();
    node.material = glass;
  });
}
