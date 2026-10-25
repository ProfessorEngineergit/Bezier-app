# Bezier and assistants: the MCP server

Bezier's MCP server lets an assistant such as Claude work in Bezier well. It is built on one
observation: an assistant that changes a CAD model through a script is fast and blind, and one
that drives the screen sees everything but loses its way. So the server does not edit the model.
It gives an assistant that operates Bezier by sight what it lacks: the docs, written for it; a map
of every control; the model as data to check each step against; pictures of the model alone; the
settings; and the performance.

[`tools.md`](tools.md) lists every tool. [`server.md`](server.md) is the same server on a machine
of your own.

## Set it up

Node 22.18 or later, and a clone of Bezier (the server will be published as a package).

**Claude Code**

```bash
claude mcp add bezier -- node /path/to/bezier/apps/mcp-server/server/main.ts
```

**Claude Desktop and other clients** (their MCP settings file)

```json
{ "mcpServers": { "bezier": { "command": "node", "args": ["/path/to/bezier/apps/mcp-server/server/main.ts"] } } }
```

**Then in Bezier:** Settings → MCP & Automation → *Let assistants connect*, and enter the pairing
code. The server prints it when it starts; ask the assistant ("connect to Bezier") and it tells
you, from `app_connect`. Bezier remembers it and connects whenever both are open.

## How an assistant works with it

1. `computer_use_guide` once: the screen, the traps, the loop.
2. `docs_search` and `docs_read` before each task. Every article names the controls as the screen
   does, gives the key in the user's keymap (ten presets), and its pictures come with where
   their arrows point.
3. `ui_map` to find a control by name: its rectangle, whether it is pressed or disabled, its key.
   Models find a control by name far better than they estimate where it is in a screenshot.
4. Act on screen: keys first, typed values instead of drags.
5. `project_read` after every step: is the new step in the history, and is it `ok`? A picture shows
   that something happened; the history says what.
6. `viewport_screenshot` with a named view to look at the result, the same way every time, even
   while a dialog is open.

The prompt `operate-bezier` gives an assistant this loop in one go.

## What it is for, besides operating the app

- **Settings.** "Make it dark and draw less finely while I work on the assembly":
  `settings_write {"theme": "dark", "detail": "light"}`. Each change is said on screen and listed in
  Settings with *Put back*.
- **Performance.** "Why is it slow?": `performance_read` measures the frame rate and lists where
  recent edits spent their time (journal, rebuild, display), the triangles drawn, memory and the
  graphics card. Change a setting, measure again, compare.
- **Reading a model.** "Which steps fail and why?", "How big is it?", "What are the variables?"

## What it cannot do, on purpose

- Change the model. That happens on screen, through the same tools a person uses, so every step is
  in the history and undoes like any other. Other CAD servers expose one "run this script" tool;
  it bypasses the history and was the way in for the published vulnerabilities in them.
- Open files, reach other projects, the network or anything outside the window's state.
- Change where data goes: the update channel, Collaboration, Community and the keymap are not
  writable.

## How it is kept safe

- **The window dials out; nothing dials in.** Bezier opens the line to the server only when the
  person switched it on and typed the code. A web page that finds the server's port gets nothing
  without the code, and the server refuses browser pages from other origins.
- **A fixed list.** The server can ask the window for eight things by name. The window answers
  from the same list and refuses anything else.
- **Visible.** Every request is listed in Settings → MCP & Automation, with its time.
- **Loopback.** Plain HTTP only to 127.0.0.1. A server elsewhere must be https and needs a token.

## Why MCP and computer use together

| | Script-based CAD servers | Computer use alone | Bezier |
| --- | --- | --- | --- |
| Edits land in the history and undo | rarely | yes | yes |
| Knows how to operate the app | API docs only | no | the app's own docs, keys per keymap |
| Finds controls | — | estimates pixels | names and rectangles from `ui_map` |
| Checks its work | screenshots | screenshots | the history as data, plus pictures |
| Pictures while a dialog is open | often not | yes | yes |
| Arbitrary code in the app | yes | no | no |
| Settings and performance | no | by clicking | tools |
