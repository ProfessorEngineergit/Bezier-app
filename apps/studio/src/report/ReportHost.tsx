/**
 * Opens the report dialog for every screen (audit G3): the editor title bar button, the start page
 * sidebar button, and ⌘⇧R. Each screen registers its location and how to capture itself.
 */

import { useEffect, useState } from 'react';
import { useNibSettings } from '../nib.js';
import { VERSION } from '../version.js';
import { CrashPrompt } from './CrashPrompt.js';
import type { ProjectFacts } from './diagnostics.js';
import { ReportWindow } from './ReportWindow.js';

interface Source {
  where: string;
  capture: (() => Promise<Blob | null>) | null;
  facts?: () => ProjectFacts;
}

let source: Source = { where: 'the app', capture: null };
const EVENT = 'bezier:report';
/** Dispatched when the window opens and closes, for Nib in the title bar (a separate root). */
export const REPORT_OPEN_EVENT = 'bezier:report-open';

/**
 * Registers the visible screen for reports. Returns a restore function for a screen that unmounts
 * while the one beneath stays (the start page over an editor).
 */
export function setReportSource(next: Source): () => void {
  const before = source;
  source = next;
  return () => {
    if (source === next) source = before;
  };
}

/** Prefill for a report opened from a crash, so the user only has to describe what they did. */
export interface Prefill {
  title: string;
  what: string;
}

export function openReport(prefill?: Prefill): void {
  window.dispatchEvent(new CustomEvent<Prefill | undefined>(EVENT, { detail: prefill }));
}

export function ReportHost() {
  const [open, setOpen] = useState<{ source: Source; prefill?: Prefill } | null>(null);
  // Where Nib is in the title bar he makes the post-crash offer, and this one stays hidden.
  const { level } = useNibSettings();
  const shown = open !== null;
  useEffect(() => {
    window.dispatchEvent(new CustomEvent<boolean>(REPORT_OPEN_EVENT, { detail: shown }));
  }, [shown]);
  useEffect(() => {
    const show = (event?: Event) => {
      const prefill = (event as CustomEvent<Prefill | undefined> | undefined)?.detail;
      setOpen({ source, ...(prefill !== undefined ? { prefill } : {}) });
    };
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        show();
      }
    };
    window.addEventListener(EVENT, show);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener(EVENT, show);
      window.removeEventListener('keydown', key);
    };
  }, []);
  return (
    <>
      <CrashPrompt hidden={open !== null || level !== 'off'} />
      {open !== null && (
        <ReportWindow
          capture={open.source.capture}
          facts={open.source.facts ?? (() => ({}))}
          onClose={() => setOpen(null)}
          {...(open.prefill !== undefined ? { prefill: open.prefill } : {})}
          version={VERSION}
          where={open.source.where}
        />
      )}
    </>
  );
}
