/**
 * STEP colours mapped onto OCCT's faces, against the real module, since matching relies on OCCT's
 * face order following the file's shell.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { createOcctKernel } from './occt-kernel.js';
import { textKey } from './shape-store.js';
import { coloursOf, NO_COLOUR, parseStepColors, parseStepParts } from './step-colors.js';
import { loadOcct } from './wasm.js';

type Occt = Awaited<ReturnType<typeof loadOcct>>;

/** The file with a colour on `item` (and optionally one face), as CAD programs write it. */
function coloured(step: string, item: number, rgb: [number, number, number], face?: number) {
  const ids = [...step.matchAll(/#(\d+)\s*=/g)].map((m) => Number(m[1]));
  let next = Math.max(...ids) + 1;
  const lines: string[] = [];
  const style = (target: number, [r, g, b]: [number, number, number]) => {
    const colour = next++;
    const fill = next++;
    const area = next++;
    const side = next++;
    const usage = next++;
    const assignment = next++;
    lines.push(
      `#${colour} = COLOUR_RGB('',${r},${g},${b});`,
      `#${fill} = FILL_AREA_STYLE_COLOUR('',#${colour});`,
      `#${area} = FILL_AREA_STYLE('',(#${fill}));`,
      `#${side} = SURFACE_STYLE_FILL_AREA(#${area});`,
      `#${usage + 100} = SURFACE_SIDE_STYLE('',(#${side}));`,
      `#${usage} = SURFACE_STYLE_USAGE(.BOTH.,#${usage + 100});`,
      `#${assignment} = PRESENTATION_STYLE_ASSIGNMENT((#${usage}));`,
      `#${next++} = STYLED_ITEM('color',(#${assignment}),#${target});`,
    );
    next += 101;
  };
  style(item, rgb);
  if (face !== undefined) style(face, [0, 0, 1]);
  return step.replace(/ENDSEC;\s*END-ISO/, `${lines.join('\n')}\nENDSEC;\nEND-ISO`);
}

function idOf(step: string, type: string): number {
  const found = step.match(new RegExp(`#(\\d+)\\s*=\\s*${type}\\(`));
  if (found === null) throw new Error(`no ${type} in the file`);
  return Number(found[1]);
}

describe('STEP colours', () => {
  let occt: Occt;
  let step: string;

  beforeAll(async () => {
    occt = await loadOcct();
    const box = occt.makeBox(10, 20, 30);
    const cylinder = occt.makeCylinder(5, 10);
    const both = occt.makeCompound([box, cylinder]);
    step = occt.exportStep(both);
  }, 120_000);

  it('finds nothing in a file without colours', () => {
    expect(parseStepColors(step)).toBeNull();
  });

  it('colours the solid it was given, and only that one', () => {
    const brep = idOf(step, 'MANIFOLD_SOLID_BREP');
    const parsed = parseStepColors(coloured(step, brep, [1, 0, 0]));
    expect(parsed).not.toBeNull();
    if (parsed === null) return;

    const shape = occt.importStep(coloured(step, brep, [1, 0, 0]));
    const colours = coloursOf(occt, shape, parsed);
    expect(colours).not.toBeNull();
    if (colours === null) return;
    expect(colours.length).toBe(occt.subShapeCount(shape, 'face'));
    // The first brep of the file is the box: six red faces, then the cylinder's three with
    // none.
    expect([...colours]).toEqual([...Array(6).fill(0xff0000), ...Array(3).fill(NO_COLOUR)]);
  });

  it('lets a face keep its own colour over its solid', () => {
    const brep = idOf(step, 'MANIFOLD_SOLID_BREP');
    const face = idOf(step, 'ADVANCED_FACE');
    const text = coloured(step, brep, [1, 0, 0], face);
    const parsed = parseStepColors(text);
    if (parsed === null) throw new Error('no colours read');
    const colours = coloursOf(occt, occt.importStep(text), parsed);
    expect(colours?.slice(0, 6)).toEqual(
      Uint32Array.from([0x0000ff, 0xff0000, 0xff0000, 0xff0000, 0xff0000, 0xff0000]),
    );
  });

  it('tells two boxes of one face pattern apart by their order in the file (audit F-056)', () => {
    const small = occt.makeBox(10, 10, 10);
    const tall = occt.translate(occt.makeBox(10, 10, 30), 50, 0, 0);
    const pair = occt.makeCompound([small, tall]);
    let text = occt.exportStep(pair);
    const breps = [...text.matchAll(/#(\d+)\s*=\s*MANIFOLD_SOLID_BREP\(/g)].map((m) =>
      Number(m[1]),
    );
    expect(breps).toHaveLength(2);
    text = coloured(text, breps[0] as number, [0.1, 0.2, 0.8]);
    text = coloured(text, breps[1] as number, [0.8, 0.1, 0.1]);
    const parsed = parseStepColors(text);
    if (parsed === null) throw new Error('no colours read');
    const read = occt.importStep(text);
    const faces = coloursOf(occt, read, parsed);
    if (faces === null) throw new Error('no colours laid');
    // The first six faces are the first box's: all one colour, and not the second box's.
    expect(new Set(faces.slice(0, 6)).size).toBe(1);
    expect(new Set(faces.slice(6)).size).toBe(1);
    expect(faces[0]).not.toBe(faces[6]);
  });
});

describe('colours of an import where shapes cannot be kept', () => {
  // WebKit refuses the file system in a restricted profile, and WebKit on Linux has none: colours
  // must not depend on the shape being written first.
  const stores = {
    'no store': undefined,
    'a store that cannot write': {
      read: async () => null,
      write: async () => {
        throw new Error('The file system would not open.');
      },
    },
  };
  for (const [name, store] of Object.entries(stores)) {
    it(`still has them with ${name}`, async () => {
      const occt = await loadOcct();
      const box = occt.makeBox(10, 20, 30);
      const plain = occt.exportStep(occt.makeCompound([box]));
      const text = coloured(plain, idOf(plain, 'MANIFOLD_SOLID_BREP'), [1, 0, 0]);
      const kernel = await createOcctKernel(store === undefined ? {} : { store });
      const key = textKey(text);
      const read = await kernel.importStep(text, { reuse: true, key });
      expect(read.ok).toBe(true);
      const colours = await kernel.importColours(key);
      expect(colours.ok && colours.value !== null && colours.value !== undefined).toBe(true);
      if (!colours.ok || !colours.value) return;
      expect([...colours.value]).toEqual(Array(6).fill(0xff0000));
    }, 120_000);
  }
});

describe('STEP part names', () => {
  /** A part as a CAD program writes it: the brep says "Body1", the product has the real name. */
  const part = (n: number, product: string) => `
#${n}1=PLANE('',#9);
#${n}2=ADVANCED_FACE('',(#8),#${n}1,.T.);
#${n}3=CLOSED_SHELL('',(#${n}2));
#${n}4=MANIFOLD_SOLID_BREP('Body1',#${n}3);
#${n}5=ADVANCED_BREP_SHAPE_REPRESENTATION('',(#${n}4),#99);
#${n}6=SHAPE_DEFINITION_REPRESENTATION(#${n}7,#${n}5);
#${n}7=PRODUCT_DEFINITION_SHAPE('','',#${n}8);
#${n}8=PRODUCT_DEFINITION('design','',#${n}9,#98);
#${n}9=PRODUCT_DEFINITION_FORMATION('','',#${n}0);
#${n}0=PRODUCT('${product}','${product}','',(#97));`;

  it('names a solid by its product, not by the brep label', () => {
    const { names } = parseStepParts(
      `DATA;${part(2, 'M5x10 BHCS:1')}${part(3, "Bob''s bracket")}ENDSEC;`,
    );
    expect(names?.inOrder.get('p')).toEqual(['M5x10 BHCS:1', "Bob's bracket"]);
  });

  it('leaves out a name the exporter made up, and says nothing for a file with none', () => {
    expect(
      parseStepParts(`DATA;${part(2, 'Open CASCADE STEP translator 7.8 1')}ENDSEC;`).names,
    ).toBeNull();
    expect(parseStepParts('DATA;ENDSEC;').names).toBeNull();
  });
});
