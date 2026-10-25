/**
 * Source text of the `bezier` object inside a plugin's frame. A string rather than a module because
 * it is inlined with the plugin code into the frame's single CSP-hashed script. Every method just
 * sends a message to the runtime, which decides.
 */

export const SDK_SOURCE = `"use strict";
(() => {
  let port = null;
  let next = 1;
  const waiting = new Map();
  const queued = [];
  const commands = new Map();

  const send = (message) => (port ? port.postMessage(message) : queued.push(message));

  const call = (method, ...args) =>
    new Promise((resolve, reject) => {
      const id = next++;
      waiting.set(id, { resolve, reject });
      send({ type: "call", id, method, args });
    });

  window.addEventListener("message", (event) => {
    // Only the window that made this frame may hand it the line to the runtime;
    // another plugin's frame can reach this window too, and is ignored.
    if (port !== null || event.source !== window.parent || event.data !== "bezier-plugin:init") return;
    const [received] = event.ports;
    if (!received) return;
    port = received;
    port.onmessage = (message) => {
      const data = message.data;
      if (data.type === "result") {
        const pending = waiting.get(data.id);
        waiting.delete(data.id);
        if (pending) data.ok ? pending.resolve(data.value) : pending.reject(new Error(data.error));
      } else if (data.type === "command") {
        const run = commands.get(data.id);
        if (run) Promise.resolve().then(run).catch((error) => console.error(error));
      } else if (data.type === "ping") {
        port.postMessage({ type: "pong", n: data.n });
      }
    };
    for (const message of queued.splice(0)) port.postMessage(message);
  });

  const bezier = Object.freeze({
    /** The plugin API this window speaks. */
    api: 1,
    model: Object.freeze({ read: () => call("model.read") }),
    project: Object.freeze({
      read: () => call("project.read"),
      create: (project, name) => call("project.create", String(project), String(name)),
    }),
    selection: Object.freeze({ read: () => call("selection.read") }),
    commands: Object.freeze({
      add: (title, run) => {
        const id = "c" + next++;
        commands.set(id, run);
        return call("ui.command", id, String(title));
      },
    }),
    panel: Object.freeze({
      show: (title) => call("ui.panel", true, String(title ?? "")),
      hide: () => call("ui.panel", false, ""),
    }),
    files: Object.freeze({
      save: (name, type, data) => call("files.export", String(name), String(type), data),
      pick: (accept) => call("files.import", String(accept ?? "")),
    }),
    storage: Object.freeze({
      get: (key) => call("storage.get", String(key)),
      set: (key, value) => call("storage.set", String(key), String(value)),
      remove: (key) => call("storage.remove", String(key)),
    }),
    notify: (text) => call("notify", String(text)),
  });
  Object.defineProperty(window, "bezier", { value: bezier, enumerable: true });
})();
`;
