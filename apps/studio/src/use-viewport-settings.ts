/**
 * Keeps the viewport in sync with settings: navigation, how much resolution may drop while moving,
 * scroll device interpretation, and measurement snap points.
 */

import { type NavigationPrefs, setMotionPreference } from '@bezier/renderer';
import { type RefObject, useEffect, useState } from 'react';
import type { ViewportHandle } from './Viewport.js';

export function useViewportSettings(
  viewportRef: RefObject<ViewportHandle | null>,
  settings: { navigation: NavigationPrefs; smoothness: number },
  /** Changes when a project opens, which recreates the viewport behind the ref. */
  view: unknown,
  measuring: boolean,
): 'mouse' | 'trackpad' | null {
  const { navigation, smoothness } = settings;
  // Apply navigation changes to the existing controls.
  useEffect(() => {
    viewportRef.current?.setNavigation(navigation);
  }, [viewportRef, navigation]);

  // Global for all viewports, read on each adjustment while moving.
  useEffect(() => setMotionPreference(smoothness / 100), [smoothness]);

  // The current automatic scroll-device guess, for the toggle at the canvas corner. Re-attached
  // when a project opens, since the viewport is recreated.
  const [scrollSeen, setScrollSeen] = useState<'mouse' | 'trackpad' | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `view` changes when the viewport is replaced
  useEffect(() => {
    viewportRef.current?.onScrollDevice(setScrollSeen);
    return () => viewportRef.current?.onScrollDevice(null);
  }, [viewportRef, view]);

  // Only measuring requests snap points; other tools would pay for walking the model's seams on
  // every hover.
  useEffect(() => {
    viewportRef.current?.setSnapping(measuring);
  }, [viewportRef, measuring]);

  return scrollSeen;
}
