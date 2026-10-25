import type { ViewSettings } from '@bezier/ui';
import type { MutableRefObject } from 'react';
import { useCallback } from 'react';
import { save } from './download.js';
import type { Session } from './session.js';
import type { ViewportHandle } from './Viewport.js';

interface CaptureDeps {
  sessionRef: MutableRefObject<Session | null>;
  settings: ViewSettings;
  say: (message: string) => void;
  viewportRef: MutableRefObject<ViewportHandle | null>;
}

export function useCapture({ sessionRef, settings, say, viewportRef }: CaptureDeps): () => void {
  return useCallback(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    const name = sessionRef.current?.document.meta.name ?? 'bezier';

    viewport.setGridVisible(settings.shotGrid);
    viewport.setEdgesVisible(settings.shotEdges);
    // Pass scale and transparency from the screenshot panel to the renderer.
    void viewport
      .capture({ scale: settings.shotScale, transparent: settings.shotTransparent })
      .then((blob) => {
        viewport.setGridVisible(settings.showGrid);
        viewport.setEdgesVisible(settings.showEdges);

        if (blob === null) {
          say('The frame could not be captured.');
          return;
        }
        void save(blob, `${name}.png`, 'image/png').catch((error: unknown) => {
          say(error instanceof Error ? error.message : String(error));
        });
      });
  }, [sessionRef, settings, say, viewportRef]);
}
