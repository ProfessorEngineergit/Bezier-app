import { define } from '../define.js';

export const SIMULATION = [
  define({
    id: 'simulation',
    title: 'Simulation: test a part under load',
    area: 'Workspaces',
    summary:
      'Hold the part, push on it, solve, and read where it is stressed and how far it bends. A worked example with an angle bracket.',
    keywords:
      'simulation simulate study fea fem finite element analysis stress strain static load test solve von mises safety factor strength deflection bracket fixed support force will it break how strong',
    body: `Simulation is a [workspace](doc:workspaces) over the model you built in Modeling. A **study** is one test of it: which faces are held, which are loaded, what the part is made of, and how fine the calculation is. The answer is drawn on the part as colour. Simulation never changes the model.

You need a solid body to test. If the part is not closed, the solve says so.

## A worked example: an angle bracket

The part is a flat angle bracket, an L of two arms, 20 mm thick. The end of the short arm is bolted to a wall. The long arm carries 200 N. Two questions: where is the bracket stressed most, and does it hold?

To follow along, draw an L with the [line](doc:line) tool in a sketch and [extrude](doc:extrude) it 20 mm. Any solid works the same way.

### 1. Open Simulation

Choose **Simulation** in the workspace menu at the top left, or press Alt+⌘+2 (Alt+Ctrl+2 on Windows and Linux). A bar of settings appears at the top, with a short list of steps under it.

![](image:bar)

The bar says "Needs support · load". The list ticks each step off as you do it.

### 2. Hold the bracket

1. Choose **Fixed** in the rail. A hint says "Click the faces that are held in place."
2. Click the end face of the short arm. It turns blue and a panel opens: "1 face".
3. Press **Done**.

![](image:fixed)

Fixed means the face cannot move at all, as if it were welded to a wall. See [supports](doc:simulation-supports) for the other two.

### 3. Load the bracket

1. Choose **Force** in the rail and click the top face. The top of an extruded L is one face, so the whole top is chosen.
2. In the panel, select the **Magnitude** field, type \`200\` and press Enter.
3. Look at **Direction**. The force starts out pushing straight into the face you clicked, which here is −Z, down. That is what we want.
4. Press **Done**, then Esc to put the tool down.

![](image:force)

A force is a total. Spread over the whole top, 200 N is shared by area, so most of it lands on the long arm. See [loads](doc:simulation-loads).

### 4. Solve

Press **Solve** in the bar, or Ctrl+Enter (⌘↩ on a Mac). The button shows its progress and turns into **Cancel**. The solve runs in the background, so you can keep turning the part. The [study browser](doc:simulation-browser) says afterwards how long it took.

### 5. Read the result

![](image:solved)

The part is coloured by von Mises stress, a single number for how hard the material is working at a point. Blue is little, red is most. The legend at the lower right gives the headline numbers. In the picture:

- **Max stress** is 4.01 MPa. The part is green around the foot and the inner corner, where the arms are bent most, and blue towards the free tip, which carries little. The red end of the scale does not show from this side. The peak is on a face turned away from you, or on a very small area, so turn the part to look for it.
- **Max displacement** is 0.308 mm, at the free end of the long arm. The part is drawn bent more than it really is, so you can see it. See [reading the results](doc:simulation-results).
- **Min safety factor** is 12.46. It is the yield strength of the material, 50 MPa for PLA, divided by the stress. Above 2 is comfortable. Below 1 the material would give way. So this bracket is far from failing, and it could be lighter.

Move the pointer over the part to read the stress at any spot. Choose **Displacement** or **Safety factor** in the bar along the bottom to see the others.

Your numbers will differ if your bracket is not the same size. The pattern will not: most stress near the foot and the corner, least at the tip.

### 6. Try a change

- Swap the material in the bar to **Aluminium 6061-T6** and press Solve again. The displacement falls, because aluminium is much stiffer than PLA.
- Go back to Modeling, round the inner corner with a [fillet](doc:fillet), return and Solve. A rounded corner usually carries a lower peak. A small fillet may not show on the default mesh, so try **Fine**.
- Change the study type to **Shape Optimisation** to see what material the loads do not need. See [shape optimisation](doc:simulation-optimisation).

## The bar

From the left:

- **Study type**: the kind of calculation. Two are built: **Static Stress** and **Shape Optimisation**. The others in the list are greyed and marked "soon": Modal Frequencies, Thermal, Thermal Stress, Structural Buckling, Nonlinear Static, Event Simulation, Fatigue and Flow Preview. They cannot be chosen yet.
- **Material** and **Mesh density**: see [material and mesh](doc:simulation-material).
- **Solve**. If a support or a load is missing, the bar says "Needs support", "Needs load" or both. Pressing Solve anyway lists what is missing and does nothing else.

The **Study** button at the top of the rail opens the [study browser](doc:simulation-browser), the list of everything in the study.

## When something changes

A result describes the shape it was solved on. If you change the model, or change the study (a support, a load, the material, the mesh), the colours come off the part and a **Model changed** note appears. Your supports, loads, material and mesh stay. Press Solve again.

Switching back to Modeling puts the part back to its normal look.

The study is kept with the project, on this device. It is not part of the undo history, and a copy or export of the project does not carry it.

## If it does not solve

| The message | What to do |
| --- | --- |
| Not ready to solve yet | A support or a load is missing. The message says which. |
| The solve did not settle. Part of the model is free to move. | Add a support, or hold more directions, so every piece is held. |
| The part could not be meshed. It may not be a closed solid. | Fix the model in Modeling first. |
| There is no solid to analyse yet. | Build a body first. |

> The numbers come from a voxel approximation of the part. They show where it is stressed and roughly how much. Check a critical part with a finer mesh before you trust a value.`,
    shots: {
      bar: 'The Simulation workspace over an angle bracket: the study bar, the three steps and the rail',
      fixed: 'The Fixed panel open, with the end of the short arm selected in blue',
      force:
        'The Force panel with 200 N, the direction pointing down, and the arrow on the top face',
      solved:
        'The solved bracket coloured by stress, green near the foot and blue at the tip, with the legend at the lower right',
    },
    places: ['simulation', 'study-bar'],
  }),
  define({
    id: 'simulation-supports',
    title: 'Supports: hold the part in place',
    area: 'Workspaces',
    summary: 'Fixed, Pin and Frictionless stop faces of the part from moving.',
    keywords:
      'support constraint fixed pin frictionless boundary condition hold clamp anchor restraint bolt slide fixture fixed geometry roller symmetry',
    body: `A study needs at least one support, or the part would simply fly away. The three supports are in the rail, in the first group of tools.

| Support | What it does | Think of |
| --- | --- | --- |
| **Fixed** | The faces cannot move in any direction. | A face bolted or welded to a wall. |
| **Pin** | Only the directions you choose are held: X, Y or Z. | A peg through a hole. |
| **Frictionless** | The faces are held along their normal and free to slide along themselves. | A face resting on a smooth table. |

## Place one

1. Choose the support in the rail. A hint at the top says what to click, for Fixed "Click the faces that are held in place."
2. Click a face of the part. It is added and its panel opens.
3. Click more faces if the same support holds several. Click a face again to take it off. The panel counts them.
4. Press **Done**, or Enter, to close the panel. The tool stays in hand, so the next click on a face starts another support. Press Esc to put the tool down.

![](image:panel)

A round marker on the face shows each support where it sits.

## Pin

A pin has one more choice. In the panel, under **Held directions**, switch **X**, **Y** and **Z** on or off. All three start on. The directions are the model's own axes, not the face's.

![](image:pin)

In the picture Z is off, so the face is held sideways and free to move up and down.

## Change or remove one

Open the [study browser](doc:simulation-browser) and click the row. The panel opens again. **Delete** at the foot of the panel removes the support, and so does the bin at the end of the row.

## Choosing supports well

- Hold what is really held. A bracket bolted down is Fixed on the faces the bolts clamp, not on every face it touches.
- Too few supports leaves part of the model free, and the solve can stop with "The solve did not settle". One Frictionless face alone is not enough: the part can still slide.
- A small face held hard makes a stress peak at its edge. That value is the least reliable in the result.

Next: [loads](doc:simulation-loads). The whole walk-through is in [Simulation](doc:simulation).`,
    shots: {
      panel: 'The Fixed panel with one face, and the three support buttons in the rail',
      pin: 'The Pin panel with X and Y held and Z off',
    },
    places: ['simulation-supports'],
  }),
  define({
    id: 'simulation-loads',
    title: 'Loads: force, pressure and gravity',
    area: 'Workspaces',
    summary: 'Push on faces with a force or a pressure, or switch gravity on.',
    keywords:
      'load force pressure gravity weight newton mpa bar direction flip push apply stress boundary self weight',
    body: `A study needs at least one load. There are three, in the second group of tools in the rail.

## Force

1. Choose **Force** and click the faces it acts on.
2. In the panel select **Magnitude** and type the force in newtons. The default is 100 N. About 10 N is the weight of one kilogram.
3. Choose a **Direction**: −X, +X, −Y, +Y, −Z or +Z. **Flip direction** reverses the one you have.
4. Press **Done**.

The direction starts out pushing straight into the face you clicked. On a face that is not square to an axis none of the six buttons is lit, and the arrow still points into the face until you choose one.

![](image:force)

The force is the total. With several faces it is shared between them by their area. An arrow on the part shows the direction and the size.

## Pressure

Choose **Pressure**, click the faces, and type the pressure in megapascals. A positive pressure pushes into the part. 0.1 MPa is one bar. Pressure always acts across the face, so it has no direction to choose. The default is 0.1 MPa.

![](image:pressure)

Use pressure for something spread evenly over a face, like air or a liquid against a lid. Use force for a weight or a push at a place.

## Gravity

**Gravity** in the rail is a switch, not a tool. It reads **On** or **Off** under its name. On, it adds the part's own weight, 9.81 m/s² downward along −Z. It counts as a load, so a study with only gravity and a support can be solved.

![](image:gravity)

## Change or remove one

Open the [study browser](doc:simulation-browser) and click the row of the load. **Delete** in its panel removes it. Switching Gravity off removes it too.

Next: [material and mesh](doc:simulation-material), then Solve. The whole walk-through is in [Simulation](doc:simulation).`,
    shots: {
      force: 'The Force panel with its magnitude and direction, and the arrow on the top face',
      pressure: 'The Pressure panel with 0.1 MPa and three arrows across the top face',
      gravity: 'Gravity switched on in the rail, reading On',
    },
    places: ['simulation-loads'],
  }),
  define({
    id: 'simulation-material',
    title: 'Material and mesh density of a study',
    area: 'Workspaces',
    summary: 'Choose what the part is made of and how fine the calculation is.',
    keywords:
      'material pla petg abs nylon aluminium aluminum steel titanium stainless mesh density resolution coarse medium fine ultra elements yield accuracy speed',
    body: `Both are chosen in the study bar. They belong to the study, not to the model.

![](image:bar)

## Material

The material sets stiffness, weight and the strength the safety factor is measured against. Stiffer material bends less. Stronger material takes more stress before it gives way. There are eight.

- **Printed polymers**: PLA (printed), PETG (printed), ABS (printed) and Nylon PA12.
- **Metals**: Aluminium 6061-T6, Steel S235, Stainless 304 and Titanium Ti-6Al-4V.

The [study browser](doc:simulation-browser) shows the chosen material's stiffness (E) and yield strength (σy).

> The printed polymers use the strength along the printed layers. Across the layers a printed part is 30 to 50 percent weaker.

## Mesh density

The calculation divides the part into small cells. More cells give a better answer and take longer.

| Choice | About |
| --- | --- |
| Coarse | 6k cells |
| Medium | 24k cells (the default) |
| Fine | 70k cells |
| Ultra | 160k cells |

After a solve the browser shows the real count and the size of one cell in millimetres. If a stress peak sits on one cell, choose a finer mesh and solve again. A value that changes a lot between meshes is not settled yet.

Changing either one takes the colours off the part. Press Solve again. See [Simulation](doc:simulation) for the whole walk-through, and [reading the results](doc:simulation-results) for what comes out.`,
    shots: { bar: 'The material and mesh density choices in the study bar' },
    places: ['simulation-material'],
  }),
  define({
    id: 'simulation-browser',
    title: 'The study browser',
    area: 'Workspaces',
    summary: 'A list of the study: its material, supports, loads, mesh and result.',
    keywords: 'study browser list supports loads edit delete tree panel summary overview',
    body: `The browser is the list of everything in the study. Use it to check what is set, to reopen a support or a load, and to delete one.

1. Press **Study** at the top of the rail. The browser opens on the left.
2. Press it again, or the **×** in the browser, to close it.

The browser stays shut until you ask for it, so it never covers the faces you are clicking.

![](image:browser)

It has a section for each part of the study:

- **Material**: the name, stiffness and yield strength.
- **Supports** and **Loads**: one row for each, with its size and the number of faces. Click a row to open its panel and change it. The bin at the end of a row deletes it.
- **Mesh**: the number of cells, or the number it will aim for before a solve.
- **Results**: appears after a solve. It says **Solved** or **Out of date**, the time it took and the number of iterations.

The Modeling [Items](doc:items) panel is not shown in Simulation. Going back to Modeling brings it back.

See [supports](doc:simulation-supports) and [loads](doc:simulation-loads) for what each row opens.`,
    shots: {
      browser: 'The study browser listing a fixed support and a 200 N force on the bracket',
    },
    places: ['simulation-browser'],
  }),
  define({
    id: 'simulation-results',
    title: 'Reading the results of a study',
    area: 'Workspaces',
    summary:
      'Stress, displacement and safety factor drawn on the part, with a scale and a hover readout.',
    keywords:
      'results stress von mises displacement deformation safety factor legend colour scale contours animate hover max yield fail read interpret',
    body: `After a solve the part is coloured and two things appear: a **legend** at the lower right and a **results bar** along the bottom.

![](image:legend)

## What is shown

Choose in the results bar:

- **Stress**: von Mises stress in MPa. Red is where the material is working hardest. Compare the peak with the material's yield strength.
- **Displacement**: how far each point moved, in millimetres. It tells you how much the part bends.
- **Safety factor**: yield strength divided by stress. Below 1 the material would yield; below 2 deserves a look. The scale tops out at 8 and the summary at 15.

The legend lists the three headline numbers: **Max stress**, **Max displacement** and **Min safety factor**. The safety factor is coloured as a warning when it falls under 2 and as a failure under 1.

## Read a value

Move the pointer over the part. A marker slides along the legend to the value under the pointer, and a readout in the legend gives the number. Off the part, and while a mouse button is down, the readout says "Hover the model".

![](image:hover)

## How it looks

![](image:bar)

- **Undeformed**, **Actual** or **Exaggerated**: how the part is bent. Exaggerated, the default, scales the largest movement to about six percent of the part's size so you can see it. Actual draws the true movement, which is usually too small to see.
- **Animate**: swings the part between rest and bent. It needs Actual or Exaggerated.
- **Smooth** or **Contours**: a continuous blend, or ten steps of colour. Contours is the default.
- **Hide** or **Show**: takes the colours off the part and brings them back. **Results** in the rail does the same, and reads None before a solve, then Shown, Hidden or Out of date.

## What to do with it

- Red where you did not expect it: check that the support and the load are on the faces you meant.
- A safety factor under 2: thicken the part, add a [fillet](doc:fillet) where the red is, or choose a stronger material, then solve again.
- A peak on a single cell: choose a finer [mesh](doc:simulation-material) and see if it holds.

> The legend notes that the result is a voxel approximation and how many cells it used.`,
    shots: {
      legend: 'The legend with the maximum stress, displacement and safety factor',
      hover:
        'The pointer over the top near the inner corner, with the legend marker and a readout of 1.74 MPa',
      bar: 'The results bar with its quantity, deformation and colour choices',
    },
    places: ['simulation-results'],
  }),
  define({
    id: 'simulation-optimisation',
    title: 'Shape optimisation: remove material the loads do not need',
    area: 'Workspaces',
    summary: 'Keep a share of the material where the loads need it and show what can go.',
    keywords:
      'optimisation optimization topology shape simp lightweight lighten remove material keep density generative weight save material',
    body: `Shape Optimisation is the second study type that is built. It uses the same supports and loads as a static study, then looks for the part of the material that carries them and shows what is left over.

1. Set up [supports](doc:simulation-supports) and [loads](doc:simulation-loads) as usual.
2. In the bar, choose **Shape Optimisation** as the study type. The mesh switches to Coarse, because the calculation solves about forty times.
3. Use the **Keep** slider to choose how much of the material to keep, from 10 to 80 percent. It starts at 35 percent.
4. Press **Solve**. The part updates as the calculation goes.

![](image:bar)

The result is drawn as a density, from 0 to 1, on the legend's scale. The legend gives **Material kept** as a percentage. The results bar shows **Optimised shape** and has no stress, displacement or deformation choices. Material the loads hardly use is left out of the picture.

![](image:result)

> The result is a guide. It does not change your model: no feature is added and nothing is cut. Use it to decide where to put a [hole](doc:hole) or a pocket yourself in Modeling.`,
    shots: {
      bar: 'The study bar with the Keep slider for shape optimisation',
      result: 'The bracket after shape optimisation, with the legend reading Material kept',
    },
    places: ['simulation-optimisation'],
  }),
] as const;
