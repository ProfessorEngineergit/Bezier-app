/** Once per start, the desktop app asks whether a newer version is out, if the setting is on. */

import { isTauri } from '@tauri-apps/api/core';
import { useEffect, useRef } from 'react';
import type { Said } from './said.js';
import { checkForUpdate } from './use-update-check.js';
import { VERSION } from './version.js';

export function useUpdateNotice(enabled: boolean, say: (message: Said) => void): void {
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !isTauri() || !enabled) return;
    asked.current = true;
    void checkForUpdate(VERSION).then(({ status, release }) => {
      if (status === 'available' && release !== null)
        say({
          title: `Bezier ${release.version} is out`,
          detail: 'Settings, Updates has what changed and the download.',
          once: `update-${release.version}`,
        });
    });
  }, [enabled, say]);
}
