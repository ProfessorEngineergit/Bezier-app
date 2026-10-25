/**
 * World size of one screen pixel at a given distance from the camera. Shared by `ViewportScene`
 * (sketch line weight at the orbit centre) and drag gizmos (`EdgeGizmo`, `ExtrudeGizmo`) at their
 * own anchor distance.
 */

/** The minimal shape of a camera this needs; real three.js cameras satisfy it. */
export type ProjectionCamera =
  | { isOrthographicCamera: true; top: number; bottom: number; zoom: number }
  | { isOrthographicCamera?: false; fov: number };

export function worldPerPixel(
  camera: ProjectionCamera,
  distance: number,
  viewportHeightPx: number,
): number {
  const height = Math.max(1, viewportHeightPx);
  if (camera.isOrthographicCamera === true) {
    return (camera.top - camera.bottom) / height / (camera.zoom || 1);
  }
  return (2 * Math.max(0.01, distance) * Math.tan((camera.fov * Math.PI) / 360)) / height;
}
