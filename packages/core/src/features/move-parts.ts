/**
 * Moves or rotates individual faces and edges, with neighbouring faces following (direct
 * modelling), via the kernel's `moveParts`. Moves that would remove or split a face are refused.
 */
import { err, type ShapeId } from '@bezier/kernel';
import { facesBeside, resolveFaces, withinOwningSolids } from './bodies.js';
import { defineFeature } from './registry.js';

export const movePartsFeature = defineFeature({
  type: 'move-parts',
  label: 'Move face or edge',
  params: {
    dx: { kind: 'length', label: 'X', default: 0 },
    dy: { kind: 'length', label: 'Y', default: 0 },
    dz: { kind: 'length', label: 'Z', default: 0 },
    faces: { kind: 'geometryRefs', label: 'Faces', of: 'face', default: [] },
    edges: { kind: 'geometryRefs', label: 'Edges', of: 'edge', default: [] },
    vertices: { kind: 'geometryRefs', label: 'Corners', of: 'vertex', default: [] },
    // Rotation applied before the translation.
    axis: { kind: 'choice', label: 'Axis', options: ['x', 'y', 'z'], default: 'z' },
    angle: { kind: 'angle', label: 'Angle', default: 0 },
    ox: { kind: 'length', label: 'Pivot X', default: 0 },
    oy: { kind: 'length', label: 'Pivot Y', default: 0 },
    oz: { kind: 'length', label: 'Pivot Z', default: 0 },
  },
  // Same faces, moved; none is new.
  faceTags: [],
  async rebuild(kernel, params, input) {
    if (input.body === null) return err('invalid-result', 'There is nothing to move yet.');
    if (params.faces.length + params.edges.length + params.vertices.length === 0)
      return err('invalid-result', 'Select a face, an edge or a corner to move.');
    const parts: ShapeId[] = [];
    for (const [refs, what] of [
      [params.faces, 'moved faces'],
      [params.edges, 'moved edges'],
      [params.vertices, 'moved corners'],
    ] as const) {
      if (refs.length === 0) continue;
      const found = await resolveFaces(input, refs, what);
      if (!found.ok) return found;
      parts.push(...found.value);
    }
    // Owning parts, found via the first face of each edge or vertex.
    const resolved = params.faces.length === 0 ? [] : parts.slice(0, params.faces.length);
    const owners = [
      ...resolved,
      ...(await facesBeside(input, [...params.edges, ...params.vertices])),
    ];
    const by = { x: params.dx, y: params.dy, z: params.dz };
    const turn =
      params.angle === 0
        ? undefined
        : {
            origin: { x: params.ox, y: params.oy, z: params.oz },
            axis: {
              x: +(params.axis === 'x'),
              y: +(params.axis === 'y'),
              z: +(params.axis === 'z'),
            },
            angle: params.angle,
          };
    return withinOwningSolids(kernel, input.body, owners, (solids) =>
      kernel.moveParts(solids, parts, { by, turn }),
    );
  },
});
