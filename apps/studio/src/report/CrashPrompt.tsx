/**
 * A low-key offer to report after a crash: when a part stops or an error goes uncaught, it appears
 * at the bottom, pulses briefly, and starts a report prefilled with what was caught. Never modal,
 * dismisses itself, and appears at most once every few minutes.
 */

import { useEffect, useState } from 'react';
import { type Crash, onCrash } from './log-buffer.js';
import { openReport } from './ReportHost.js';
import './report.css';

const QUIET_FOR = 5 * 60_000;
const SHOWN_FOR = 30_000;

export function CrashPrompt({ hidden }: { hidden: boolean }) {
  const [crash, setCrash] = useState<Crash | null>(null);

  useEffect(() => {
    let last = -Infinity;
    return onCrash((next) => {
      const now = Date.now();
      if (now - last < QUIET_FOR) return;
      last = now;
      setCrash(next);
    });
  }, []);

  useEffect(() => {
    if (crash === null) return;
    const timer = window.setTimeout(() => setCrash(null), SHOWN_FOR);
    return () => window.clearTimeout(timer);
  }, [crash]);

  // Opening the window completes the offer.
  useEffect(() => {
    if (hidden) setCrash(null);
  }, [hidden]);

  if (crash === null || hidden) return null;
  return (
    <div aria-live="polite" className="crash-prompt" role="status">
      <span className="crash-prompt__text">
        <strong>That did not go as it should.</strong> Bezier is still in development. Send what
        happened, with the details of this machine, so it can be fixed?
      </span>
      <button
        className="crash-prompt__send"
        onClick={() => {
          setCrash(null);
          openReport({ title: crash.title, what: `${crash.detail}\n\nWhat I was doing: ` });
        }}
        type="button"
      >
        Send a report
      </button>
      <button
        aria-label="Not now"
        className="crash-prompt__close"
        onClick={() => setCrash(null)}
        title="Not now"
        type="button"
      >
        ×
      </button>
    </div>
  );
}
