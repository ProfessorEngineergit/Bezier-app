# PBR material assets

## Light finishes

Eight authored Light presets cover warm/cool LEDs, LED strips, RGB LEDs and a
headlight. Strength and bloom are adjustable. Area and spot modes place an outward
light at the model's bounding face in the selected world direction. Spotlights
cast shadows; Three.js area lights do not. Surface-only mode keeps emission without
lighting the stage. These are real-time light proxies, not global illumination or
photometric lumens. Material assignment currently applies to the presentation model
as a whole; individual lamp-face assignment is not part of this material addition.

[Three.js area-light documentation](https://threejs.org/docs/pages/RectAreaLight.html)
describes the supported PBR shading and required WebGPU lookup textures.

The library bundles 28 curated surfaces from ambientCG, GPUOpen and Poly Haven.
Photographic maps are original 2K JPEG downloads; GPUOpen shaders are baked to
2K PNG PBR channels by the repository's offline curation tool. Small WebP
previews are derived from these maps. The app never fetches a provider at runtime.

[Poly Haven](https://polyhaven.com/textures) releases its assets
under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/),
allowing use, modification, and redistribution without attribution. Source
links and creator credits are retained here for provenance.

## Included assets

- **American Walnut Veneer** (`american_walnut_veneer`), Jenelle van Heerden; https://polyhaven.com/a/american_walnut_veneer
- **Ash Veneer** (`ash_veneer`), Jenelle van Heerden; https://polyhaven.com/a/ash_veneer
- **Rosewood Veneer** (`rosewood_veneer1`), Jenelle van Heerden; https://polyhaven.com/a/rosewood_veneer1
- **Plywood** (`plywood`), Rob Tuytel; https://polyhaven.com/a/plywood
- **Brown Leather** (`brown_leather`), Rob Tuytel; https://polyhaven.com/a/brown_leather
- **Denim Fabric 03** (`denim_fabric_03`), colormass (photography), Rico Cilliers (processing); https://polyhaven.com/a/denim_fabric_03
- **Brushed Concrete** (`brushed_concrete`), Dimitrios Savva (photography), Dario Barresi (processing); https://polyhaven.com/a/brushed_concrete
- **Rock 01** (`rock_01`), Rob Tuytel; https://polyhaven.com/a/rock_01

Photographic assets include `albedo.jpg`, OpenGL `normal.jpg`, `roughness.jpg`,
and AO / metallic maps where supplied by the provider.
Displacement maps are intentionally omitted: presentation materials must not
alter the exact shape of CAD geometry.

## ambientCG

- **Metal 030** (`metal030`), ambientCG; https://ambientcg.com/view?id=Metal030

The JPEG maps copied from the ambientCG distribution are also released
under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
The archive's displacement and scene files are intentionally not shipped.

The additional ambientCG IDs are Plastic013A, Plastic012A, Metal049A, Cork004,
Leather026, Fabric036, Marble012 and Wood092. New Poly Haven sets are
fine_grained_wood, leather_white and marble_01. Exact source links, package URLs
and SHA256 for every bundled channel are in `catalog.json` beside this notice.

## AMD GPUOpen MaterialX Library

Brushed Aluminium, Stainless Steel, Matte Aluminium, Brushed Brass, Brushed
Copper, Textured Graphite, Rubber and European Beech are derived from the
[official library](https://matlib.gpuopen.com/main/materials/all). Each selected
asset's provider license is **MIT Public Domain** (the MIT license, not CC0).
Each asset folder retains the original `SOURCE.mtlx` and `LICENSE.txt`, including
AMD's copyright notice. The catalog identifies the exact material and package.

`scripts/curate-visualize-materials.py` and `scripts/materialx_bake.py` reproduce
the bundle. The baker evaluates the image, UV, arithmetic, channel-extraction
and normal-map nodes used by these selected shaders; unrecognized nodes fail.
Packed roughness channels are resolved through their graph rather than treated
as a single grayscale map. Color maps use sRGB; the remaining channels are linear.
Anisotropy, rotation, IOR, metallic and coat settings are carried into the presets.
Preview normal strength and texture scale remain adjustable in Bezier.

The presentation renderer uses Three.js PBR shading. These are curated surface
adaptations; Bezier does not claim to execute arbitrary MaterialX graphs or to
reproduce every standard_surface BSDF exactly. CAD displacement is not enabled.
