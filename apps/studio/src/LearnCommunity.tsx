/**
 * The Learn toolbar switch that adds community lessons beside the local ones. The choice is stored
 * on this device; without a reachable community there is no switch.
 */

import { CommunityLessons, useCommunityLessonsAvailable } from '@bezier/lessons';
import { useState } from 'react';
import { Switch } from './PrefsControls.js';

const KEY = 'bezier.learn.community';

function stored(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

/** Returns Learn's toolbar switch and the community lessons to list. */
export function useLearnCommunity(query: string, onOpenLesson: (id: string) => void) {
  const available = useCommunityLessonsAvailable();
  const [on, setOn] = useState(stored);
  if (!available) return {};
  const change = (next: boolean) => {
    setOn(next);
    try {
      localStorage.setItem(KEY, next ? 'on' : 'off');
    } catch {
      // Storage unavailable: keep the choice for this session only.
    }
  };
  return {
    tools: (
      // biome-ignore lint/a11y/noLabelWithoutControl: the control is the child, inside `Switch`
      <label className="learn-community-switch">
        <Switch checked={on} label="Include community lessons" onChange={change} />
        Include community lessons
      </label>
    ),
    ...(on
      ? {
          ownTitle: 'On this device',
          after: <CommunityLessons onOpenLesson={onOpenLesson} query={query} />,
        }
      : {}),
  };
}
