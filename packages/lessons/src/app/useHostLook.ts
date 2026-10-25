import { useEffect, useState } from 'react';
import type { ColorScheme, LessonHost } from '../host/contract.js';

/** The editor's colour scheme and motion setting, as attributes on a Lessons root. */
export function useHostLook(host: LessonHost): { scheme: ColorScheme; reducedMotion: boolean } {
  const [scheme, setScheme] = useState<ColorScheme>(() => host.colorScheme());
  const [reducedMotion, setReducedMotion] = useState(() => host.reducedMotion());

  useEffect(() => {
    setScheme(host.colorScheme());
    setReducedMotion(host.reducedMotion());
    const stop = host.onColorScheme((next) => {
      setScheme(next);
      setReducedMotion(host.reducedMotion());
    });
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReducedMotion(host.reducedMotion() || query.matches);
    query.addEventListener('change', onChange);
    return () => {
      stop();
      query.removeEventListener('change', onChange);
    };
  }, [host]);

  return { scheme, reducedMotion };
}
