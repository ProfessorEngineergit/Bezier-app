/**
 * A reference picture on a plane, displayed only; the solid passes through unchanged.
 *
 * - `image` is base64 (type in `mime`), downscaled on import and written once; later edits use
 *   `patchParams` so the picture is not journalled again.
 * - `x`, `y`, `width` and `height` describe the visible (cropped) area in plane millimetres, so
 *   cropping leaves the picture in place.
 * - Crop values are the fraction of the original removed at each side.
 */
import { defineFeature } from './registry.js';

export const referenceImageFeature = defineFeature({
  type: 'reference-image',
  label: 'Image',
  params: {
    image: { kind: 'text', label: 'Picture' },
    mime: { kind: 'text', label: 'Format' },
    pixelWidth: { kind: 'count', label: 'Pixel width', default: 1, min: 1 },
    pixelHeight: { kind: 'count', label: 'Pixel height', default: 1, min: 1 },
    plane: { kind: 'choice', label: 'Plane', options: ['XY', 'XZ', 'YZ'], default: 'XY' },
    /** Offset along the plane's normal. */
    offset: { kind: 'length', label: 'Offset', default: 0, min: -100000, max: 100000 },
    x: { kind: 'length', label: 'Centre X', default: 0, min: -100000, max: 100000 },
    y: { kind: 'length', label: 'Centre Y', default: 0, min: -100000, max: 100000 },
    width: { kind: 'length', label: 'Width', default: 100, min: 0.01, max: 100000 },
    height: { kind: 'length', label: 'Height', default: 100, min: 0.01, max: 100000 },
    rotation: { kind: 'angle', label: 'Rotation', default: 0, degrees: true, min: -360, max: 360 },
    opacity: { kind: 'factor', label: 'Opacity', default: 0.8, min: 0.05, max: 1 },
    cropLeft: { kind: 'factor', label: 'Crop left', default: 0, min: 0, max: 0.95 },
    cropTop: { kind: 'factor', label: 'Crop top', default: 0, min: 0, max: 0.95 },
    cropRight: { kind: 'factor', label: 'Crop right', default: 0, min: 0, max: 0.95 },
    cropBottom: { kind: 'factor', label: 'Crop bottom', default: 0, min: 0, max: 0.95 },
  },
  faceTags: [],
  async rebuild(_kernel, _params, input) {
    return { ok: true, value: { body: input.body, evolution: null } };
  },
});
