/** Photographic Visualize presets and the local assets that light them. */

import type { PresentationSettings } from '@bezier/renderer';

type EnvironmentSettings = Pick<
  PresentationSettings,
  'background' | 'transparent' | 'ground' | 'groundColor' | 'environment' | 'light' | 'exposure'
>;

export interface VisualizeEnvironment {
  id: string;
  name: string;
  /** A public asset URL; null selects the procedural fallback. */
  url: string | null;
  preview: {
    key: string;
    fill: string;
  };
  /** What the environment changes; material and camera choices stay untouched. */
  settings: EnvironmentSettings;
}

const NEUTRAL_HDR = '/environments/studio-neutral.hdr';
const WARM_HDR = '/environments/studio-warm.hdr';
const COOL_HDR = '/environments/studio-cool.hdr';

export const VISUALIZE_ENVIRONMENTS: readonly VisualizeEnvironment[] = [
  {
    id: 'neutral-studio',
    name: 'Neutral Studio',
    url: NEUTRAL_HDR,
    preview: { key: '#f4f4f1', fill: '#c7cbd0' },
    settings: {
      background: '#d8d9d9',
      transparent: false,
      ground: true,
      groundColor: '#d8d9d9',
      environment: 1.15,
      light: 1.8,
      exposure: 0.1,
    },
  },
  {
    id: 'warm-studio',
    name: 'Warm Studio',
    url: WARM_HDR,
    preview: { key: '#ffe2bd', fill: '#76543b' },
    settings: {
      background: '#29221d',
      transparent: false,
      ground: true,
      groundColor: '#3a3028',
      environment: 1,
      light: 2.3,
      exposure: -0.05,
    },
  },
  {
    id: 'technical-studio',
    name: 'Technical Studio',
    url: COOL_HDR,
    preview: { key: '#ededed', fill: '#52555b' },
    settings: {
      background: '#24262a',
      transparent: false,
      ground: true,
      groundColor: '#24262a',
      environment: 0.9,
      light: 2,
      exposure: 0.05,
    },
  },
  {
    id: 'mood',
    name: 'Custom Backdrop',
    url: NEUTRAL_HDR,
    preview: { key: '#f8eee4', fill: '#bba28b' },
    settings: {
      background: '#c9b8a6',
      transparent: false,
      ground: false,
      groundColor: '#c9b8a6',
      environment: 1,
      light: 2,
      exposure: 0.1,
    },
  },
  {
    id: 'transparent',
    name: 'Transparent',
    url: NEUTRAL_HDR,
    preview: { key: '#f4f4f1', fill: '#8f949c' },
    settings: {
      background: '#2a2d33',
      transparent: true,
      ground: false,
      groundColor: '#4d5057',
      environment: 1.1,
      light: 1.8,
      exposure: 0.1,
    },
  },
];

export const INITIAL_VISUALIZE_ENVIRONMENT = VISUALIZE_ENVIRONMENTS[0] as VisualizeEnvironment;
