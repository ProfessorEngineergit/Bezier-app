# Operating Bezier by looking at the screen

For an assistant that drives Bezier with screenshots, a pointer and a keyboard, and has this MCP
server beside it. The server does not click for you. It tells you what is on screen, what the
model is, and whether what you just did worked.

## The loop that works

1. **Read before you act.** `docs_search` for the task, then `docs_read` the article. Articles
   name every control the way the screen does, and give the key for the user's keymap.
2. **Locate, do not guess.** `ui_map` lists every control with its name, its rectangle in CSS
   pixels and the window's device pixel ratio. Multiply by the ratio for screen pixels. Click the
   middle of the rectangle.
3. **Prefer the keyboard.** Every tool has a key (`keymap`). A key press cannot miss.
4. **Type numbers, do not drag them.** Every gizmo has a field. Type the value, press Enter.
5. **Check with the model, not the picture.** After each step call `project_read`: the new step
   is in the history with state `ok`, or it says why it failed. A screenshot shows that something
   happened; the history says what.
6. **Look when it matters.** `viewport_screenshot` with a named view (`front`, `top`, `iso`…)
   gives the model alone, the same every time, whatever dialog is open.

## The screen

- **Top bar:** the house (back to projects), the workspace button (Modeling, Simulation,
  Visualize, Drawings), the project name (click to rename), Export on the right.
- **Left rail:** Sketch, Insert, Transform, Tools. A category opens a second column of commands.
- **Orientation cube:** top right. Click a side to look from there.
- **Right rail, bottom:** View, Display, Units & Grid.
- **Items:** the layer button at the top left. The history, oldest first; click a row to edit it.
- **Status line:** at the bottom, "Selecting Faces · Tab to change": what a click will pick.

## Things that trip agents

- **Orbit is a drag with the right button** in the default keymap, pan is the middle button or
  Shift and right-drag. Agents break held drags. Use the named views instead: the keys in
  `keymap` under View, or the cube, or `viewport_screenshot` with `view`.
- **Escape backs out of anything.** If you are not sure what mode you are in, call `app_status`
  (it says the workspace, whether a sketch is open and what is selected) before pressing more.
- **Nothing needs saving.** Every change is on disk before it is applied. Do not look for Save.
- **A sketch needs to be finished** (Enter) before an area can be extruded.
- **The selection filter decides what a click picks.** Small faces are easier with the filter on
  Faces; it changes with Tab in the default keymap.
- **Do not repeat a click that did nothing.** Read `app_status` and `ui_map` again instead: a
  dialog may be open, or the control may be disabled (`ui_map` says so).

## What you may change through the server

- **Settings**, with `settings_write`. The person sees every change in Bezier and can put it back.
- **Nothing in the model.** The model is changed the way a person changes it, on screen, so every
  step is in the history and can be undone. This is deliberate.

## Performance

`performance_read` measures the frame rate for a moment and lists where recent edits spent their
time (journal, rebuild, display). If the view stutters, try `settings_write` with
`{"detail": "light"}` or `{"quality": "low"}`, measure again, and tell the user what changed.
