/**
 * React integration: controller context, the companion rendered once, and spots where he can stand.
 * Without a provider (Nib off) spots render nothing and `useOptionalNib` returns null.
 */

import { createContext, type ReactNode, useContext, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DEFAULT_WIDTH, type NibController } from './controller.js';
import { heightFor } from './layout.js';
import { NibCompanion } from './NibCompanion.js';

const Context = createContext<NibController | null>(null);

export interface NibProviderProps {
  controller: NibController;
  model: string;
  poster: string;
  still?: boolean;
  /** Nib off: no figure, no spots, nothing loaded. Children keep their tree position. */
  enabled?: boolean;
  /** Accessible label; he is a button, so it describes what pressing him does. */
  label: string;
  children: ReactNode;
}

export function NibProvider({
  controller,
  model,
  poster,
  still = false,
  enabled = true,
  label,
  children,
}: NibProviderProps) {
  // Any page click may be what a guide waits for; the capture phase sees it first.
  useEffect(() => {
    const onClick = (event: MouseEvent) =>
      controller.notify({ kind: 'click', target: event.target }, performance.now() / 1000);
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [controller]);
  return (
    <Context.Provider value={enabled ? controller : null}>
      {children}
      {enabled &&
        createPortal(
          <NibCompanion
            controller={controller}
            label={label}
            model={model}
            poster={poster}
            still={still}
          />,
          document.body,
        )}
    </Context.Provider>
  );
}

/** The controller, or null when Nib is off. */
export function useOptionalNib(): NibController | null {
  return useContext(Context);
}

export function useNib(): NibController {
  const controller = useContext(Context);
  if (controller === null) throw new Error('useNib needs a NibProvider above it.');
  return controller;
}

export interface NibSpotProps {
  /** Priority among several spots on the page; the highest wins. */
  priority?: number;
  width?: number;
  className?: string;
  /**
   * Full figure, or in a square round window: small full figure (`whole`) or head and neck
   * (`head`).
   */
  frame?: 'full' | 'head' | 'whole';
}

/** A place on the page where he may stand. Sized for him, renders nothing itself. */
export function NibSpot({
  priority = 0,
  width = DEFAULT_WIDTH,
  className,
  frame = 'full',
}: NibSpotProps) {
  const controller = useOptionalNib();
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = element.current;
    if (controller === null || node === null) return;
    return controller.registerSpot(node, { priority, width, frame });
  }, [controller, priority, width, frame]);
  if (controller === null) return null;
  return (
    <div
      aria-hidden="true"
      className={className === undefined ? 'nib-spot' : `nib-spot ${className}`}
      ref={element}
      style={{ width, height: frame === 'full' ? heightFor(width) : width }}
    />
  );
}
