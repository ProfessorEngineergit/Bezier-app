import { define } from '../define.js';

export const VISUALIZE = [
  define({
    id: 'visualize',
    title: 'Visualize: materials, light and renders',
    area: 'Workspaces',
    summary:
      'Finish the model with materials and studio light, then save a picture or a turntable video of it.',
    keywords:
      'visualize visualise render rendering presentation pbr materials lighting studio photo realistic appearance look image keyshot product shot colour color finish',
    body: `Visualize is a [workspace](doc:workspaces) for showing the part, not for changing it. Nothing you do here alters the geometry.

![](image:workspace)

Open it from the workspace menu at the top left of the window. With no solid in the model the window says "Nothing to render yet": build a body in Modeling first. The first time you open Visualize it starts its renderer, which can take a few seconds, and a "Starting the renderer…" note shows meanwhile.

## What is on screen

- **The render** fills the window. It has its own camera, so framing a shot never moves the view you model in. Drag to turn the part and scroll to zoom.
- **The look panel** on the right has three tabs: **Material**, **Environment** and **Camera**. Drag its left edge to make it wider; double-click the edge to reset it.
- **The render bar** at the top: **Turntable**, **Record 360°**, **Frame** and **Capture**.
- **Items** in the rail at the left lists the bodies, as in Modeling.

## Make a first picture

1. In the **Material** tab, pick a material from the library. See [Materials](doc:visualize-materials).
2. In **Environment**, choose a studio. See [Environment and light](doc:visualize-environment).
3. Turn the part with the mouse until you like the view, then press **Frame** if you lose it.
4. Press **Capture**. See [Capture, turntable and video](doc:visualize-render).

## Which bodies a change applies to

Double-click a body in the render, or click it in Items, to pick it. Shift adds more. A single click picks the face under the pointer instead: see [Materials for single faces](doc:visualize-faces). The Material tab says **Apply to:** and names what is picked. With nothing picked, a material goes to all visible bodies.

Each body keeps its own finish.

## Where to go next

- [Materials](doc:visualize-materials)
- [Materials for single faces](doc:visualize-faces)
- [Lights and glowing materials](doc:visualize-lights)
- [Environment and light](doc:visualize-environment)
- [Camera, focus and depth of field](doc:visualize-camera)
- [Decals](doc:visualize-decals)
- [Capture, turntable and video](doc:visualize-render)

> If the renderer cannot start, the window says "The presentation renderer could not start" and the reason. The rest of Bezier is not affected.`,
    shots: {
      workspace:
        'The Visualize workspace with a blue plastic part, the look panel and the render bar',
    },
    places: ['visualize', 'visualize-panel'],
  }),
  define({
    id: 'visualize-materials',
    title: 'Materials in Visualize',
    area: 'Workspaces',
    summary:
      'Pick a finish from the library, tint it, and adjust how shiny, metallic or grainy it is.',
    keywords:
      'material library plastic abs pla metal aluminium steel brass copper wood stone marble ceramic glass rubber leather textile roughness metallic clear coat transmission grain colour tint search drag shiny matte finish appearance',
    body: `Open the **Material** tab of the look panel. The panel is long: from the top it has the search field, **Apply to:**, **In Use**, **Decal**, and then the library. Scroll down to reach the library.

## Choose a material

1. Pick the body or bodies you want to change, or none for all of them.
2. Press **Done** in **In Use** to fold its controls away. The library moves up.
3. Look in the library. It is grouped by **Plastic**, **Metal**, **Wood**, **Stone**, **Ceramic**, **Glass**, **Rubber**, **Leather**, **Textile** and **Light**. Each tile shows a ball in that finish.
4. Click a tile. It is applied at once.
5. Or drag a tile onto a body in the render to give it that material alone.

The search field at the top, **Search Materials**, filters by name, finish, group or source. "No material matches" shows when nothing fits.

![](image:library)

Some materials are photographed from real surfaces, and the panel says where they come from, for example Poly Haven or GPUOpen. Their maps load when you choose the material, and **Loading maps…** shows while they do.

## In Use and Adjust

**In Use** shows the current material and its controls. Press **Done** to fold the controls away, and **Adjust** to open them again.

![](image:adjust)

- **Tint**: for materials that can be tinted, a colour field, a hue bar, a row of suggested colours, and a hex field. Type a code such as #416FAB, or click a suggested colour.
- **Roughness**: from mirror-smooth to matte.
- **Metallic**: how much it behaves like metal.
- **Clear Coat**: a glossy layer over the surface.
- **Transmission**: how much light passes through, for glass and clear plastics.
- For materials with a surface structure: **Grain**, **Grain Direction** and **Structure Scale**.

When you change one, the line under the name adds "Custom". Click the material's tile again to go back to the original.

## Good to know

- The **Tint** field only appears for materials that can be tinted. Photographed materials, such as the woods and stones, keep the colour they were photographed in.
- To give one face a material of its own, see [Materials for single faces](doc:visualize-faces).
- Each tile's name says its finish, for example "Linear brushed". Search for a finish word, such as brushed or satin, to find several at once.

> The finish of each body is kept with the project on this device. It is not part of the model file, so it does not travel when you share the project.

## Related

- [Visualize overview](doc:visualize)
- [Lights and glowing materials](doc:visualize-lights)
- [Environment and light](doc:visualize-environment)`,
    shots: {
      library: 'The material library with Brushed Aluminium chosen and the part rendered in it',
      adjust: 'The In Use material with its Adjust controls open: tint, roughness and more',
    },
    places: ['visualize-materials'],
  }),
  define({
    id: 'visualize-faces',
    title: 'Materials for single faces',
    area: 'Workspaces',
    summary:
      'Click a face to give it a material or a colour of its own; double-click for the body.',
    keywords:
      'face material colour color paint single face palette hex highlight stripe accent mark wood top two materials double click body',
    body: `A face can have a material of its own: a wooden top on a metal box. The rest of the body keeps the body's material.

1. Point at the render. The face under the pointer lights up, as in Modeling.
2. Click a face. Shift-click adds more, and clicking the same single face again lets it go. **Apply to:** names it, for example "1 face of Body 1".
3. Choose a material in the library, or change the one **In Use**. It goes to the picked faces alone.
4. To give a face back to its body, pick it and press **Use the body's material**.

Double-click a body to pick all of it. A material chosen then goes to the whole body, except the faces that have one of their own: they keep theirs.

A face can also have just a colour on top of its material, from the row of nine under the picked faces, or from the rainbow circle at its end. **Use the body's colour** takes it off.

![](image:faces)

A face that is picked is tinted blue so that you can see it, which hides its true colour. Click empty space in the render to let go of all the picked faces and see the colours as they will render.

Faces keep their materials and colours through changes to the model, because faces are found by their stable names. They are kept with the project on this device.

## Related

- [Materials](doc:visualize-materials)
- [Visualize overview](doc:visualize)`,
    shots: {
      faces:
        'A red front face given its own colour and the top face picked, with the colour palette',
    },
    places: ['visualize-faces'],
  }),
  define({
    id: 'visualize-lights',
    title: 'Lights and glowing materials',
    area: 'Workspaces',
    summary: 'Make a body shine: LEDs, strips and a headlight that light the scene around them.',
    keywords:
      'light emission emissive led glow headlight spotlight area light strength beam angle lamp bloom luminous neon lit',
    body: `The **Light** group of the material library holds materials that give off light: Warm LED, Cool LED, LED Strip, Warm LED Strip, Red LED, Green LED, Blue LED and Headlight.

1. Pick the body that is the light.
2. Search for the name, or find it in **Light**, and click it.
3. In **In Use**, open **Adjust** if it is folded, and set the controls.

![](image:controls)

- **Tint**: the colour of the light. Six suggested colours sit under the colour field.
- **Light Strength**: how bright, from 0 to 20 times. At 0 the body does not glow.
- **Light emission**: **Surface glow** only brightens the surface. **Area light** also lights the floor and other bodies. **Spotlight** casts a beam.
- **Direction**: for an area light or spotlight, which way it shines. The choices are Front · −Y, Back · +Y, Left · −X, Right · +X, Up · +Z and Down · −Z, along the model's axes.
- **Beam Angle**: for a spotlight, how wide the beam is, from 5 to 100 degrees.
- **Light Glow**: the halo around bright parts. It is the same setting as **Glow** in the [Camera tab](doc:visualize-camera).

The Headlight starts as a spotlight. The others start as area lights.

## Tips

- A light shows best in a dark studio, such as Technical Studio. See [Environment and light](doc:visualize-environment).
- If the light seems to point the wrong way, change **Direction**. The axes are the model's, not the view's.
- Lower **Light Strength** if the part washes out to white.

> Choosing an ordinary material takes the emission off the body again.

## Related

- [Materials](doc:visualize-materials)
- [Visualize overview](doc:visualize)`,
    shots: {
      controls: 'The adjust controls of a Blue LED, with strength, emission and direction',
    },
    places: ['visualize-lights'],
  }),
  define({
    id: 'visualize-environment',
    title: 'Environment and light in Visualize',
    area: 'Workspaces',
    summary:
      'Choose a studio, then set the exposure, ambient light, key light angle and ground shadow.',
    keywords:
      'environment studio hdri backdrop background transparent exposure ambient key light angle ground shadow lighting neutral warm technical dark white',
    body: `Open the **Environment** tab.

## Photographic Studio

Choose one of five set-ups:

- **Neutral Studio**: soft grey light and backdrop. It is the one a new project starts with.
- **Warm Studio**: a dark, warm room.
- **Technical Studio**: a cool, dark backdrop.
- **Custom Backdrop**: a plain colour of your own. A **Backdrop** colour field appears. It starts without a ground shadow.
- **Transparent**: no backdrop and no ground, so a capture can be placed on any page.

![](image:studios)

The first time a studio is used its lighting is loaded and filtered, so there is a short wait. A **Loading…** note shows while it works. If it cannot load, Visualize uses a plain light instead and says "The photographic studio could not load. Using fallback light."

## Light

- **Exposure**: overall brightness, from −2 to +2 EV.
- **Ambient**: how much light the studio gives, from 0 to 200 percent.
- **Key Light Angle**: turns the main light around the part, from −180 to 180 degrees. Use it to move the highlights and the shadow.
- **Ground Shadow**: a checkbox for the shadow under the part. It is off and greyed in the Transparent studio.

Choosing a studio sets these to values that suit it, so choose the studio first and adjust afterwards. Your material and camera choices are not touched.

## Tips

- A dark part reads best on a light backdrop, and a light part on a dark one.
- For a picture to place on a page with its own background, choose Transparent and press **Capture**. See [Capture](doc:visualize-render).

## Related

- [Materials](doc:visualize-materials)
- [Camera, focus and depth of field](doc:visualize-camera)
- [Visualize overview](doc:visualize)`,
    shots: {
      studios: 'The Environment tab with Technical Studio chosen and the light controls',
    },
    places: ['visualize-environment'],
  }),
  define({
    id: 'visualize-camera',
    title: 'Camera, focus and depth of field',
    area: 'Workspaces',
    summary: 'Set the field of view and the aperture, and right-click the model to focus on it.',
    keywords:
      'camera field of view fov aperture depth of field dof focus blur bokeh f-stop glow lens perspective turntable length',
    body: `Open the **Camera** tab.

![](image:camera)

- **Field of View**: from 15 to 90 degrees. A narrow view looks flatter, like a long lens, and a wide one exaggerates depth.
- **Aperture**: **Off**, or ƒ1.4, ƒ2, ƒ2.8, ƒ4, ƒ5.6 or ƒ8. A smaller number blurs what is away from the focus more. A small drawing of five posts shows what will be sharp and what will be soft.
- **Focus Distance**: appears once an aperture is chosen. Move the focus nearer or farther. The line in the drawing moves with it.
- **Glow**: the halo around bright parts.
- **Turntable Length**: the seconds one turn takes, from 4 to 30. It sets the length of the [video](doc:visualize-render).

## Focus by clicking

Right-click a point on the model. The focus moves to it. If the aperture was off, it is set to ƒ2.8. This is quicker than the slider.

The blur is a photographic effect, so it only shows in the render and in a capture. Set the aperture to **Off** to see the whole part sharp again.

## Frame the part

**Frame** in the render bar fits the part into the view again after you have turned or zoomed.

## Related

- [Capture, turntable and video](doc:visualize-render)
- [Environment and light](doc:visualize-environment)
- [Visualize overview](doc:visualize)`,
    shots: {
      camera:
        'The Camera tab with ƒ2.8 chosen, the focus drawing and the part blurred away from the focus',
    },
    places: ['visualize-camera'],
  }),
  define({
    id: 'visualize-decals',
    title: 'Decals: put a picture on the model',
    area: 'Workspaces',
    summary: 'Place a PNG, JPEG or WebP image, such as a logo, on a surface of the part.',
    keywords:
      'decal image logo label sticker picture texture print png jpeg webp drop import brand marking',
    body: `In the **Material** tab, find **Decal**. It sits between **In Use** and the library; press **Done** in **In Use** if you cannot see it.

1. Set the **Decal size**, in millimetres. It starts at 15, and the decal is a square of that size.
2. Drop an image file onto the model in the render. It is placed where you drop it.
3. Or press **Import…** and choose a file. It is placed at the centre of the view.

![](image:decal)

PNG, JPEG and WebP files work, up to 15 MB. A PNG with a transparent background is the best for a logo. A button, **Clear**, with the number of decals, removes them all.

## If it does not work

- "Drop the decal directly on the model." means the spot you dropped on is not on the part. Aim at the surface.
- "Use a PNG, JPEG or WebP under 15 MB." means the file is another type or too large.
- A decal placed near an edge can be cut off or bent around it. Use a smaller size, or aim at the middle of a flat face.

> Decals are placed in the render only. They are not saved with the project, and they are cleared when the model changes or you leave Visualize. Press **Capture** to keep a picture of them.

## Related

- [Capture, turntable and video](doc:visualize-render)
- [Materials](doc:visualize-materials)
- [Visualize overview](doc:visualize)`,
    shots: {
      decal: 'The Decal section with its Clear button, and a badge placed on the front face',
    },
    places: ['visualize-decals'],
  }),
  define({
    id: 'visualize-render',
    title: 'Capture a picture, turntable and video',
    area: 'Workspaces',
    summary: 'Save the render as a PNG, turn the part, or record one full turn as a video.',
    keywords:
      'capture screenshot png image export render turntable video record 360 webm mp4 frame save picture animation spin rotate',
    body: `The render bar is at the top of Visualize.

![](image:bar)

- **Capture**: saves the render as **bezier-render.png**. It is greyed until the renderer is ready.
- **Turntable**: turns the part slowly. The button becomes **Stop Turntable**.
- **Record 360°**: records exactly one turn and saves it when it ends. Press **Stop & Save Video** to finish early. The file is **bezier-turntable.webm**, or .mp4 in a browser that makes only that. The turn takes as long as **Turntable Length** in the [Camera tab](doc:visualize-camera), 12 seconds to start with.
- **Frame**: fits the part to the view.

Because the video is exactly one turn, it ends on the frame it began on and loops cleanly.

In a browser the file goes to your downloads folder. In the desktop app a save dialog asks where.

## Before you capture

1. Choose the material and the studio.
2. Turn and zoom the part to the view you want, then wait a moment for the render to settle.
3. Press **Capture**. If the picture comes back empty, Visualize says "The capture came back empty. Try again once the render has settled."

> If the browser cannot record video, Visualize says "Video recording is not available in this browser" and the button does nothing. Capture still works.

## Related

- [Environment and light](doc:visualize-environment)
- [Camera, focus and depth of field](doc:visualize-camera)
- [Visualize overview](doc:visualize)`,
    shots: { bar: 'The render bar with Turntable, Record 360°, Frame and Capture' },
    places: ['visualize-capture'],
  }),
] as const;
