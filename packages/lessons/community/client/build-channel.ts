/**
 * The channel this build targets. An alpha build (`VITE_CHANNEL=alpha`) starts on alpha and opens
 * it without a code; other builds start on stable and need an invitation for alpha (`alpha.ts`).
 */

export const BUILD_CHANNEL: 'stable' | 'alpha' =
  (import.meta as ImportMeta & { env?: { VITE_CHANNEL?: string } }).env?.VITE_CHANNEL === 'alpha'
    ? 'alpha'
    : 'stable';
