/**
 * Types for the `bezier` object available to a plugin's main.js, API version 1. Place this file
 * next to main.js (`bezier-plugin new` does) for editor completion. Every call is checked against
 * the permissions the user granted; a call without permission rejects with an explanation.
 */

declare namespace Bezier {
  /** One step of the model history, as returned by `model.read()`. */
  interface Step {
    id: string;
    /** extrude, fillet, sketch, revolve, hole, … */
    type: string;
    /** User-given name. */
    name: string;
    /** ok, failed, dangling, blocked, suppressed or unknown-type. */
    state: 'ok' | 'failed' | 'dangling' | 'blocked' | 'suppressed' | 'unknown-type';
    /** Error reason when the step did not build. */
    message?: string;
    /** Parameters given as formulas, by parameter name. */
    expressions?: Record<string, string>;
  }

  interface Model {
    name: string;
    units: 'mm' | 'cm' | 'in';
    variables: { name: string; expression: string }[];
    steps: Step[];
    bodies: { key: string; label: string; hidden: boolean; faces: number }[];
    /** Size of what is shown in millimetres; null when nothing is shown. */
    bounds: { min: number[]; max: number[]; size: number[] } | null;
    triangles: number;
    rebuildMs: number;
  }

  interface PickedFile {
    name: string;
    type: string;
    bytes: Uint8Array;
  }

  interface Api {
    /** Plugin API version of this window. */
    readonly api: 1;
    readonly model: {
      /** The open model as data: steps and state, variables, bodies, size. Needs `project:read`. */
      read(): Promise<Model | null>;
    };
    readonly project: {
      /** The open model as Bezier project text (JSON), or null. Needs `project:read`. */
      read(): Promise<string | null>;
      /**
       * Opens project text as a new project. Never changes an existing one. Needs `project:create`.
       */
      create(project: string, name: string): Promise<void>;
    };
    readonly selection: {
      /**
       * Stable references of what is selected, like `F:extrude-1:side-2`. Needs `selection:read`.
       */
      read(): Promise<string[]>;
    };
    readonly commands: {
      /** Adds a command under the plugin's name; up to 20. Needs `ui:command`. */
      add(title: string, run: () => void | Promise<void>): Promise<null>;
    };
    readonly panel: {
      /** Shows the plugin's panel beside the model; draw into `document.body`. Needs `ui:panel`. */
      show(title?: string): Promise<null>;
      hide(): Promise<null>;
    };
    readonly files: {
      /** Offers a file to save; the user confirms. Resolves true if saved. Needs `files:export`. */
      save(name: string, type: string, data: string | Uint8Array | ArrayBuffer): Promise<boolean>;
      /** Asks the user for a file. Resolves null if none was chosen. Needs `files:import`. */
      pick(accept?: string): Promise<PickedFile | null>;
    };
    readonly storage: {
      /** Plugin storage on this device, up to 1 MB. Needs `storage`. */
      get(key: string): Promise<string | null>;
      set(key: string, value: string): Promise<null>;
      remove(key: string): Promise<null>;
    };
    /** Shows a status line under the plugin's name. Always allowed. */
    notify(text: string): Promise<null>;
  }
}

declare const bezier: Bezier.Api;
