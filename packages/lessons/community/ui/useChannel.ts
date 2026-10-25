/** The release channel as React reads it. */

import { useSyncExternalStore } from 'react';
import { type Channel, currentChannel, onChannelChange } from '../client/channel.js';

export const useChannel = (): Channel => useSyncExternalStore(onChannelChange, currentChannel);
