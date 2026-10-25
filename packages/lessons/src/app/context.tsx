import { createContext, useContext } from 'react';
import type { Lessons } from './lessons.js';
import { useObservable } from './observable.js';
import type { LessonsState } from './state.js';

const LessonsContext = createContext<Lessons | null>(null);

export const LessonsProvider = LessonsContext.Provider;

export function useLessons(): Lessons {
  const lessons = useContext(LessonsContext);
  if (lessons === null) {
    throw new Error('Lessons components must be rendered inside LessonsHome or LessonsOverlay.');
  }
  return lessons;
}

export function useLessonsState(): LessonsState {
  return useObservable(useLessons().state);
}
