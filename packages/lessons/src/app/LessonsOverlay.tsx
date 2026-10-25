/**
 * The Lessons overlay above the editor. Always mounted; renders only during a recording or a
 * follow-along.
 */

import '../ui/lessons.css';
import '../ui/chrome.css';
import '../ui/notice.css';
import { FollowPanel } from '../follow/FollowPanel.js';
import { RecordingBar } from '../record/RecordingBar.js';
import { LessonsProvider, useLessonsState } from './context.js';
import type { Lessons } from './lessons.js';
import { NoticeLine } from './NoticeLine.js';
import { useHostLook } from './useHostLook.js';

function Surfaces() {
  const { recording, following, starting } = useLessonsState();
  if (recording !== null) return <RecordingBar session={recording} />;
  if (starting) {
    return (
      <div className="lessons-starting lessons-glass" role="status">
        Starting the recording…
      </div>
    );
  }
  if (following !== null)
    return (
      <FollowPanel key={`${following.lesson.manifest.id}:${following.preserveModel === true}`} />
    );
  return null;
}

export function LessonsOverlay({ lessons }: { lessons: Lessons }) {
  const look = useHostLook(lessons.host);
  return (
    <LessonsProvider value={lessons}>
      <div
        className="lessons lessons-overlay"
        data-lessons-overlay=""
        data-reduced-motion={look.reducedMotion ? 'true' : undefined}
        data-scheme={look.scheme}
      >
        <NoticeLine over="editor" />
        <Surfaces />
      </div>
    </LessonsProvider>
  );
}
