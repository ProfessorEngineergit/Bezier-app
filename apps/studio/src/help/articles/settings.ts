import { define } from '../define.js';

export const SETTINGS = [
  define({
    id: 'open-settings',
    title: 'Open Settings',
    area: 'Settings',
    summary: 'How to reach Settings, and what each of its pages is for.',
    keywords:
      'settings preferences options configuration open gear cog menu pages sections search find setting where is preferences dialog customise customize',
    body: `Settings lives on the start page, at the foot of the sidebar. It is a place you visit, not one you work in.

![](image:sidebar)

## Open it

- From the start page, click **Settings** at the bottom of the sidebar.
- From the editor, press {{key:settings}}. Settings opens over the start page.
- Press the same key again, or Escape, to close it. If you came from the editor, you go back to the editor.

## Find a setting by name

Click the **Search** field of the start page, or press **/**, and type a word: \`theme\`, \`trackpad\`, \`shortcut\`. The settings that hold it are listed under your projects. Click one to open its page.

![](image:search)

Type \`settings:\` first to look only through the settings, for example \`settings: theme\`. Inside Settings, the list on the left then shows only the pages that match.

Changes apply as you make them. There is no Save button. They are kept on this device, in this browser. If the browser blocks its storage, as a private window may, the changes hold until you close the page.

## The pages

![](image:pages)

The pages are listed in groups on the left.

- **Bezier.** [General](doc:settings-general): the workspace projects open in and a few interface switches. [Appearance](doc:settings-appearance): theme, contrast, glass, density, size and motion. [Nib](doc:settings-nib): the robot at the top of the window, and his lessons.
- **Workspace.** Interaction: mouse and trackpad, see [orbit, pan and zoom](doc:navigate). [Viewport](doc:settings-viewport): how finely curves are drawn, and how the view behaves while it moves. [Shortcuts](doc:settings-shortcuts): the key for every command.
- **Sharing.** Collaboration and Community, on the alpha channel only. See [collaboration](doc:collaboration) and [community](doc:community).
- **System.** [Updates](doc:settings-updates): the installed version, and the channel: stable, beta or alpha. [MCP & Automation](doc:settings-mcp): let an assistant such as Claude connect, and see what it did. [Data & Privacy](doc:settings-data): what is stored, and a reset for the settings.
- **Make it better.** [Contribute](doc:settings-contribute): report a problem, suggest something, or read the code.

## Which page for what

| You want to | Go to |
| --- | --- |
| A darker or lighter interface, larger text, calmer animation | [Appearance](doc:settings-appearance) |
| Curves that look faceted, or a large model that turns roughly | [Viewport](doc:settings-viewport) |
| The keys of another CAD program, or a different key for one command | [Shortcuts](doc:settings-shortcuts) |
| The mouse and trackpad to move the camera the way you are used to | [Orbit, pan and zoom](doc:navigate) |
| A frame-rate readout in the top bar | [General](doc:settings-general) |
| Every setting back to how it came | [Data & Privacy](doc:settings-data) |`,
    shots: {
      sidebar: 'The start page with Settings at the foot of the sidebar',
      search: 'The word theme typed in the search field, with the Appearance page offered under it',
      pages: 'Settings with its list of pages on the left',
    },
    actions: ['settings'],
    places: ['settings'],
  }),
  define({
    id: 'settings-general',
    title: 'Settings: General',
    area: 'Settings',
    summary:
      'Choose the workspace new projects open in, and switch a few interface extras on or off.',
    keywords:
      'general startup workspace default modeling visualize drawings performance graph fps frame rate frame time lag slow labels tool labels rail names history references',
    body: `Settings, General has three groups. Open it from [Settings](doc:open-settings).

![](image:page)

## Startup

**Open new projects in** chooses the workspace a project opens in: Modeling, Visualize or Drawings. Modeling is the default. It is used the next time a project opens. You can change workspace at any time, see [workspaces](doc:workspaces).

## Interface

![](image:interface)

- **Show performance graph** puts a small live readout in the top bar. Off by default. A right click anywhere on the top bar of the editor switches it on or off as well. It shows one timing at a time: frame time, frame cadence or main-thread delay, with a trace of the last seconds. Scroll over it, press an arrow key or click it to turn to the next. Use it when a large model feels slow, and for nothing else.
- **Show tool labels** keeps the names beside the rail buttons. On by default. Switch it off for a narrower rail. The names are also left out while a tool column is open beside the left rail.

![](image:graph)

> To put every setting back, see [Data & Privacy](doc:settings-data). For how the view draws a large model, see [Viewport](doc:settings-viewport).`,
    shots: {
      page: 'Settings, General',
      interface: 'The Startup and Interface groups, with the performance graph switch',
      graph: 'The performance graph in the top bar of the editor, beside the workspace menu',
    },
    settings: ['general'],
  }),
  define({
    id: 'settings-appearance',
    title: 'Settings: Appearance',
    area: 'Settings',
    summary: 'Set the theme, contrast, glass effect, panel density, interface size and motion.',
    keywords:
      'appearance theme dark light system mode contrast glass blur transparency density compact size scale font text zoom motion animation reduced accessibility',
    body: `Settings, Appearance changes how the interface looks. It does not change the model.

![](image:page)

## Color

- **Theme**: System, Light or Dark. System follows your computer.
- **Contrast**: Standard or High. High makes text and the lines between panels brighter.
- **Selection**: the one colour for everything you pick: faces, edges, bodies and sketch lines, in Modeling and Visualize, and the marks around them such as the move handle.

## Materials

![](image:materials)

- **Glass**: Full, Reduced or Solid. The panels are frosted glass over the model. Reduced blurs less and is more opaque. Solid has no blur at all, which is the lightest on a slow computer.
- **Panel density**: Comfortable or Compact. Compact makes the spacing smaller and the rail buttons shorter, so more fits on a small screen.
- **Interface size**: 90%, 100% or 110%. This sets the size of the text in the interface.

## Motion

**Interface motion**: System, Reduced or Full. System follows the reduced-motion setting of your computer. Reduced shortens animations and transitions to nothing. Full keeps them even if your computer asks for less.

Every choice applies at once and is kept. To undo all of them, see [Data & Privacy](doc:settings-data).

> A slow computer gains most from **Solid** glass and, in [Viewport](doc:settings-viewport), **Performance** surface quality.`,
    shots: {
      page: 'Settings, Appearance',
      materials: 'The Materials group, with Glass, Panel density and Interface size',
    },
    settings: ['appearance'],
  }),
  define({
    id: 'settings-nib',
    title: 'Settings: Nib',
    area: 'Settings',
    summary:
      'How much Nib says, what he may bring up by himself, his name and colours, and every lesson to start again.',
    keywords:
      'nib robot helper assistant lesson lessons tutorial tour again restart help first time tips work progress slow struggling sweat lighter display name colour color eyes shell off quiet chatty',
    body: `Nib is the robot at the top of the window. He is not there while nothing is going on. He comes out of the top edge as a slim line when something is under way or waiting, and opens into a card when there is something to read or answer.

## Presence

- **Quiet** (the default): only when needed. Work that takes longer than a moment, lessons, the first time you open a workspace, and when something went wrong.
- **Chatty**: also a word on your firsts (your first part, your first drawing) and a sleepy face after a long break.
- **Off**: he is not loaded at all.

## What he brings up by himself

Each of these can be switched off on its own:

- **Work under way**: opening a project, an import, an export or a long rebuild, with how far along. A click on the line lists everything that is running.
- **When the machine struggles**: if the view stays slow for several seconds he sweats and offers a **Lighter display**, which draws curves with fewer facets and the panels without blur (Solid glass). The model itself is not changed. **Not now** keeps him quiet about it for twenty minutes.
- **First-time help**: the lesson for a workspace, offered once, the first time you open it.
- **A word on your firsts**: Chatty only.

## Look

His **name**, the colour of his **eyes** and of his **shell**. The head beside the fields shows the result at once.

## Lessons

Every lesson, with how long it takes, marked when you have done it. **Start** begins it now; the first lesson opens a new project for it.

A lesson is never lost to a click elsewhere. **Esc** or the arrow at its top folds it into the line at the top of the window, which says which step you are on; a click opens it again. Only its **×** ends it. **First-time help, Reset** offers each workspace's lesson again the next time you open it.`,
    settings: ['nib'],
  }),
  define({
    id: 'settings-viewport',
    title: 'Settings: Viewport',
    area: 'Settings',
    summary: 'Choose how finely curves are drawn, and how sharp the view stays while you move it.',
    keywords:
      'viewport quality tessellation resolution smooth smoothness curves facets performance speed fps precision balanced sharp lag slow large model',
    body: `Settings, Viewport is about how the model is drawn on screen.

![](image:page)

## Surface quality

Three choices, each with the display tolerance it gives:

- **Performance**: fast redraw, 0.25 mm.
- **Balanced**: 0.05 mm. This is the default.
- **Precision**: 0.012 mm, for presentation work.

This changes how finely curves are drawn on screen. The saved geometry and its dimensions stay exact, and so do exports. The change applies to the project that is open, which is rebuilt to draw it.

## While moving the view

![](image:slider)

This slider runs from Sharper to Smoother, in steps named Always sharp, Sharp, Balanced, Smooth and Smoothest. The default is Balanced.

A large model turns smoothly at a lower resolution, and is sharp again the moment it stops. Toward Sharper the view keeps more of its detail and may turn less smoothly. Always sharp never lowers the resolution.

The same slider is in the View panel, see [display modes](doc:display-modes). There, **Detail while modelling** is also offered: Automatic draws curves coarser on a model of more than 20,000 faces, and exports always stay full.

> If the model looks faceted, raise **Surface quality**. If it stutters while you turn it, lower it or move the slider toward Smoother.`,
    shots: {
      page: 'Settings, Viewport',
      slider: 'The slider for how the view behaves while it moves',
    },
    settings: ['viewport'],
  }),
  define({
    id: 'settings-shortcuts',
    title: 'Settings: Shortcuts',
    area: 'Settings',
    summary: 'See the key for every command, take the keys of another program, and rebind any one.',
    keywords:
      'shortcuts keyboard keys hotkeys keybindings rebind remap change key conflict reset clear preset fusion solidworks blender freecad autocad onshape inventor sketchup nx',
    body: `Settings, Shortcuts lists every command that has a key, in groups: Sketch, Constraints, Modeling, View, Edit, Selection and App. Each row shows the key it uses now.

![](image:page)

## Start from another program

1. Under Shortcut preset, open **Keys like**.
2. Choose Native, Fusion 360, SolidWorks, Onshape, Inventor, FreeCAD, Siemens NX, Blender, SketchUp or AutoCAD.

Native is the default. Choosing a preset throws away any keys you changed. Some commands have no key in some presets, and their row says None.

## Change one key

1. Click the key button in the row of the command.
2. The button says Press keys… Press the new key, with Shift, Alt or Cmd (Ctrl on Windows and Linux) if you want them.
3. The row now says Changed.

![](image:recording)

Escape cancels without changing anything. Pressing only a modifier does nothing, the recording waits for a real key.

## Remove a key

Click **Clear** in the row. The command then has no key and the row says None. You can still reach the command from the rails.

## Two commands on one key

Nothing stops you giving a key to a second command. Both rows then say "Shares its key with another action". When you press the key, the command that comes first in the list and applies at that moment runs, so the other one rarely runs from the keyboard. Give one of them another key.

![](image:conflict)

The presets themselves never share a key.

## Put keys back

![](image:reset)

- **Reset**, beside a changed key, puts that one command back to the preset's key.
- **Reset All Key Bindings** appears once something is changed. It says how many keys are changed and undoes all of them.

## Always

At the bottom, a list of keys that cannot be changed, such as Enter to finish a sketch, Escape to back out and Alt+Cmd (Ctrl on Windows and Linux) with 1 to 4 to switch workspace.

> While Settings is open, only the Settings key works. Close it to use the rest. Keys are ignored while a text field has focus.`,
    shots: {
      page: 'Settings, Shortcuts',
      recording: 'A key button waiting for the new key',
      conflict: 'Two commands on the same key, both rows saying so',
      reset: 'The row that resets every changed key',
    },
    settings: ['shortcuts'],
  }),
  define({
    id: 'settings-updates',
    title: 'Settings: Updates and the channels',
    area: 'Settings',
    summary:
      'See which version of Bezier you have, choose between the stable, beta and alpha channels, and enter an invitation code for alpha.',
    keywords:
      'updates update version release channel stable beta alpha invitation invite code unlock upgrade install new version switch',
    body: `Settings, Updates shows the **Installed version**, and the **Channel** you follow.

![](image:page)

## Stable, beta and alpha

- **Stable** is what is finished. It is where Bezier starts.
- **Beta** is for what is new and still being proved, before it is stable. Nothing is held back in it yet.
- **Alpha** is for what has not been used outside the lab, and everything in it reaches a server: Community (lessons, plugins and the leaderboard of a store), plugins in the editor, writing in the wiki, collaboration, and a server of your own. Each carries an **Alpha** mark, and the sidebar says Alpha under the logo.

Each channel includes the ones before it. The switch works at once. Nothing is closed or reloaded: the parts that belong to a channel appear in the sidebar and in Settings, or go. What you set up on alpha, a store's address, an account on a server, installed plugins, is kept for the next time.

## The invitation code

Alpha is by invitation. Choose **Alpha**, paste the code you were sent (it starts with BZ-) and press **Unlock**. The code is checked on this device and nothing is sent anywhere. The row then shows when the invitation ends, and **Remove invitation** takes it away again.

A code that has run out or was withdrawn stops opening alpha, and the app comes back up on beta.

Bezier does not update itself yet. New versions come from the website.

When you report a problem, the version is filled in for you, see [Contribute](doc:settings-contribute).`,
    shots: { page: 'Settings, Updates, with the channel' },
    settings: ['updates'],
  }),
  define({
    id: 'settings-mcp',
    title: 'Settings: MCP & Automation',
    area: 'Settings',
    summary:
      'Let an assistant such as Claude read this window and change how it looks, with every change listed and put back with one click.',
    keywords:
      'mcp model context protocol server automation api agent assistant ai claude tools connect client permissions script pairing code',
    body: `Settings, MCP & Automation is where an assistant such as Claude may connect to Bezier. MCP is a standard way for an assistant program to read and change something in another program.

![](image:page)

## It starts off

**Let assistants connect** is off. While it is, nothing outside Bezier can reach this window.

## Connecting

Bezier's MCP server runs on your own computer, started by the assistant's program, and prints a pairing code. Turn **Let assistants connect** on, enter the server's address and the code, and press **Connect**. The row under the switch says what is happening: connecting, connected, or why not. Bezier remembers the pair and connects whenever both are open. How to start the server, and the tools it offers: the \`docs/mcp\` folder of the repository.

## What an assistant can do

- **Read.** The model and its history, the selection, pictures of the model, the controls on screen, the settings and how fast Bezier is running.
- **Change settings.** How Bezier looks and draws: theme, size, density, glass, contrast, motion, labels, curve detail and a few more. Never where data goes, the update channel, your keys or the mouse.
- **Never**, through this connection: your files, other projects or the network.

It works the way you do, on screen, so every step it takes is in the history and can be undone.

## What it did

A change to a setting is said on screen and listed here under **Changed by an assistant**, each with **Put back**. Under **Activity** are the last things it asked this window, with how long each took.`,
    shots: { page: 'Settings, MCP & Automation' },
    settings: ['mcp'],
  }),
  define({
    id: 'settings-data',
    title: 'Settings: Data & Privacy',
    area: 'Settings',
    summary:
      'See where your projects are kept and how much room they take, and put the settings back.',
    keywords:
      'data privacy storage local telemetry tracking cloud sync reset defaults restore settings clear disk space',
    body: `Settings, Data & Privacy says where your work is and lets you reset the settings.

![](image:page)

## Local-first storage

Projects stay in this app's private storage on this device. Nothing is sent anywhere.

- **Telemetry** says None. Bezier does not measure what you do.
- **Storage used** is how much of the browser's storage for Bezier is in use, as the browser reports it. It reads Unavailable if the browser will not say.
- **Cloud sync** says In development. It is not built. To share a project with other people, see [collaboration](doc:collaboration).

## Reset settings

**Restore Bezier defaults** puts every setting back: theme, shortcuts, mouse bindings and the rest. Your projects and modeling data are kept.

1. Click **Reset settings**.
2. Two buttons replace it. Click **Reset all settings** to go ahead, or **Cancel**.
3. The row says Settings reset for a moment.

![](image:reset)

The reset covers the mouse and key bindings as well as the look of the interface.`,
    shots: {
      page: 'Settings, Data & Privacy',
      reset: 'The reset row asking to confirm',
    },
    settings: ['data'],
  }),
  define({
    id: 'settings-contribute',
    title: 'Settings: Contribute',
    area: 'Settings',
    summary: 'Report a problem, suggest an idea, or find the code from inside the app.',
    keywords:
      'contribute github issue bug report idea feedback feature request code source help broken missing repository pull request',
    body: `Bezier is not finished, and Settings, Contribute is the shortest way to say what is in your way.

![](image:page)

## Four buttons

![](image:actions)

Each opens GitHub in your browser.

- **Something broke** starts a bug report with sections for what happened, what you expected and the steps. The Bezier version and your system (macOS, Windows or Linux) are filled in.
- **I have an idea** starts a note about what you would like and why, with the same two details.
- **A good first fix** lists small, described problems that are waiting for someone.
- **Read the code** opens the map of the repository.

You need a GitHub account to send a report. Nothing is sent until you submit it there.

## Where it is made

The list below the buttons says which folder of the repository holds which part: the start page and Settings, sketching and the tools, the viewport, the model itself, the geometry engine and Learn. Each row opens that folder on GitHub.`,
    shots: {
      page: 'Settings, Contribute',
      actions: 'The buttons that start a report, an idea, or a look at the code',
    },
    settings: ['contribute'],
  }),
];
