/**
 * A reference mesh (STL or OBJ), displayed only; the solid passes through unchanged. Not converted
 * to B-Rep: OCCT makes one face per triangle and fails on curved meshes ("BRep_API: command not
 * done", occt-wasm 3.8.3).
 */
import { defineFeature } from './registry.js';

export const referenceMeshFeature = defineFeature({
  type: 'reference-mesh',
  label: 'Mesh',
  params: {
    /** Triangle vertices, nine little-endian floats per triangle, base64. */
    mesh: { kind: 'text', label: 'Mesh' },
  },
  faceTags: [],
  async rebuild(_kernel, _params, input) {
    return { ok: true, value: { body: input.body, evolution: null } };
  },
});
