/**
 * Worker that reads a STEP file's rough outline from its text (`step-outline.ts`). It loads no
 * OCCT, so it answers in seconds while the geometry worker may take minutes.
 */

/// <reference lib="dom" />
// DOM types per file, as in `entry.ts`.

import { parseStepOutline } from '../step-outline.js';

addEventListener('message', (event: MessageEvent<string>) => {
  let outline: ReturnType<typeof parseStepOutline> = null;
  try {
    outline = parseStepOutline(event.data);
  } catch {
    // A file this reader cannot follow still imports; it only arrives unseen.
  }
  const transfer =
    outline === null ? [] : [outline.edges.positions.buffer, outline.edges.polylineStarts.buffer];
  postMessage(outline, { transfer });
});
