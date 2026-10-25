# Tools, resources and prompt

All read-only except `settings_write`. Tools are listed in the same order every time, so a
client's prompt cache holds.

## Without a window

| Tool | Gives |
| --- | --- |
| `docs_search {query, limit?}` | Articles that match, best first |
| `docs_read {id, pictures?}` | One article: steps, keys for the user's keymap, pictures with where their arrows point |
| `keymap {preset?}` | Every action and its key; the connected window's keymap by default |
| `computer_use_guide` | How to operate Bezier by sight with this server |
| `app_connect` | Whether a window is connected, else the pairing code for the user |

## With a Bezier window

| Tool | Gives |
| --- | --- |
| `app_status` | Workspace, open project, whether a sketch is open, selection count, open dialog, window size, keymap, undo/redo |
| `project_read {detail?}` | Every step with its state and why it failed, expressions, variables, bodies, bounds in mm, triangles, rebuild time, recent edits; `full` adds parameters |
| `selection_read` | Selected stable references and the bodies they are on |
| `viewport_screenshot {view?, scale?}` | PNG of the model alone; `front`, `back`, `top`, `bottom`, `left`, `right`, `iso` or `current` |
| `ui_map {filter?}` | Every visible control: role, name, rectangle (CSS px), region, key, value, pressed/expanded/disabled; the window's size, pixel ratio and place on screen |
| `settings_read` | Every setting and the values it takes |
| `settings_write {changes}` | Changes settings; refused for anything not listed as writable |
| `performance_read {sampleMs?}` | Frame rate and times, timed work by kind, model size, drawing settings, cores, memory, GPU |

Writable settings: `theme`, `interfaceScale`, `density`, `glass`, `contrast`, `motion`,
`showLabels`, `showPerformance`, `quality`, `detail`, `smoothness`, `startupWorkspace`,
`showHistory`, `showReferences`.

## Resources

`bezier://guide/computer-use` and `bezier://docs/<article>` for each article, as Markdown.

## Prompt

`operate-bezier`: the working loop above, for a client that offers prompts.

## Protocol

MCP 2026-07-28 (stateless: `server/discover`, the version in each request's `_meta`), and
2025-11-25, 2025-06-18 and 2025-03-26 through `initialize`. stdio, or Streamable HTTP with
`--http`.
