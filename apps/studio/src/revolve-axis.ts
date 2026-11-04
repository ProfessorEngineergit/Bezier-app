/**
 * Which sketch axis a new revolve turns about. A half outline drawn against an axis means that axis,
 * and turning about one the outline crosses cannot be built, so the sketch's horizontal (`u`) is
 * only the answer when nothing says otherwise.
 */

import type { Point2 } from '@bezier/solver';

const ON_AXIS = 1e-6;

export function revolveAxis(outlines: readonly (readonly Point2[])[]): 'u' | 'v' {
  const points = outlines.flat();
  if (points.length === 0) return 'u';
  const us = points.map((point) => point.x);
  const vs = points.map((point) => point.y);
  const [minU, maxU] = [Math.min(...us), Math.max(...us)];
  const [minV, maxV] = [Math.min(...vs), Math.max(...vs)];
  const clearOfU = minV >= -ON_AXIS || maxV <= ON_AXIS;
  const clearOfV = minU >= -ON_AXIS || maxU <= ON_AXIS;
  const onU = clearOfU && (Math.abs(minV) <= ON_AXIS || Math.abs(maxV) <= ON_AXIS);
  const onV = clearOfV && (Math.abs(minU) <= ON_AXIS || Math.abs(maxU) <= ON_AXIS);
  if (onV && !onU) return 'v';
  return clearOfU || !clearOfV ? 'u' : 'v';
}
