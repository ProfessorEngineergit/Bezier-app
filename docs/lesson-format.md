# Lesson format, version 1

A compatibility promise. The editor has written lessons in this format since 2026; they sit in
people's browsers and have been shared as `.bezierlesson` files. The app reads every one of them.
The types and the validator are in `packages/lessons/src/format/manifest.ts`, packages are read and
written by `packages/lessons/src/format/package.ts`, and
`e2e/fixtures-files/box-extrude.bezierlesson` is a real one.

## The manifest

```ts
interface LessonManifest {
  format: 'bezier-lesson';
  version: 1;
  id: string;
  title: string;
  description: string;
  level?: 'beginner' | 'intermediate' | 'advanced';
  createdAt: string;        // ISO 8601
  duration: number;         // seconds
  viewportType: string;     // MIME of the viewport video
  cameraType?: string;      // MIME of the author's camera video
  events: LessonEvent[];    // keys, clicks, pointer moves, edits, in lesson time
  states: LessonState[];    // at least 1: { time, title, project }, the checkpoints
  cuts: { start: number; end: number }[];  // the stretches that play, in order
  avatar: { time: number; corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }[];
  completed: boolean;       // this learner's progress; reset on import
  zooms?: { start: number; end: number; scale: number }[];  // optional, see below
}
```

- **Time** is seconds from the start of the recorded video, before cuts.
- **`cuts`** are the stretches of the recording that play, in order: a cut in the film editor's
  sense, the piece that is kept. A fresh recording holds one cut from `0` to `duration`. Trimming
  splits a cut and drops the piece between; nothing is removed from the file. An empty list plays
  everything, since nobody means a lesson that plays nothing.
- **Click and pointer positions** are 0 to 1 across the recorded viewport, from its top left.
- **`states[].project`** is the whole model as project text, the same JSON a `.bezier` file holds. The
  lessons code never interprets it; it hands it to `LessonHost.showState` or `openAsProject`.
- **`zooms`** (optional, added after version 1 shipped) are stretches the player shows larger, `scale`
  1 to 4, with the view following the author's pointer. A reader that does not know the field plays the
  lesson unzoomed, as every lesson looked before. The validator accepts a manifest without it and
  rejects one where it is malformed.
- The first state is the model when recording began (`time: 0`, "Start"). The recorder adds one after
  every edit the author commits, titled with the edit's name. Authors can rename, remove or add
  checkpoints.

## The package: `.bezierlesson`

A zip, stored without compression:

| Entry | |
| --- | --- |
| `manifest.json` | the manifest, at most 20 MB |
| `viewport.mp4` or `viewport.webm` | the recording of the editor |
| `camera.mp4` or `camera.webm` | optional: the author's camera |

A package over 512 MB, or expanding to more, is refused before it is expanded. Entries not in this
list are ignored. On import the lesson gets a fresh `id` and `completed: false`.

## Where lessons are kept

IndexedDB database `bezier-lessons`, version 1, object store `lessons` keyed by `id`. A row is
`{ id, manifest, viewportBytes?, cameraBytes? }` with the media as `Uint8Array`: WebKit cannot reliably
store a `MediaRecorder` blob, so bytes are stored and turned back into a `Blob` of
`manifest.viewportType` on reading. Rows written earlier may hold `viewport` and `camera` as `Blob`s
instead; those are read too.

## Changing the format

Add optional fields to version 1, or introduce version 2 with a reader that turns version 1 into it.
Never change what an existing field means, and never stop reading version 1 or the old rows.
