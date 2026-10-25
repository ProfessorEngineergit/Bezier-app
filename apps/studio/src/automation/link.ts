/**
 * The window's end of the link to Bezier's MCP server (`apps/mcp-server/server/app-link.ts`).
 *
 * Off until enabled in Settings with the server's pairing code. The window then opens an event
 * stream, answers each request via answers.ts and posts the result back. The server can only make
 * named requests from a fixed list. Plain HTTP is allowed only to this machine; other addresses
 * must be https so the code and model do not cross a network in the clear.
 */

import { APP_METHODS, type AppMethod, answer, type SettingChange } from './answers.js';
import { live } from './live.js';

export type LinkStatus = 'off' | 'connecting' | 'connected' | 'refused' | 'unreachable';

export interface LinkActivity {
  at: number;
  method: AppMethod | string;
  ok: boolean;
  ms: number;
}

export interface LinkState {
  on: boolean;
  address: string;
  code: string;
  status: LinkStatus;
  /** Newest first, at most 30. */
  activity: readonly LinkActivity[];
  /** Settings an assistant changed, newest first, so the user can revert them. */
  changes: readonly SettingChange[];
}

export const DEFAULT_ADDRESS = 'http://127.0.0.1:7357';
const STORAGE = 'bezier.mcp';
const APP_VERSION = 'development';

let state: LinkState = { ...readSaved(), status: 'off', activity: [], changes: [] };
const listeners = new Set<() => void>();
let source: EventSource | null = null;

function readSaved(): Pick<LinkState, 'on' | 'address' | 'code'> {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) ?? '{}') as Partial<LinkState>;
    return {
      on: saved.on === true,
      address: typeof saved.address === 'string' ? saved.address : DEFAULT_ADDRESS,
      code: typeof saved.code === 'string' ? saved.code : '',
    };
  } catch {
    return { on: false, address: DEFAULT_ADDRESS, code: '' };
  }
}

function set(next: Partial<LinkState>): void {
  state = { ...state, ...next };
  try {
    const { on, address, code } = state;
    localStorage.setItem(STORAGE, JSON.stringify({ on, address, code }));
  } catch {
    // Private browsing may refuse storage; the link still works for this session.
  }
  for (const listener of listeners) listener();
}

export const linkState = (): LinkState => state;

export function onLinkChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Why an address cannot be used, in a sentence, or null. */
export function addressProblem(address: string): string | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return 'That is not an address. It looks like http://127.0.0.1:7357.';
  }
  const local =
    url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]';
  if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) return null;
  return 'A server on another machine must be reached over https.';
}

export function configureLink(next: Partial<Pick<LinkState, 'on' | 'address' | 'code'>>): void {
  set(next);
  connect();
}

/** Opens the link when enabled with a code, or closes it. Called on start and on change. */
export function connect(): void {
  source?.close();
  source = null;
  const { on, address, code } = state;
  if (!on || code.trim() === '' || addressProblem(address) !== null) {
    set({ status: 'off' });
    return;
  }
  const base = address.replace(/\/+$/, '');
  const url = `${base}/app/events?code=${encodeURIComponent(code.trim())}&version=${APP_VERSION}`;
  const stream = new EventSource(url);
  source = stream;
  set({ status: 'connecting' });
  stream.addEventListener('hello', () => set({ status: 'connected' }));
  stream.addEventListener('request', (event) => void handle(base, code.trim(), event.data));
  stream.onerror = () => {
    if (source !== stream) return;
    // Closed means the server refused (wrong code, refused origin); still connecting means it is
    // unreachable and the browser keeps retrying.
    set({ status: stream.readyState === EventSource.CLOSED ? 'refused' : 'unreachable' });
  };
}

async function handle(base: string, code: string, data: unknown): Promise<void> {
  let request: { id?: unknown; method?: unknown; params?: unknown };
  try {
    request = JSON.parse(String(data)) as typeof request;
  } catch {
    return;
  }
  if (typeof request.id !== 'number' || typeof request.method !== 'string') return;
  const started = performance.now();
  const method = request.method;
  const params =
    request.params !== null && typeof request.params === 'object'
      ? (request.params as Record<string, unknown>)
      : {};
  let reply: { id: number; ok: boolean; value?: unknown; error?: string };
  if (!(APP_METHODS as readonly string[]).includes(method)) {
    reply = { id: request.id, ok: false, error: `Bezier does not answer ${method}.` };
  } else {
    try {
      const value = await answer(method as AppMethod, params, noteChanges);
      reply = { id: request.id, ok: true, value };
    } catch (problem) {
      reply = {
        id: request.id,
        ok: false,
        error: problem instanceof Error ? problem.message : 'Failed.',
      };
    }
  }
  const entry = {
    at: Date.now(),
    method,
    ok: reply.ok,
    ms: Math.round(performance.now() - started),
  };
  set({ activity: [entry, ...state.activity].slice(0, 30) });
  await fetch(`${base}/app/reply`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${code}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(reply),
  }).catch(() => set({ status: 'unreachable' }));
}

/** Announces each change on screen as it happens and records it for reverting. */
function noteChanges(changes: readonly SettingChange[]): void {
  set({ changes: [...changes, ...state.changes].slice(0, 30) });
  const said = changes.map((change) => `${change.key} to ${String(change.to)}`).join(', ');
  live.say?.(`An assistant changed ${said}. Settings, MCP & Automation can put it back.`);
}

/** Reverts one change an assistant made. */
export function revertChange(index: number): void {
  const change = state.changes[index];
  const prefs = live.prefs;
  if (change === undefined || prefs === null || live.setPrefs === null) return;
  live.setPrefs({ ...prefs, [change.key]: change.from });
  set({ changes: state.changes.filter((_, i) => i !== index) });
}
