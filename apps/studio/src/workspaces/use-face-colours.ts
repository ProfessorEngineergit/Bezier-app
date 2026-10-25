/**
 * Individual faces in Visualize: which are picked, which is hovered, and their colours. The
 * hovered face is always highlighted, as in Modeling; a click picks it and a double click its body
 * (`use-canvas-picking.ts`). Colours are stored per project on this device by face text name,
 * which survives a rebuild (`F:extrude-1:side-2`), like body finishes.
 */

import type { FaceLook, PresentationRenderer } from '@bezier/renderer';
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';

function read(key: string): Record<string, string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === 'string' && /^#[0-9a-f]{6}$/i.test(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}

export function useFaceColours({
  id,
  renderer,
  ready,
  geometry,
}: {
  id: string;
  renderer: RefObject<PresentationRenderer | null>;
  ready: boolean;
  geometry: unknown;
}) {
  const storageKey = `bezier.visualize.faces.${id}`;
  const [colours, setColours] = useState<Record<string, string>>(() => read(storageKey));
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const loaded = useRef(storageKey);

  // Another project: its own colours, nothing picked.
  useEffect(() => {
    if (loaded.current === storageKey) return;
    loaded.current = storageKey;
    setColours(read(storageKey));
    setSelected([]);
    setHover(null);
  }, [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(colours));
    } catch {
      /* Storage can be disabled; colouring still works. */
    }
  }, [colours, storageKey]);

  const look = useMemo<FaceLook>(
    () => ({
      colours,
      hover,
      selected,
    }),
    [colours, hover, selected],
  );
  // The geometry is a dependency too: a rebuilt mesh has no colours until they are reapplied.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (ready) renderer.current?.setFaces(look);
  }, [look, ready, geometry, renderer]);

  // Picked faces get the selection colour from `--select`.
  useEffect(() => {
    if (!ready) return;
    const root = document.documentElement;
    const apply = () => {
      const colour = getComputedStyle(root).getPropertyValue('--select').trim();
      if (/^#[0-9a-f]{6}$/i.test(colour)) renderer.current?.setSelectionColour(colour);
    };
    apply();
    const watch = new MutationObserver(apply);
    watch.observe(root, { attributes: true });
    return () => watch.disconnect();
  }, [ready, renderer]);

  const pick = useCallback((face: string | null, additive: boolean) => {
    setSelected((old) => {
      if (face === null) return additive ? old : [];
      if (!additive) return old.length === 1 && old[0] === face ? [] : [face];
      return old.includes(face) ? old.filter((key) => key !== face) : [...old, face];
    });
  }, []);

  const paint = useCallback(
    (colour: string | null) => {
      setColours((old) => {
        const next = { ...old };
        for (const face of selected) {
          if (colour === null) delete next[face];
          else next[face] = colour;
        }
        return next;
      });
    },
    [selected],
  );

  return {
    selected,
    /** Deselects all faces; their body is picked instead. */
    clear: () => setSelected([]),
    colours,
    hover,
    setHover,
    pick,
    paint,
    /** The colour shown for the picked faces: theirs if they agree, else none. */
    shown: (() => {
      const first = selected[0];
      if (first === undefined) return null;
      const colour = colours[first] ?? null;
      return selected.every((face) => (colours[face] ?? null) === colour) ? colour : null;
    })(),
    anyColoured: selected.some((face) => colours[face] !== undefined),
  };
}
