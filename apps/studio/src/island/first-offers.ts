/**
 * Nib's only unprompted messages: on the first project and the first visit to each workspace he
 * offers its lesson, once per machine. The mark is stored when the offer is made, so workspaces
 * used before this existed count as new once. Suppressed during a lesson, the film, a project
 * load, or when Nib is off.
 */

import { useEffect } from 'react';
import { nib, startGuide } from '../nib.js';
import { FIRST_IN, FIRST_PART, GREETING } from '../nib-guides.js';
import type { NibLevel } from '../preferences.js';
import { setFirstMeeting } from './first-meeting.js';

const KEY = 'bezier.nib.offered';
/** Dispatched by Settings › Nib when it resets which lessons were offered. */
export const OFFERS_RESET = 'bezier:nib-offers-reset';
/** How long a workspace must be open before he offers its lesson. */
const SETTLE_MS = 1600;

function offered(): Set<string> {
  try {
    const kept: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return new Set(Array.isArray(kept) ? kept.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function markOffered(id: string): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...offered(), id]));
  } catch {
    // Not stored: the offer may repeat, the lesser harm.
  }
}

/** Whether the start page (landing or projects) is visible with nothing in front of it. */
function startPageOnShow(): boolean {
  if (document.documentElement.hasAttribute('data-loading-below-bar')) return false;
  if (document.querySelector('.film') !== null) return false;
  return document.querySelector('.library[data-loaded], .landing') !== null;
}

/** Greets on first launch; the window waits for the answer. */
function greet(): void {
  nib.markMet();
  setFirstMeeting(true);
  nib.say(GREETING, {
    options: [
      {
        label: 'Show me',
        run: () => {
          setFirstMeeting(false);
          startGuide(FIRST_PART);
        },
      },
      {
        label: 'Not now',
        run: () => {
          setFirstMeeting(false);
          nib.hush();
        },
      },
    ],
  });
}

/** The visible workspace of an open project, or null on the start page and while loading. */
function workspaceOnShow(): string | null {
  if (document.querySelector('.library[data-loaded]') !== null) return null;
  if (document.documentElement.hasAttribute('data-loading-below-bar')) return null;
  if (document.querySelector('.film') !== null) return null;
  return document.querySelector('.workspace')?.getAttribute('data-workspace') ?? null;
}

export function useFirstOffers(level: NibLevel): void {
  useEffect(() => {
    if (level === 'off') return;
    let since: { id: string; at: number } | null = null;
    let greeting: number | null = null;
    const look = () => {
      // First launch: a blocking greeting before anything else, on the start page or in a project
      // opened directly.
      if (!nib.memory.met) {
        if (nib.guiding || (!startPageOnShow() && workspaceOnShow() === null)) {
          greeting = null;
          return;
        }
        greeting ??= performance.now();
        if (performance.now() - greeting >= SETTLE_MS) greet();
        return;
      }
      // Every workspace offered: stop polling (every 400 ms).
      if (Object.keys(FIRST_IN).every((id) => known.has(id))) {
        window.clearInterval(timer);
        return;
      }
      const id = workspaceOnShow();
      if (id === null || nib.guiding || nib.getSnapshot().bubble !== null) {
        since = null;
        return;
      }
      if (since?.id !== id) since = { id, at: performance.now() };
      const first = FIRST_IN[id];
      if (first === undefined || known.has(id)) return;
      // Already greeted on the start page with the same lesson; not twice.
      if (id === 'design' && nib.memory.met) {
        markOffered(id);
        known.add(id);
        return;
      }
      if (performance.now() - since.at < SETTLE_MS) return;
      markOffered(id);
      known.add(id);
      nib.say(first.offer, {
        options: [
          { label: 'Start the lesson', run: () => startGuide(first.guide) },
          { label: 'Later', run: () => nib.hush() },
        ],
      });
    };
    // Read once, and again when Settings › Nib clears it; only this hook writes it meanwhile.
    let known = offered();
    let timer = window.setInterval(look, 400);
    const reset = () => {
      known = offered();
      window.clearInterval(timer);
      timer = window.setInterval(look, 400);
    };
    window.addEventListener(OFFERS_RESET, reset);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(OFFERS_RESET, reset);
    };
  }, [level]);
}
