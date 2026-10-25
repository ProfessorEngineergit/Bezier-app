# Prompts: the badges as sculptures, built by an agent in Blender

For an AI agent with control of Blender (Python/bpy and the UI). Paste
**Prompt 1** once to set the world, then one **badge prompt** at a time, then
**Prompt 3** after every render. Each badge is built in four tiers, and every
tier must still work at 64 px in the app.

The idea in one line: **the Bezier Pantheon.** Every badge is a small museum
sculpture from Greek myth, about one thing a person does in Bezier: shaping
a solid, teaching, sharing. It is made from impossible materials: dispersive
crystal, cast bronze with patina, gold leaf, marble lit from inside.

---

## Prompt 1: the world (send first)

```text
You are the art director and technical artist for a set of collectible award
sculptures, built and rendered in Blender with Cycles. You control Blender
directly. Work in Python (bpy) where it is precise and the UI where it is faster,
and save often.

THE PROJECT
"The Bezier Pantheon": badges for an open-source CAD app called Bezier. People
earn them for teaching (lessons), building (plugins) and learning. Each badge is
a museum-quality miniature sculpture, about 10 cm tall, inspired by Greek myth
and classical sculpture (Hellenistic drapery, Praxiteles' contrapposto, the
Winged Victory's motion), but made from impossible, luminous materials. Think
Lalique crystal meets Cellini bronze meets a modern product render. Every one
must look like an object you would put behind museum glass, not like an icon.

THE SYSTEM (never break it)
1. FAMILY = the plinth. Every sculpture stands on a plinth whose plan shape
   says which family it belongs to:
   - Lessons: a ROUND plinth, turned, with a fine stepped profile (like a
     classical column base: torus, scotia, torus).
   - Plugins: a HEXAGONAL plinth, faceted like a machined nut with chamfered
     edges and a fine engraved band.
   - Learning: a SQUARE plinth with softly rounded corners, like a polished
     museum block.
   Plinth: 6 cm across, 1.6 cm tall. The badge name is engraved on the front
   face in a classical inscription style (Trajan-like capitals), shallow, filled
   with the tier's metal.
2. TIER = the material recipe. The SAME sculpture is made in four tiers. The
   form never changes between tiers; only the materials do, and each tier
   must look clearly richer than the one before:
   - Tier I, "Bronze": cast bronze with a verdigris patina in the recesses and
     polished high points; the "glass" parts in clear soda-lime glass.
   - Tier II, "Sapphire": polished brass and platinum; glass parts in deep blue
     sapphire crystal; a thin-film interference sheen on the plinth's edge.
   - Tier III, "Emerald": 24k gold with hand-burnished highlights and fine
     gold-leaf texture; glass parts in emerald crystal with visible internal
     inclusions (tiny veils and bubbles); white Carrara marble plinth with gold
     inscription.
   - Tier IV, "Mythic": the glass parts in flawless high-dispersion crystal that
     throws spectral fire; rose and yellow gold; a black obsidian plinth with
     gold inlay; ONE source of inner light (a small glowing core inside the
     crystal) that throws real caustics onto the plinth.
3. Every sculpture must read at 64 x 64 pixels: one clear silhouette, one focal
   glass element that catches the light, no fussy detail at the edges. Check
   this on every render by downscaling it.

MATERIALS (Principled BSDF, Cycles; values are starting points, tune by eye)
- Crystal and glass: Transmission 1.0, Roughness 0.0, Coat 0.2. Colour comes
  from VOLUME ABSORPTION (Volume Absorption node or Principled volume
  absorption), never from Base Color, so thick parts are deeper in colour
  than thin ones. IOR: clear glass 1.52, sapphire 1.77, emerald 1.57, mythic
  crystal 2.42 with Dispersion 0.04-0.06 (Blender 4.2+ Principled/Glass
  dispersion). Add subtle internal inclusions with a sparse Voronoi/noise
  controlling a second, slightly rougher glass or tiny bubble meshes.
- Bronze: Metallic 1, base (0.80, 0.50, 0.30), roughness 0.25-0.45 driven by
  a cavity/AO mask; verdigris (0.25, 0.55, 0.45), non-metallic, rough 0.8, only
  in cavities; Pointiness/AO masks plus noise.
- Brass (0.91, 0.78, 0.42) metallic, rough 0.15. Platinum (0.87, 0.86, 0.83)
  rough 0.1.
- Gold: base (1.0, 0.77, 0.34), roughness 0.08-0.2 with fine anisotropic
  brushing on flat faces; gold leaf as a cracked-tile Voronoi with slight
  height. Rose gold (0.98, 0.70, 0.60).
- Carrara marble: subsurface weight 0.2, radius (1.0, 0.9, 0.8) mm-scale,
  veining from distorted noise and wave textures, soft grey veins.
- Obsidian: near-black, roughness 0.03, very slight conchoidal normal ripple.
- Thin film: Principled Thin Film (thickness 400-600 nm, IOR 1.4) only on
  sapphire-tier plinth edges, as an accent.
- Inner light (Mythic only): a small emissive core inside the crystal (warm
  white, 2-5 W equivalent). Turn on Cycles caustics, and on the plinth set
  "Shadow Caustics" receiving with the crystal casting, so the light throws
  real refracted patterns.

LIGHT AND CAMERA (build once as a reusable rig, the same for every badge)
- Cycles, GPU if available. Light paths: max 32, transmission 24, glossy 12,
  caustics reflective and refractive ON, filter glossy 0.2.
- A studio HDRI (any CC0 studio HDRI from Poly Haven, e.g. a softbox studio)
  at low strength for reflections, rotated so the brightest softbox sits upper
  left. Plus: a large key area light upper left (soft), a narrow strip rim
  light behind right (it outlines glass edges), a small warm kicker low right.
  A dark curved backdrop that the camera never sees directly
  (ray visibility: camera off) but that glass refracts. Glass is only as
  beautiful as what it refracts: make sure there is structure behind it.
- Camera: 100 mm lens, eye-level slightly above the plinth top, 3/4 view
  rotated 18 degrees, the sculpture filling 80% of the frame height.
  Depth of field: f/8 equivalent, focus on the glass element.
- Colour management: AgX, look "Medium High Contrast". Film: transparent.
- Render: 2048 x 2048, 1024 samples, OpenImageDenoise, adaptive sampling.
  Preview renders at 512 px and 64 samples while working.

DELIVERABLES PER BADGE
- One .blend per badge, collections "Sculpture", "Plinth", "Rig", with the
  four tiers as four material slots/variants switchable by a single custom
  property on an Empty called "Tier" (1-4) driving the materials, so the
  form is modelled once.
- Renders: <badge>-<tier>.png at 2048 and 512, transparent background.
- A 120-frame turntable per tier (1:1, 512 px, transparent, seamless loop),
  exported as PNG sequence; I will encode it.
- A printable version: a watertight single mesh of the sculpture and plinth,
  minimum wall 1.2 mm, exported as STL and 3MF at 100 mm tall.

HOW TO WORK
1. First build the RIG scene (lights, HDRI, backdrop, camera, render settings)
   and the three PLINTHS. Render the empty plinths in all four tiers and show
   me. Do not start a sculpture before I approve the rig.
2. For each sculpture: block out the silhouette in simple shapes, render at
   64 px and 512 px, then refine. Use sculpt mode, multires and remesh for
   figures and drapery; hard-surface modelling with bevels for
   architecture and mechanisms. Real geometry, not displacement tricks, for
   anything that refracts.
3. Keep the glass element thick enough to refract dramatically (at least
   8 mm), with bevelled edges so it catches rim light. No razor edges anywhere.
4. Name every object and material clearly. Save a new version file at each
   milestone (badge_v01.blend, v02...).
5. After every render, critique it against this brief before continuing.
```

---

## Prompt 2: one badge at a time

Send the badge's prompt after the rig and plinths are approved. Every one
starts with the same frame:

```text
Build the next sculpture in the Pantheon, on the <FAMILY> plinth, in all four
tiers, following the brief. Start with a silhouette block-out and show me the
64 px and 512 px previews before detailing.
```

…followed by the brief for that badge:

### Lessons (round plinth)

**First lesson: "Prometheus Lifts the First Solid"**
```text
A young Titan in Hellenistic style, one knee on the plinth, lifting a perfect
glass cube up out of a flat drawn square that lies on the plinth like a
sketch (the square is an engraved outline with a faint glow). The cube is
mid-extrusion: its lower half still merges with the drawn square as if the
solid is being pulled up out of the drawing. The Titan's body and drapery are
the tier's metal; the cube is the tier's crystal, the focal element, with
the rim light running along its top edges. Silhouette: a figure under a
raised cube.
```

**Chapter maker: "Clio Unrolls the Lesson"**
```text
Clio, Muse of History, standing in contrapposto, unrolling a long scroll that
sweeps around the plinth in a spiral. The scroll is crystal; along its
edge, small metal tick marks divide it into chapters, each slightly
different in length, like a timeline. Where she holds it, the scroll is
thick and deep in colour; at its far end it thins to almost clear. Drapery
in heavy cast folds. Silhouette: a tall figure with a ribbon spiralling
around her.
```

**Stepped into: "Hermes at the Threshold"**
```text
Hermes, winged sandals and petasos, caught mid-stride stepping THROUGH a
free-standing crystal doorframe: his front foot and hand are already
inside the glass and distorted by refraction, his back half is still outside
in metal. Inside the doorway's glass, faintly, a small floating model (a
filleted box) is visible. This is the moment of opening a model at a
checkpoint. Silhouette: a striding figure passing a rectangular frame.
```

**Teacher: "Athena Guides the Hand"**
```text
Athena, seated on a low stool, helmet pushed back, guiding the hand of a
small student who holds a drafting compass over a crystal disc. The disc is
the focal element: concentric circles drawn by the compass glow faintly
inside it. Her owl sits on the plinth edge. Calm, warm, generous. The
gesture of teaching, two hands on one tool, must read even at 64 px.
Silhouette: a large seated figure leaning over a small one and a disc.
```

### Plugins (hexagonal plinth)

**First plugin: "Hephaestus Forges the First Part"**
```text
An anvil on the hex plinth; on it, a crystal gear-like puzzle piece (one
side a gear, the other a jigsaw tab) glowing orange-white inside as if
just forged. A bronze hammer rests against the anvil; tongs hold the piece.
Tiny cooling sparks frozen in mid-air as glass droplets around it. No figure,
only the forge. Silhouette: anvil plus glowing piece.
```

**Installed: "Atlas Holds the Many"**
```text
Atlas, kneeling, holding up a sphere built from dozens of small hexagonal
crystal tiles fitted together like a geodesic dome, each tile a slightly
different tint within the tier's colour, a few tiles missing to show the
hollow inside where a small metal core sits. The strain in his back and
arms is real. Silhouette: a crouched figure under a large faceted sphere.
```

**Offline hero: "Hestia's Hearth Needs No One"**
```text
A sealed crystal bell jar on the hex plinth; inside, a small bronze tripod
hearth with a flame that burns on its own: the flame is solid, sculpted
crystal with an emissive core. The jar is perfectly closed, nothing goes in
or out. Around the jar's foot, a metal band engraved with a meander (Greek
key) pattern. Silhouette: a dome on a hex.
```

**Clean review: "The Scales of Themis"**
```text
A tall balance: a slim bronze column with a crossbeam; on each pan, a crystal
sphere, the two perfectly level. Themis's blindfold hangs from the beam as a
sculpted metal ribbon. The two spheres refract each other; a hairline gold
needle at the centre points exactly upright. Silhouette: a T-shaped balance
with two spheres.
```

### Learning (square plinth)

**First step: "The First Step of Nike"**
```text
A single winged sandal of Nike stepping onto the lowest of three crystal
stairs that rise from the plinth; the wings on the heel are open, in thin
cast metal feathers; under the sole, where it touches the glass, a ring of
light spreads like a ripple frozen in the crystal. Silhouette: a winged foot
on a stair.
```

**Streak: "Ouroboros of the Weeks"**
```text
A serpent swallowing its tail, forming a ring that stands upright on the
plinth. Its body is segmented into seven crystal sections, one per week,
joined by metal bands; the scales are carved into the glass so the rim
light breaks into a thousand highlights. Its eyes are tiny cut gems.
Silhouette: an upright ring.
```

**Level up: "Icarus on the Spiral Stair"**
```text
A spiral staircase of crystal steps winding up a central bronze column; each
step a slightly deeper tint than the one below. On the top step, a small
figure of Icarus with sculpted wings spread, about to rise; he never falls,
the wings are intact. Light from the top glows down through the steps.
Silhouette: a tall spiral with a winged figure on top.
```

**Made it mine: "Pygmalion's Statue Wakes"**
```text
A sculptor's chisel and mallet laid on the plinth before a half-length
statue that is turning from crystal into metal: from the head down to the
chest it is still clear crystal (the original), and from there the metal
spreads upward as if the person who opened the model has made it their own.
The boundary is a soft, irregular wave. Silhouette: a bust on a block with
tools.
```

---

## Prompt 3: the critique (after every render)

```text
Critique this render against the brief before doing anything else. Answer
each, briefly:
1. Downscale to 64 px: is the silhouette instantly readable, and is the
   family plinth shape clear?
2. Is there exactly one focal glass element, and is it the brightest,
   most refractive thing in the frame?
3. Does the glass refract something with structure (rim light, backdrop
   gradient), or does it go grey or black? If grey: fix the backdrop and
   rim light, not the material.
4. Do the four tiers look like a clear progression, each richer than the
   last, with the form identical?
5. Any fireflies, noise in glass, black spots in thin parts (raise
   transmission bounces), razor edges (bevel them), or plastic-looking metal
   (add roughness variation)?
6. Is it beautiful? Would it look at home behind museum glass? If not, say
   what one change would make the biggest difference, and make it.
Then fix the biggest problem and render again.
```

---

## Notes for whoever runs this

- Start a fresh conversation per badge after the rig is approved, and give
  the agent the rig's `.blend` and Prompt 1 again; long sessions drift.
- Approve the rig and plinths first. They are 80% of the consistency across 48
  renders.
- If an agent cannot do sculpt mode well, ask it for the figures as a
  stylised low-poly first (Art Deco planes rather than realism), then refine
  — still beautiful in crystal.
- The renders replace `../renders/`; keep the file names `<badge>-<tier>.png`
  with tiers `bronze`, `sapphire`, `emerald`, `mythic`, and update
  `app/RecognitionIntro.tsx`'s three imports.
