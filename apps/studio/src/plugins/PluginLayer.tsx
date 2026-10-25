/**
 * The editor's side of plugins: the `PluginHost` given to the runtime, and plugin UI. Plugins run
 * in a sandboxed frame and reach the editor only through calls answered here, each checked by the
 * runtime against granted permissions. Renders commands (a rail button with a menu), the plugin
 * panel, and the file read/save prompt.
 */

import './plugins.css';
import { formatRef, type StableRef } from '@bezier/core';
import {
  type Lessons,
  listInstalledPlugins,
  type PluginHost,
  type PluginIdentity,
  PluginRuntime,
  reaches,
  useChannel,
} from '@bezier/lessons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { modelSummary } from '../automation/answers.js';
import { live } from '../automation/live.js';
import type { Said } from '../said.js';
import { useDevPlugin } from './dev-plugin.js';
import { setPluginState } from './plugin-state.js';

interface Command {
  key: number;
  plugin: string;
  title: string;
  run: () => void;
}

interface Ask {
  plugin: string;
  message: string;
  action: string;
  answer: (yes: boolean) => void;
}

export interface PluginLayerProps {
  lessons: Lessons;
  say: (message: string | Said) => void;
  selected: readonly StableRef[];
  /** Opens project text as a new project owned by the user. */
  open: (project: string, name: string) => Promise<void>;
}

export function PluginLayer(props: PluginLayerProps) {
  // Plugins are alpha: below that channel none run or show; installed ones stay installed.
  const alpha = reaches(useChannel(), 'alpha');
  const latest = useRef(props);
  latest.current = props;
  const [commands, setCommands] = useState<Command[]>([]);
  const [menu, setMenu] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const panels = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const counter = useRef(0);

  const host = useMemo<PluginHost>(
    () => ({
      snapshot: () => latest.current.lessons.host.snapshot(),
      model: async () => (live.view === null ? null : modelSummary(false)),
      selection: async () => latest.current.selected.map(formatRef),
      openAsProject: (project, name) => latest.current.open(project, name),
      addCommand: (plugin: PluginIdentity, title, run) => {
        counter.current += 1;
        const key = counter.current;
        setCommands((list) => [...list, { key, plugin: plugin.name, title, run }]);
        return () => setCommands((list) => list.filter((command) => command.key !== key));
      },
      confirm: (plugin, message, action) =>
        new Promise<boolean>((resolve) =>
          setAsk({
            plugin: plugin.name,
            message,
            action,
            answer: (yes) => {
              setAsk(null);
              resolve(yes);
            },
          }),
        ),
      pickFile: (accept) =>
        new Promise<File | null>((resolve) => {
          const input = picker.current;
          if (input === null) return resolve(null);
          input.accept = accept;
          input.value = '';
          input.onchange = () => resolve(input.files?.[0] ?? null);
          // Closing the system's dialog without choosing fires `cancel`, not `change`.
          input.oncancel = () => resolve(null);
          input.click();
        }),
      saveFile: (name, data) => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(data);
        link.download = name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
      },
      notify: (plugin, text) => latest.current.say({ title: plugin.name, detail: text }),
      panel: (plugin, frame) => {
        const box = document.createElement('section');
        box.className = 'plugin-panel';
        box.hidden = true;
        box.setAttribute('aria-label', plugin.name);
        const head = document.createElement('header');
        const title = document.createElement('span');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'plugin-panel__close';
        close.textContent = '×';
        close.setAttribute('aria-label', `Close ${plugin.name}`);
        close.onclick = () => {
          box.hidden = true;
        };
        head.append(title, close);
        box.append(head, frame);
        panels.current?.append(box);
        return {
          show: (text) => {
            title.textContent = text;
            box.hidden = false;
          },
          hide: () => {
            box.hidden = true;
          },
          dispose: () => box.remove(),
        };
      },
    }),
    [],
  );

  useEffect(() => {
    if (!alpha) return;
    const runtime = new PluginRuntime(host, (id, reason) =>
      setPluginState((before) => ({ ...before, stopped: { ...before.stopped, [id]: reason } })),
    );
    setPluginState((before) => ({ ...before, runtime }));
    // Starting takes time and React mounts effects twice in development: a plugin that finishes
    // starting after this runtime was dropped would run beside its second copy.
    let dropped = false;
    listInstalledPlugins()
      .then((installed) => Promise.all(installed.map((plugin) => runtime.start(plugin))))
      .catch((problem: unknown) => console.error('Plugins could not be started.', problem))
      .finally(() => {
        if (dropped) runtime.stopAll();
      });
    return () => {
      dropped = true;
      runtime.stopAll();
      setPluginState((before) => ({ ...before, runtime: null }));
    };
  }, [host, alpha]);

  useDevPlugin(latest.current.say);

  // The menu closes on a press elsewhere, like every other menu.
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || event.target.closest('.plugin-rail') === null)
        setMenu(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  const names = [...new Set(commands.map((command) => command.plugin))];

  return (
    <div className="plugin-layer">
      {commands.length > 0 && (
        <div className="plugin-rail">
          <button
            aria-expanded={menu}
            aria-haspopup="menu"
            aria-label="Plugin commands"
            className="plugin-rail__button"
            onClick={() => setMenu((open) => !open)}
            title="Plugins"
            type="button"
          >
            <PluginIcon />
          </button>
          {menu && (
            <div aria-label="Plugin commands" className="menu plugin-rail__menu" role="menu">
              {names.map((name) => (
                <div key={name}>
                  <p className="plugin-rail__name">{name}</p>
                  {commands
                    .filter((command) => command.plugin === name)
                    .map((command) => (
                      <button
                        className="menu__item"
                        key={command.key}
                        onClick={() => {
                          setMenu(false);
                          command.run();
                        }}
                        role="menuitem"
                        type="button"
                      >
                        {command.title}
                      </button>
                    ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="plugin-panels" ref={panels} />
      {ask !== null && (
        <div aria-label={`${ask.plugin} asks`} className="plugin-ask" role="alertdialog">
          <p className="plugin-ask__who">{ask.plugin}</p>
          <p className="plugin-ask__what">{ask.message}</p>
          <div className="plugin-ask__actions">
            <button onClick={() => ask.answer(false)} type="button">
              Cancel
            </button>
            <button className="plugin-ask__go" onClick={() => ask.answer(true)} type="button">
              {ask.action}
            </button>
          </div>
        </div>
      )}
      <input hidden ref={picker} type="file" />
    </div>
  );
}

/** A puzzle piece: the brand's 16 grid, round caps, 1.9 stroke. */
function PluginIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
      <path
        d="M6.2 2.6a1.5 1.5 0 0 1 3 0V4h2.3A1.5 1.5 0 0 1 13 5.5v2.2h-1.3a1.5 1.5 0 0 0 0 3H13V13a1.5 1.5 0 0 1-1.5 1.5H9.2v-1.3a1.5 1.5 0 0 0-3 0v1.3H4A1.5 1.5 0 0 1 2.5 13V5.5A1.5 1.5 0 0 1 4 4h2.2z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}
