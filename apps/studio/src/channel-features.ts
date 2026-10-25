/**
 * What each pre-release channel adds, for Settings and the docs. A feature is alpha when it reaches
 * beyond the machine or is untested outside the lab; promote it by changing its `gate` here and in
 * the places that check the channel (`reaches`).
 */

import type { Gate } from '@bezier/lessons';

export interface ChannelFeature {
  id: string;
  name: string;
  /** One-sentence description for someone choosing a channel. */
  summary: string;
  gate: Gate;
}

export const CHANNEL_FEATURES: readonly ChannelFeature[] = [
  {
    id: 'community',
    name: 'Community',
    summary: 'Lessons, plugins and the leaderboard of a community store, with one switch.',
    gate: 'alpha',
  },
  {
    id: 'plugins',
    name: 'Plugins',
    summary: 'Code other people wrote, run in a sandbox beside your model.',
    gate: 'alpha',
  },
  {
    id: 'wiki-editing',
    name: 'Writing in the wiki',
    summary: 'Write and change articles, with every version kept, in a store you choose.',
    gate: 'alpha',
  },
  {
    id: 'collaboration',
    name: 'Collaboration',
    summary: 'Share projects and work on one model together, live, end-to-end encrypted.',
    gate: 'alpha',
  },
  {
    id: 'self-hosting',
    name: 'Your own servers',
    summary: 'Run the sync server or a community store yourself and point Bezier at it.',
    gate: 'alpha',
  },
];
