/**
 * The host interface the editor implements for plugins. Only the runtime (bridge.ts) calls it,
 * after checking the plugin's permission; plugins never see it.
 */

export interface PluginIdentity {
  id: string;
  name: string;
}

export interface PluginPanel {
  show(title: string): void;
  hide(): void;
  dispose(): void;
}

export interface PluginHost {
  /** The open model as Bezier project text; null when no project is open. */
  snapshot(): Promise<string | null>;
  /**
   * The open model as structured data (steps with state, variables, bodies, size). Null when no
   * project is open.
   */
  model(): Promise<unknown>;
  /** Ids of what is selected in the open model. */
  selection(): Promise<string[]>;
  /** Opens `project` as a new user project. Never replaces an existing one. */
  openAsProject(project: string, name: string): Promise<void>;
  /** Adds a command under the plugin's name. Returns a function that removes it. */
  addCommand(plugin: PluginIdentity, title: string, run: () => void): () => void;
  /**
   * Asks the user in the host's own UI, which plugins cannot draw, so file access stays the user's
   * decision. Resolves with the answer.
   */
  confirm(plugin: PluginIdentity, message: string, action: string): Promise<boolean>;
  /** Called right after a confirmation, while the user's click still counts as activation. */
  pickFile(accept: string): Promise<File | null>;
  saveFile(name: string, data: Blob): void;
  /** A one-line notice, labelled with the plugin's name by the host. */
  notify(plugin: PluginIdentity, text: string): void;
  /** Mounts the plugin's frame in the panel area, hidden until the plugin shows it. */
  panel(plugin: PluginIdentity, frame: HTMLIFrameElement): PluginPanel;
}
