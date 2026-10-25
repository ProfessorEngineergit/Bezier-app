import { useLayoutEffect } from 'react';

/**
 * Tells the shell how much of the stage's right side the workspace's panel takes (plus its edge
 * margin) while the workspace is visible, so the quick settings sit to its left at the foot of
 * the picture rather than under it (audit D5).
 */
export function useSidePanel(width: number, active: boolean): void {
  useLayoutEffect(() => {
    const stage = document.querySelector<HTMLElement>('.workspace .stage');
    if (stage === null || !active) return;
    stage.style.setProperty('--side-panel', `calc(${width}px + var(--edge))`);
    return () => {
      stage.style.removeProperty('--side-panel');
    };
  }, [width, active]);
}
