/** Find the middle of a connected edge, independent of tessellation subdivisions. */
export interface SeamSegment {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
}

export interface SeamMiddle {
  point: { x: number; y: number; z: number };
  tangent: { x: number; y: number; z: number };
}

export function seamMidpoint(
  segments: readonly SeamSegment[],
  seed: SeamSegment,
): SeamMiddle | null {
  const vertices: { x: number; y: number; z: number }[] = [];
  const node = (x: number, y: number, z: number): number => {
    const found = vertices.findIndex((v) => Math.hypot(v.x - x, v.y - y, v.z - z) < 1e-4);
    if (found >= 0) return found;
    vertices.push({ x, y, z });
    return vertices.length - 1;
  };
  const edges = segments.map((s) => ({
    a: node(s.ax, s.ay, s.az),
    b: node(s.bx, s.by, s.bz),
    segment: s,
  }));
  const first = edges.find((edge) => edge.segment === seed);
  if (!first) return null;
  const reached = new Set([first.a, first.b]);
  const component = new Set([first]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      if (component.has(edge) || (!reached.has(edge.a) && !reached.has(edge.b))) continue;
      component.add(edge);
      reached.add(edge.a);
      reached.add(edge.b);
      changed = true;
    }
  }
  const neighbours = (id: number) =>
    [...component].filter((edge) => edge.a === id || edge.b === id);
  const ends = [...reached].filter((id) => neighbours(id).length === 1);
  // A closed loop has no privileged midpoint; retain the local picked frame.
  if (ends.length !== 2 || [...reached].some((id) => neighbours(id).length > 2)) return null;
  let remaining =
    [...component].reduce(
      (sum, { segment: s }) => sum + Math.hypot(s.bx - s.ax, s.by - s.ay, s.bz - s.az),
      0,
    ) / 2;
  const start = ends[0];
  if (start === undefined) return null;
  let current: number = start;
  const visited = new Set<typeof first>();
  while (visited.size < component.size) {
    const edge = neighbours(current).find((candidate) => !visited.has(candidate));
    if (!edge) return null;
    visited.add(edge);
    const next: number = edge.a === current ? edge.b : edge.a;
    const a = vertices[current];
    const b = vertices[next];
    if (!a || !b) return null;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dy, dz);
    if (length > 0 && remaining <= length) {
      const t = remaining / length;
      return {
        point: { x: a.x + dx * t, y: a.y + dy * t, z: a.z + dz * t },
        tangent: { x: dx / length, y: dy / length, z: dz / length },
      };
    }
    remaining -= length;
    current = next;
  }
  return null;
}
