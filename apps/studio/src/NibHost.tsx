/**
 * Mounts Nib over the whole app. Always renders the same tree, toggled by the setting, so turning
 * him off does not remount the app.
 */

import { NibProvider } from '@bezier/nib';
import type { ReactNode } from 'react';
import { nib, useNibSettings } from './nib.js';

export function NibHost({ children }: { children: ReactNode }) {
  const { enabled, still } = useNibSettings();
  return (
    <NibProvider
      controller={nib}
      enabled={enabled}
      label="Nib, Bezier's robot. Press to say hello."
      model="/nib/nib.glb"
      poster="/nib/nib-poster.webp"
      still={still}
    >
      {children}
    </NibProvider>
  );
}
