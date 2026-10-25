/**
 * Keeps the automation link (link.ts) up while the editor is open and supplies editor state no
 * other hook records: the selection and a way to show notices. Renders nothing; assistant changes
 * are announced through the editor's notices.
 */

import type { StableRef } from '@bezier/core';
import { useEffect } from 'react';
import type { Said } from '../said.js';
import { connect } from './link.js';
import { live } from './live.js';

export function AutomationLayer(props: {
  selected: readonly StableRef[];
  say: (message: string | Said) => void;
}) {
  live.selected = props.selected;
  live.say = props.say;
  useEffect(() => connect(), []);
  return null;
}
