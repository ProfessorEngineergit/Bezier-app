/**
 * Runs installed plugins and handles their calls.
 *
 * Each plugin gets a sandboxed frame (sandbox.ts) and a private MessagePort, its only channel to
 * the app. Every call is checked against the granted permissions and limited in size and rate. A
 * plugin that stops responding or navigates its frame is stopped.
 */

import { getInstalled, type InstalledPlugin, saveInstalled } from '../client/installed.js';
import { handleCall } from './calls.js';
import type { PluginHost, PluginIdentity, PluginPanel } from './contract.js';
import { pluginDocument, themeCss } from './sandbox.js';

const PING_MS = 5_000;
/** The `source` of a plugin loaded from its author's development server rather than a store. */
export const DEVELOPMENT = 'development:';
/** Calls per second before further calls are refused. */
const CALLS_PER_SECOND = 50;

export interface Running {
  plugin: InstalledPlugin;
  identity: PluginIdentity;
  frame: HTMLIFrameElement;
  port: MessagePort;
  panel: PluginPanel;
  commands: (() => void)[];
  /** Clears the watchdog. */
  cleanup: () => void;
}

export class PluginRuntime {
  private readonly running = new Map<string, Running>();

  constructor(
    private readonly host: PluginHost,
    /** Called when the runtime stops a plugin, so the UI can show the reason. */
    private readonly onStopped: (id: string, reason: string) => void = () => {},
  ) {}

  isRunning(id: string): boolean {
    return this.running.has(id);
  }

  async start(plugin: InstalledPlugin): Promise<void> {
    if (this.running.has(plugin.id) || !plugin.enabled) return;
    const identity = { id: plugin.id, name: plugin.manifest.name };
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('allow', '');
    frame.title = plugin.manifest.name;
    frame.srcdoc = await pluginDocument(
      plugin.manifest,
      plugin.code,
      themeCss(getComputedStyle(document.documentElement)),
    );
    const channel = new MessageChannel();
    const panel = this.host.panel(identity, frame);
    const running: Running = {
      plugin,
      identity,
      frame,
      port: channel.port1,
      panel,
      commands: [],
      cleanup: () => {},
    };
    this.running.set(plugin.id, running);

    let loads = 0;
    frame.addEventListener('load', () => {
      loads += 1;
      // A second load means the frame navigated away from our document and its CSP. Never
      // legitimate.
      if (loads > 1) return this.kill(plugin.id, 'tried to leave its sandbox and was stopped');
      frame.contentWindow?.postMessage('bezier-plugin:init', '*', [channel.port2]);
    });

    let calls = 0;
    let since = Date.now();
    let lastPong = Date.now();
    let ping = 0;
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data as { type?: unknown; id?: unknown; method?: unknown; args?: unknown };
      if (data?.type === 'pong') {
        lastPong = Date.now();
        return;
      }
      if (data?.type !== 'call' || typeof data.id !== 'number' || typeof data.method !== 'string')
        return;
      const now = Date.now();
      if (now - since > 1_000) {
        since = now;
        calls = 0;
      }
      calls += 1;
      const reply = (ok: boolean, value: unknown, error = '') =>
        channel.port1.postMessage({ type: 'result', id: data.id, ok, value, error });
      if (calls > CALLS_PER_SECOND) return reply(false, null, 'Too many calls. Slow down.');
      const args = Array.isArray(data.args) ? data.args : [];
      handleCall(this.host, running, data.method, args).then(
        (value) => reply(true, value),
        (error: unknown) => reply(false, null, error instanceof Error ? error.message : 'Refused.'),
      );
    };
    channel.port1.start();

    const watchdog = setInterval(() => {
      if (Date.now() - lastPong > PING_MS * 2) {
        this.kill(plugin.id, 'stopped responding and was stopped');
        return;
      }
      ping += 1;
      channel.port1.postMessage({ type: 'ping', n: ping });
    }, PING_MS);
    running.cleanup = () => clearInterval(watchdog);
  }

  stop(id: string): void {
    const running = this.running.get(id);
    if (running === undefined) return;
    this.running.delete(id);
    running.cleanup();
    for (const remove of running.commands) remove();
    running.port.close();
    running.panel.dispose();
    running.frame.remove();
  }

  stopAll(): void {
    for (const id of [...this.running.keys()]) this.stop(id);
  }

  /** Re-reads a plugin after its grants or version changed, and runs it again if enabled. */
  async restart(id: string): Promise<void> {
    this.stop(id);
    const plugin = await getInstalled(id);
    if (plugin !== undefined) await this.start(plugin);
  }

  /**
   * Stops a misbehaving plugin and disables it in storage so it does not restart with the next
   * window. Only the user can re-enable it.
   */
  private kill(id: string, reason: string): void {
    const running = this.running.get(id);
    this.stop(id);
    if (running === undefined) return;
    this.host.notify(running.identity, reason);
    // Development plugins are not installed; saving them would install them.
    if (running.plugin.source.startsWith(DEVELOPMENT)) {
      this.onStopped(id, reason);
      return;
    }
    saveInstalled({ ...running.plugin, enabled: false })
      .catch((error: unknown) => console.error('Could not switch off a stopped plugin.', error))
      .finally(() => this.onStopped(id, reason));
  }
}
