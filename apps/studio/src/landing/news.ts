/**
 * What's new on the landing page. Each entry exists in this build, has a picture made by the app
 * and says where to find it. Entries about a channel-gated part show on that channel and above.
 */

import type { Gate } from '@bezier/lessons';

export type NewsTarget =
  | { kind: 'wiki' }
  | { kind: 'learn' }
  | { kind: 'settings'; tab: 'updates' | 'collaboration' | 'community' }
  | { kind: 'community' };

export interface NewsItem {
  id: string;
  /** The small line above the title. */
  label: string;
  title: string;
  text: string;
  /** A picture from the wiki, under /help. */
  image: string;
  go: NewsTarget;
  gate?: Gate;
}

export const NEWS: readonly NewsItem[] = [
  {
    id: 'wiki',
    label: 'New',
    title: 'The wiki',
    text: 'An article for every command, setting and workspace, with pictures. Find one from anywhere with the key shown at the top.',
    image: '/help/editor-at-a-glance-layout.webp',
    go: { kind: 'wiki' },
  },
  {
    id: 'channels',
    label: 'New',
    title: 'Stable, beta and alpha',
    text: 'What reaches a server waits on the alpha channel, which opens with an invitation. Switch in Settings, Updates; it works at once.',
    image: '/help/open-settings-pages.webp',
    go: { kind: 'settings', tab: 'updates' },
  },
  {
    id: 'learn',
    label: 'Learn',
    title: 'Lessons you can step into',
    text: 'Follow a recorded lesson, and open any step as a model of your own.',
    image: '/help/learn-page.webp',
    go: { kind: 'learn' },
  },
  {
    id: 'community',
    label: 'Alpha',
    title: 'Community',
    text: 'Lessons, plugins and a leaderboard from a store you choose.',
    image: '/help/community-lessons.webp',
    go: { kind: 'community' },
    gate: 'alpha',
  },
  {
    id: 'collaboration',
    label: 'Alpha',
    title: 'Work on one model together',
    text: 'Share a project through your own server, end-to-end encrypted, and edit it live.',
    image: '/help/collaboration-live.webp',
    go: { kind: 'settings', tab: 'collaboration' },
    gate: 'alpha',
  },
];
