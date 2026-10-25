# @bezier/lessons

Learn: lessons you follow in the editor, and the tools to record and edit them. A lesson is a
recording you can step into. This is part of the app and is developed here like every other package.

At a glance

| | |
| --- | --- |
| **Layer** | Learn: recording, following and editing lessons. Part of the app |
| **Depends on** | `fflate`; talks to the editor only through `LessonHost` |
| **Used by** | `apps/studio` (`src/lessons-host.ts`) |
| **Tests** | 16 files, 942 lines |
| **Explained in** | [How it works: simulation and lessons](../../docs/how-it-works/07-simulation-and-lessons.md) |

The editor talks to it only through `LessonHost` (`src/host/contract.ts`), implemented in
`apps/studio/src/lessons-host.ts`.
