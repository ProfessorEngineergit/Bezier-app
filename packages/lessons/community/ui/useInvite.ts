/** The alpha invitation this device holds, as React reads it. */

import { useSyncExternalStore } from 'react';
import { currentInvite, onAlphaChange } from '../client/alpha.js';
import type { Invite } from '../client/invite.js';

export const useInvite = (): Invite | null => useSyncExternalStore(onAlphaChange, currentInvite);
