import { define } from '../define.js';

export const LEARN = [
  define({
    id: 'learn',
    title: 'Learn: lessons you can watch and follow',
    area: 'Learn and Community',
    summary:
      'The Learn page keeps your lessons, filters them by level and picks up where you left off.',
    keywords:
      'learn lessons tutorial course video beginner intermediate advanced level import export bezierlesson continue progress completed training',
    body: `A lesson is a recording of someone building a part in Bezier, with the model saved at each step. You can watch it, or follow along in the editor.

## Open Learn

Open the start page with the house button and choose **Learn** in the sidebar.

![](image:page)

## The page

- **Level**: a switch with **All**, **Beginner**, **Intermediate** and **Advanced**. It appears once you have a lesson. While it or the search is narrowing the list, the count reads, for example, "1 of 3 lessons" and the Continue card is left out.
- **Import…** and **Record**: bring in a lesson file, or [make a lesson](doc:learn-record).
- **Continue**: if you left a lesson part-way, a wide card at the top offers to pick up where you stopped, with its chapter and time.
- **The cards**: a picture of each lesson, its length, level and number of chapters. A check mark means you finished it. A thin line under the picture shows how far you got.

The search field of the start page filters the lessons by their words. If none fit, the page says "No lessons match."

## Open a lesson

Click a card to [watch it](doc:learn-player). Hover over a card to see a short silent preview. The **⋯** button, or a right-click, offers:

- **Play**
- **Follow Along in the Editor**: see [follow a lesson](doc:learn-follow)
- **Export…**: saves the lesson as a **.bezierlesson** file to share
- **Delete…**: asks first

## Get a lesson

- Drop a **.bezierlesson** file anywhere on the page, or press **Import…**. You can choose several files at once. One file opens in the player when it is in; several are added and the page says so.
- On the alpha channel, download one from [Community](doc:community). It appears here.
- Record your own.

With no lessons the page says "No lessons yet" and offers **Import a lesson…** and **Record one**.

If a file cannot be read, a notice says which file it was. Nothing is added.

To watch or follow a lesson next, see [watch a lesson](doc:learn-player) and [follow a lesson](doc:learn-follow).

## Your lesson projects

When you follow a lesson and build the model yourself, the model is kept under **Your Lesson Projects**, below the lessons. They open like projects, with the lesson beside them. They are not in the list of [projects](doc:projects).`,
    shots: {
      page: 'The Learn page with its level switch, the Import and Record buttons and a lesson card',
    },
    places: ['learn', 'lesson-projects'],
  }),
  define({
    id: 'learn-player',
    title: 'Watch a lesson',
    area: 'Learn and Community',
    summary: 'Play, scrub, jump between chapters, change speed and use the keyboard.',
    keywords:
      'lesson player watch play pause chapters speed repeat fullscreen keyboard shortcuts completed mark progress',
    body: `Click a lesson card to open its player.

![](image:player)

## The player

- The recording of the editor fills the stage. Double-click it for full screen.
- The **chapters** are listed beside it. Click one to jump to it.
- Under the video: **Play**, **Previous chapter**, **Next chapter**, the time, **Playback speed**, **Mute** and **Full screen**. The **Repeat this chapter** and **Keyboard shortcuts** buttons are here too.
- Parts the author cut out are skipped.

Along the top: **Follow along**, **Edit Lesson**, and a **More** menu with **Mark as completed**, **Export…** and **Delete…**. A lesson is marked completed when it plays to the end. Where you stopped is remembered, and Learn offers it under Continue.

## Keys

| Key | Does |
| --- | --- |
| **Space**, **K** | Play or pause |
| **J**, **L** | Back or forward 10 seconds |
| **←**, **→** | Back or forward 5 seconds |
| **↑**, **↓** or **P**, **N** | Previous or next chapter |
| **0** to **9** | Jump to a tenth of the lesson |
| **Home**, **End** | Start or end |
| **R** | Repeat this chapter |
| **M** | Mute |
| **F** | Full screen |
| **?** | Show the list of keys |`,
    shots: { player: 'The lesson player with its chapters and controls' },
    places: ['lesson-player'],
  }),
  define({
    id: 'learn-follow',
    title: 'Follow a lesson in the editor',
    area: 'Learn and Community',
    summary: 'Keep the lesson in a small window over the editor while the model follows the video.',
    keywords:
      'follow along lesson pip picture in picture checkpoint model follows video leave resize fold lesson project save',
    body: `1. Open a lesson and press **Follow along**, or choose **Follow Along in the Editor** in a card's menu.
2. The editor opens with the lesson in a small window over it. The model shows the lesson's checkpoint for the part of the video that is playing.
3. Play the lesson, and build the same thing yourself. To go back over a step, press the previous chapter button. While **The model follows the video** is ticked, the model goes back with it.

![](image:panel)

## The window

- Drag its header to move it. It sticks to the edges. With the grip focused, the arrow keys move it.
- Drag a corner to resize it, or scroll over the video to make it larger or smaller.
- **Make the video larger** gives the video the room, and **Make the editor larger** gives it back. **V** does the same.
- While the window is open, **Space** or **K** plays and pauses, **←** and **→** move 5 seconds, and **↑** and **↓** change chapter. Keys are ignored while you type in a field.
- **Fold the lesson away** keeps only a play button and the chapter name. **Show the lesson** opens it again.
- **Leave** ends it and pauses the video.

If the lesson was recorded with the author's camera, there is a second picture of them. Press its edge to swap which is larger.

## The model and you

**The model follows the video** is ticked at the start. As soon as you make a change of your own, it unticks, so the lesson stops replacing your work. Tick it again to see the lesson's checkpoint.

What you build is saved as a lesson project. Find it on [Learn](doc:learn), under Your Lesson Projects. Its menu has **Save as Project** to put a copy among your normal [projects](doc:projects).`,
    shots: { panel: 'A lesson in a small window over the editor' },
    places: ['follow-along'],
  }),
  define({
    id: 'learn-record',
    title: 'Record and edit a lesson',
    area: 'Learn and Community',
    summary: 'Record the editor, add checkpoints, then cut, name chapters and export.',
    keywords:
      'record lesson recording author create tutorial microphone camera checkpoint chapters trim cut zoom edit export share',
    body: `## Record

1. On [Learn](doc:learn), press **Record**.
2. Give it a **Title**, choose a **Level**, and tick **Microphone** or **Your camera, in a corner** if you want them.
3. If a project is open, choose to record in **An empty model** or **The open project**.
4. Press **Start recording**. The editor opens.

![](image:sheet)

A bar shows the time. **Pause** and **Resume** stop it for a while. **Checkpoint** keeps the model as it is, as a chapter. **Finish** ends the recording. Paused, **Discard…** throws it away.

The recording takes the editor's view, your keys and clicks, and a checkpoint of the model after every change.

> Recording needs a browser that can record the view. If this one cannot, the sheet says so. If the app reloads in the middle, Learn offers to keep or discard what was saved.

## Edit

When you finish, the edit view opens.

- Under the picture is a timeline of clips, chapters and zooms. Space plays it.
- **I** and **O** set an in and an out point. **Cut between** hides that stretch from learners. The recording keeps it, and **Restore** brings it back.
- **C** splits a clip at the playhead. **M** adds a chapter there, and you can name each chapter in the list.
- **Zoom in between** (**Z**) zooms the recording for that stretch.
- **About this lesson** holds the title, description and level.
- If you recorded your camera, choose its corner from the playhead on.
- **Undo** and **Redo** work on these edits, and they are saved as you go.

Press **Export…** to save a **.bezierlesson** file, and **Done** to go back to the player.`,
    shots: { sheet: 'The Record sheet with title, level and options' },
    places: ['lesson-record', 'lesson-edit'],
  }),
] as const;
