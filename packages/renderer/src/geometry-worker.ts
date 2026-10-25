/**
 * Builds the picking tree and seams of a large mesh off the main thread. On a four-million-triangle
 * assembly they take 1.6 s and 0.9 s on the main thread; here the model shows at once and picking
 * starts when they arrive.
 */

/// <reference lib="dom" />

import { Bvh, type BvhParts } from './bvh.js';
import { buildCorners, type CornerTable, cornerBuffers } from './corner-table.js';
import { buildSeams, type SeamTable } from './seams.js';

export interface GeometryJob {
  id: number;
  positions: Float32Array;
  indices: Uint32Array;
  triangleFaces: Uint32Array;
}

export interface GeometryResult {
  id: number;
  bvh: BvhParts;
  seams: SeamTable;
  /** Built here too: on the main thread it takes most of a second per rebuild. */
  corners: CornerTable;
}

interface WorkerScope {
  addEventListener(type: 'message', handler: (event: MessageEvent<GeometryJob>) => void): void;
  postMessage(message: GeometryResult, options?: { transfer?: Transferable[] }): void;
}

const scope = globalThis as unknown as WorkerScope;

scope.addEventListener('message', (event) => {
  const { id, positions, indices, triangleFaces } = event.data;
  const bvh = new Bvh(positions, indices).parts();
  const seams = buildSeams({ positions, normals: new Float32Array(0), indices, triangleFaces });
  const corners = buildCorners(seams);
  scope.postMessage(
    { id, bvh, seams, corners },
    {
      transfer: [
        bvh.order.buffer,
        bvh.bounds.buffer,
        bvh.meta.buffer,
        seams.ends.buffer,
        seams.first.buffer,
        seams.second.buffer,
        ...cornerBuffers(corners),
      ],
    },
  );
});
