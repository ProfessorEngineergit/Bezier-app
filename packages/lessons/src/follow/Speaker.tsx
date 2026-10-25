import type { StoredLesson } from '../format/manifest.js';
import type { Playback } from '../player/usePlayback.js';
import { useMediaUrl } from '../ui/useMediaUrl.js';

/**
 * The author's camera as a separate tile beside the recording, so it never covers the model. The
 * video is kept in sync by the playback.
 */
export function Speaker({ lesson, playback }: { lesson: StoredLesson; playback: Playback }) {
  const url = useMediaUrl(lesson.camera);
  if (lesson.camera === undefined) return null;
  return (
    <div className="lessons-speaker">
      <video
        aria-label="The author"
        muted
        playsInline
        preload="auto"
        ref={playback.camera}
        src={url || undefined}
      >
        <track kind="captions" />
      </video>
    </div>
  );
}
