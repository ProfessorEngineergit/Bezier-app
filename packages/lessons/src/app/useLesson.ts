import { useEffect, useState } from 'react';
import type { StoredLesson } from '../format/manifest.js';
import { useLessons } from './context.js';

/** Loads a lesson by id. `setLesson` updates the local copy after a save. */
export function useLesson(id: string): {
  lesson: StoredLesson | null;
  error: string | null;
  setLesson: (lesson: StoredLesson) => void;
} {
  const lessons = useLessons();
  const [lesson, setLesson] = useState<StoredLesson | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLesson(null);
    setError(null);
    lessons
      .load(id)
      .then((loaded) => {
        if (!cancelled) setLesson(loaded);
      })
      .catch((problem: unknown) => {
        console.error(problem);
        if (!cancelled) {
          setError(problem instanceof Error ? problem.message : 'This lesson could not be opened.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, lessons]);

  return { lesson, error, setLesson };
}
