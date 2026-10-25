/**
 * Settings sections and their search keywords. Shared by the Settings page and the start page
 * search (`library-search.ts`), so a setting is found by the same words that list it.
 */

import { type Channel, type Gate, reaches } from '@bezier/lessons';
import { matchesAll } from './library-search.js';

export type SettingsTab =
  | 'general'
  | 'appearance'
  | 'nib'
  | 'interaction'
  | 'viewport'
  | 'shortcuts'
  | 'collaboration'
  | 'community'
  | 'updates'
  | 'mcp'
  | 'data'
  | 'contribute';
export const CATEGORIES: readonly {
  id: SettingsTab;
  label: string;
  group: string;
  keywords: string;
  /** Release-channel gate: hidden from lists, search and navigation on lower channels. */
  gate?: Gate;
}[] = [
  {
    id: 'general',
    label: 'General',
    group: 'Bezier',
    keywords: 'startup workspace default reset performance graph frame time fps responsiveness',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    group: 'Bezier',
    keywords:
      'theme dark light scale glass transparency contrast motion density selection colour color highlight picked',
  },
  {
    id: 'nib',
    label: 'Nib',
    group: 'Bezier',
    keywords:
      'nib robot mascot helper assistant lessons tutorial tour help tips progress work load slow sweat name colour color eyes look',
  },
  {
    id: 'interaction',
    label: 'Interaction',
    group: 'Workspace',
    keywords: 'navigation mouse trackpad orbit pan zoom invert scroll device preset',
  },
  {
    id: 'viewport',
    label: 'Viewport',
    group: 'Workspace',
    keywords: 'quality tessellation performance speed fps resolution smooth geometry curves',
  },
  {
    id: 'shortcuts',
    label: 'Shortcuts',
    group: 'Workspace',
    keywords: 'keyboard command keys hotkeys bindings reset preset',
  },
  {
    id: 'collaboration',
    label: 'Collaboration',
    group: 'Sharing',
    keywords:
      'share sharing server sync team together invite vault backup machine name branch history presence self-hosted proxmox',
    gate: 'alpha',
  },
  {
    id: 'community',
    label: 'Community',
    group: 'Sharing',
    keywords:
      'community store lessons plugins share download install server address self-hosted points count contributions badges',
    gate: 'alpha',
  },
  {
    id: 'updates',
    label: 'Updates',
    group: 'System',
    keywords: 'stable beta alpha channel invitation code branch git release',
  },
  {
    id: 'mcp',
    label: 'MCP & Automation',
    group: 'System',
    keywords: 'mcp api tools agents permissions server automation',
  },
  {
    id: 'data',
    label: 'Data & Privacy',
    group: 'System',
    keywords: 'local storage privacy telemetry projects reset',
  },
  {
    id: 'contribute',
    label: 'Contribute',
    group: 'Make it better',
    keywords:
      'github issue bug report idea feedback source code open contribute help broken missing',
  },
];

export type SettingsSection = (typeof CATEGORIES)[number];

/** The sections whose name, group or keywords contain every term. */
/**
 * The sections reachable on this channel. Below alpha, server-related pages are omitted from lists
 * and search.
 */
export function settingsOf(channel: Channel): readonly SettingsSection[] {
  return CATEGORIES.filter((item) => item.gate === undefined || reaches(channel, item.gate));
}

export function settingsMatching(
  terms: readonly string[],
  channel: Channel,
): readonly SettingsSection[] {
  const sections = settingsOf(channel);
  if (terms.length === 0) return sections;
  return sections.filter((item) =>
    matchesAll(`${item.label} ${item.group} ${item.keywords}`, terms),
  );
}
