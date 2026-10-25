# The plugin API, version 1

Every call returns a promise. A call needs the permission named beside it; without it the promise
rejects with a sentence saying which. Calls are limited to 50 a second. Types: `bezier.d.ts`.

## `bezier.api`

`1`. The API this Bezier speaks.

## Model · `project:read`

### `bezier.model.read(): Promise<Model | null>`

The open model as data, or `null` when no project is open.

```ts
{
  name: string;
  units: 'mm' | 'cm' | 'in';                 // how lengths are shown; stored in mm
  variables: { name: string; expression: string }[];
  steps: {
    id: string; type: string; name: string;  // type: sketch, extrude, fillet, revolve, hole, …
    state: 'ok' | 'failed' | 'dangling' | 'blocked' | 'suppressed' | 'unknown-type';
    message?: string;                        // why, when it did not build
    expressions?: Record<string, string>;    // parameters written as formulas
  }[];
  bodies: { key: string; label: string; hidden: boolean; faces: number }[];
  bounds: { min: number[]; max: number[]; size: number[] } | null;  // mm, of what is shown
  triangles: number;
  rebuildMs: number;
}
```

### `bezier.project.read(): Promise<string | null>`

The whole project file as text (JSON), with every parameter. Parse it with `JSON.parse`.

## New projects · `project:create`

### `bezier.project.create(project: string, name: string): Promise<void>`

Opens project text as a new project. A plugin never changes an existing project, so it cannot
damage work.

## Selection · `selection:read`

### `bezier.selection.read(): Promise<string[]>`

Stable references of what is selected: `F:extrude-1:side-2` for a face, `E:…` for an edge.

## Commands · `ui:command`

### `bezier.commands.add(title: string, run: () => void | Promise<void>): Promise<null>`

Adds a command under the plugin's name, at most 20, titles up to 60 characters.

## Panel · `ui:panel`

### `bezier.panel.show(title?: string)` · `bezier.panel.hide()`

Shows or hides the plugin's panel. Draw into `document.body`; use the CSS variables for colours.

## Files

### `bezier.files.save(name, type, data): Promise<boolean>` · `files:export`

Offers a file. Bezier asks the user, in its own dialog, naming the plugin and the size. Resolves
`true` when it was saved. `data` is a string, `Uint8Array` or `ArrayBuffer`, up to 100 MB.

### `bezier.files.pick(accept?): Promise<{ name, type, bytes } | null>` · `files:import`

Asks the user for a file. `accept` is like the HTML attribute: `.csv,.json`.

## Storage · `storage`

### `bezier.storage.get(key)` · `set(key, value)` · `remove(key)`

Strings, up to 1 MB in all, on this device, deleted with the plugin.

## Notices · always allowed

### `bezier.notify(text: string): Promise<null>`

One line on screen, under the plugin's name, up to 200 characters.

## Network · `network`

`fetch` to the origins listed in the manifest's `network` (up to 4, https). Every other address
is refused by the browser itself.
