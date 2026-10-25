/**
 * Drops whatever is in hand (sketch in progress, tool, flyout, measurement, selection) when another
 * project opens, since tool targets belong to one document, and when a lesson starts, so it begins
 * from a clear screen.
 */

import { useEffect, useRef } from 'react';
import { GUIDE_START } from './nib.js';

export function usePutDown(documentId: string, putDown: () => void): void {
  const latest = useRef(putDown);
  latest.current = putDown;
  const previous = useRef(documentId);
  useEffect(() => {
    if (previous.current === documentId) return;
    previous.current = documentId;
    latest.current();
  }, [documentId]);
  useEffect(() => {
    const onStart = () => latest.current();
    window.addEventListener(GUIDE_START, onStart);
    return () => window.removeEventListener(GUIDE_START, onStart);
  }, []);
}
