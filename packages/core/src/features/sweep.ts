/**
 * Sweep: moves one sketch's region along another sketch's curves (ADR 0017, audit F-032). The
 * path is built by `sketch-path.ts`; draw the profile across the path's start.
 */

import { err } from '@bezier/kernel';
import { combineWithBody } from './bodies.js';
import { defineFeature } from './registry.js';

export const sweepFeature = defineFeature({
  type: 'sweep',
  label: 'Sweep',
  params: {
    profile: { kind: 'featureRef', label: 'Profile sketch' },
    path: { kind: 'featureRef', label: 'Path sketch' },
    operation: {
      kind: 'choice',
      label: 'Result',
      options: ['new', 'add', 'cut'],
      default: 'new',
    },
  },
  faceTags: ['start', 'end', 'side-*'],
  async rebuild(kernel, params, input) {
    const profiles = input.profiles(params.profile);
    if (profiles === null)
      return err('open-profile', 'The profile sketch could not be found or solved.');
    const [profile] = profiles;
    if (profile === undefined || profiles.length !== 1)
      return err(
        'open-profile',
        profiles.length === 0
          ? 'The profile sketch needs one closed area to sweep.'
          : 'The profile sketch has several closed areas; a sweep carries one.',
      );
    const path = input.path?.(params.path) ?? null;
    if (path === null) return err('open-profile', 'The path sketch could not be found or solved.');
    if (typeof path === 'string') return err('open-profile', path);
    const created = await kernel.sweep(profile, path);
    if (!created.ok) return created;
    return combineWithBody(kernel, input.body, created.value, params.operation);
  },
});
