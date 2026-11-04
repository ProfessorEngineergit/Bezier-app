/**
 * The camera each history step was made from, so playing the history back can look at the part the
 * way it was looked at then. Two decimals of a millimetre are enough to look at, and keep a step's
 * camera under a hundred bytes.
 */
import type { Operation, StepCamera } from '@bezier/core';

const rounded = (value: number) => Math.round(value * 100) / 100;

const point = (at: readonly [number, number, number]) =>
  [rounded(at[0]), rounded(at[1]), rounded(at[2])] as const;

export function withCamera(operation: Operation, camera: StepCamera | undefined): Operation {
  if (operation.op !== 'addFeature' || operation.view !== undefined || camera === undefined) {
    return operation;
  }
  const { parallel, zoom } = camera;
  const view = { position: point(camera.position), target: point(camera.target), parallel, zoom };
  return { ...operation, view };
}
