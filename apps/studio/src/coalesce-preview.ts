/**
 * Coalesces a fast-firing preview request (one per pointer move) to the latest value.
 *
 * `Session#previewApply` serialises calls (`Session#queue` in `session.ts`), so calling it on every
 * tick builds a backlog that replays for seconds after the drag stops. This keeps only the newest
 * request while one is in flight: at most one extra round trip.
 *
 * `apply` runs only if the request is still current; `cancel()` (e.g. on unmount) drops pending
 * results so a stale preview never overwrites later state. Same pattern as `TransformTool.tsx`.
 */
export function coalescePreview<T, R>(
  send: (value: T) => Promise<R>,
  apply: (result: R) => void,
): { request: (value: T) => void; cancel: () => void } {
  let queued: { value: T } | null = null;
  let generation = 0;
  /**
   * Generation owned by the running pump loop, or -1. Not a boolean: after `cancel()` then
   * `request()`, the old loop may still be suspended in `await send(...)` and must neither count as
   * covering the new generation nor clear this when it finishes.
   */
  let pumpOwner = -1;

  const pump = async (version: number) => {
    pumpOwner = version;
    try {
      while (queued !== null && version === generation) {
        const { value } = queued;
        queued = null;
        const result = await send(value);
        if (version === generation) apply(result);
      }
    } finally {
      if (pumpOwner === version) pumpOwner = -1;
    }
  };

  return {
    request(value: T) {
      queued = { value };
      if (pumpOwner !== generation) void pump(generation);
    },
    cancel() {
      generation++;
      queued = null;
    },
  };
}
