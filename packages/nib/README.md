# @bezier/nib

Nib, the little robot: a live 3D mascot that breathes, blinks, looks at the pointer and reacts to a
click. He has no animation clips. Every joint, the eyelids and the mouth are channels (`channels.ts`)
that follow targets through springs, and everything he does is a set of targets.

At a glance

| | |
| --- | --- |
| **Layer** | A leaf: one React component, `NibView`, and the Three.js code behind it |
| **Depends on** | `three` (and React as a peer); nothing in the workspace |
| **Used by** | `apps/studio` (the landing page, `landing/LandingNib.tsx`, loaded as its own chunk) |
| **Model** | `apps/studio/public/nib/nib.glb`: 87 KB (46 KB over the wire), ~19 000 triangles, no skinning |
| **Read first** | `src/stage.ts` (the clock and the canvas), `src/reactions.ts` (what a click does) |

## How he works

| File | What it is |
| --- | --- |
| `channels.ts` | The named values he is made of, and their resting values |
| `rig.ts`, `rig-math.ts` | Channels to node transforms: the film's rig, forward kinematics only, in the model's axes first |
| `springs.ts` | Critically damped springs, exact for any time step |
| `idle.ts` | Breathing, blinking, glances, shifting his weight, falling asleep |
| `reactions.ts` | What a click on each part of him starts; hops are parabolas, not springs |
| `mouth.ts` | The mouth, rebuilt as a thin tube from a smile, a width and a thickness |
| `pacing.ts` | How often a frame is drawn: 60, 30, 15 or 8 a second depending on what he is doing |
| `capability.ts` | Where he must stay a picture: no WebGL, or a software renderer |
| `stage.ts` | Scene, model, clock; the only thing `NibView` calls every frame |
| `NibView.tsx` | The button on the page: still picture first, live canvas when ready, off screen when not seen |

## In the title bar

`island/` is Nib's bubble under the title bar. At rest it is not there and nothing hints at it. It comes
out of the bar's lower edge only for news: a crash, a lesson step, a note, and once each the offer of a
lesson, the first time a project and each workspace is opened (`apps/studio/src/island/first-offers.ts`),
and goes back up when that is over. It is a 96 pixel round window with his real head and neck in it
(`NibHead.tsx`, the model's `head` frame in `stage.ts`) in front of a black-to-grey gradient with a
little grain; where he must stay a picture (no graphics chip, reduced motion) the flat face
(`face.ts`, moods as transforms) is drawn instead. It grows into a card for what needs an answer and into
a pill for a short note. In Friendly his figure also waits on the start page, in a round window of the same look in the
window's lower right corner (`NibSpot frame="whole"`, all of him small).

| File | What it does |
| --- | --- |
| `island/machine.ts` | What the circle shows, decided with no page and no clock: one thing at a time, crash first, nothing queued |
| `island/face.ts` | Nine moods as lid, gaze and brow positions, and the transforms they become |
| `island/NibFace.tsx` | The face drawn: visor, ringed eyes, brows, cheeks |
| `island/NibIsland.tsx` | The circle, the card it grows into, the ring for running work, the dot for what a press opens |

With the island on (`NibController.setIsland`), what he says where no page has a spot for him is
said in the bar, and he no longer stands in the corner for it. The app mounts the island in a React
root of its own, so it is still there when the app's root falls over (`apps/studio/src/island/`).

## Why there is a still picture

`NibView` always renders a picture of him under the canvas. It is what is seen while the model
loads, and for good where he cannot run: reduced motion, no WebGL, a browser with no graphics chip
(one frame of him takes about 40 ms there). The picture is rendered from the same model.

## How the model is made

From the film's model (650 000 triangles on 171 parts), in Blender: parts that cannot be seen at
this size are dropped (engravings, screws, iris blades), the rest is decimated in steps, the normals
are transferred back from the fine mesh so the bevels and reflections stay calm, the joints are kept
as empty nodes, and the file is compressed with `gltfpack -cc -kn -km`. `-kn` matters: without it the
joint nodes are merged away and there is nothing left to pose. The mouth is not in the file; the lids
are rebuilt as spherical shells around a point behind the lens, as in the film.

## Not here yet

Pointing at a part of the interface, speech bubbles and a guided lesson: the channels and reactions
are what they will stand on. Nib's voice is separate work.
