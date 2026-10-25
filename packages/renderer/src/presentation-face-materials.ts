/**
 * Per-face material overrides on a body. Triangles are ordered face by face, so each overridden
 * face is a draw group with its own material on the body's mesh; other faces use the body material.
 */

import { type BufferGeometry, MeshPhysicalMaterial, type Vector3 } from 'three/webgpu';
import type { PresentationSettings } from './presentation.js';
import {
  PresentationMaterialLibrary,
  type PresentationMaterialSurface,
} from './presentation-material.js';

export interface FaceAppearance {
  /** The face's text name (`F:extrude-1:side-2`). */
  face: string;
  settings: PresentationSettings;
  surface: PresentationMaterialSurface | null;
}

/** A material of its own, for one face. */
export interface FaceMaterial {
  material: MeshPhysicalMaterial;
  maps: PresentationMaterialLibrary;
  request: number;
}

export function makeFaceMaterial(): FaceMaterial {
  // Vertex colours as on the body: the face is tinted under the pointer and when picked.
  return {
    material: new MeshPhysicalMaterial({ color: '#d9d8d4', roughness: 0.58, vertexColors: true }),
    maps: new PresentationMaterialLibrary(),
    request: 0,
  };
}

/** Set a material's finish from the settings; true when its program has to be made again. */
export function applyFinish(
  m: MeshPhysicalMaterial,
  s: PresentationSettings,
  extent: Vector3,
): boolean {
  const recompile =
    m.transmission > 0 !== s.transmission > 0 || m.anisotropy > 0 !== (s.anisotropy ?? 0) > 0;
  m.color.set(s.color);
  m.roughness = s.roughness;
  m.metalness = s.metalness;
  m.transmission = s.transmission;
  m.clearcoat = s.clearcoat;
  m.ior = s.ior ?? 1.5;
  m.emissive.set(s.color);
  m.emissiveIntensity = s.emission ?? 0;
  m.anisotropy = s.anisotropy ?? 0;
  m.anisotropyRotation = (s.anisotropyRotation ?? 0) + (s.textureRotation ?? 0);
  m.thickness = Math.max(0.01, Math.min(extent.x, extent.y, extent.z));
  if (recompile) m.needsUpdate = true;
  return recompile;
}

/** The maps for a finish, once they have loaded; false when a later request overtook this one. */
export async function applyMaps(
  owner: { request: number },
  maps: PresentationMaterialLibrary,
  m: MeshPhysicalMaterial,
  s: PresentationSettings,
  surface: PresentationMaterialSurface | null,
): Promise<boolean> {
  const request = ++owner.request;
  await maps.set(m, surface);
  if (request !== owner.request) return false;
  maps.setScale(s.textureScale);
  maps.setGrain(m, s.grain);
  maps.setRotation(s.textureRotation ?? 0);
  return true;
}

/**
 * Groups a body's triangles by material: 0 the body's, 1+ the faces' own in `own` order. `faces`
 * maps each triangle to its face index, `keyOf` a face to its text name; adjacent runs merge.
 * Returns the number of faces with their own material.
 */
export function groupByMaterial(
  geometry: BufferGeometry,
  faces: Uint32Array,
  keyOf: (face: number) => string | null,
  own: ReadonlyMap<string, number>,
): number {
  geometry.clearGroups();
  let used = 0;
  let groupStart = 0;
  let groupMaterial = -1;
  const named = new Map<number, number>();
  for (let t = 0; t <= faces.length; t++) {
    let material = -1;
    if (t < faces.length) {
      const face = faces[t] ?? 0;
      let found = named.get(face);
      if (found === undefined) {
        const key = keyOf(face);
        found = key === null ? 0 : (own.get(key) ?? 0);
        named.set(face, found);
        if (found > 0) used += 1;
      }
      material = found;
    }
    if (material === groupMaterial) continue;
    if (groupMaterial >= 0) geometry.addGroup(groupStart * 3, (t - groupStart) * 3, groupMaterial);
    groupStart = t;
    groupMaterial = material;
  }
  if (used === 0) geometry.clearGroups();
  return used;
}
