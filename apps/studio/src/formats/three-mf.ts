/**
 * 3MF, the mesh format slicers prefer over STL: it carries its unit (no 25.4x scale errors) and
 * keeps each body as a separate object.
 */

import { zip } from './zip.js';

export interface MeshObject {
  name: string;
  /** xyz triples, millimetres. */
  positions: Float32Array;
  /** Triangle indices into `positions`. */
  indices: Uint32Array;
  /** Its colour as `#RRGGBB`, if it has one of its own. */
  colour?: string;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`;

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Number precision: a micrometre is finer than any printer. */
function number(value: number): string {
  return String(Math.round(value * 10000) / 10000);
}

export function modelXml(objects: readonly MeshObject[]): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    '  <resources>',
  ];
  // One material per coloured body; slicers offer these as the filaments to start from.
  const materials = objects.length + 1;
  const coloured = objects.filter((object) => object.colour !== undefined);
  if (coloured.length > 0) {
    lines.push(`    <basematerials id="${materials}">`);
    for (const { name, colour } of coloured) {
      lines.push(`      <base name="${escapeXml(name)}" displaycolor="${colour}"/>`);
    }
    lines.push('    </basematerials>');
  }
  objects.forEach((object, index) => {
    const material = coloured.indexOf(object);
    const paint = material === -1 ? '' : ` pid="${materials}" pindex="${material}"`;
    lines.push(
      `    <object id="${index + 1}" name="${escapeXml(object.name)}" type="model"${paint}>`,
    );
    lines.push('      <mesh>', '        <vertices>');
    for (let i = 0; i + 2 < object.positions.length; i += 3) {
      lines.push(
        `          <vertex x="${number(object.positions[i] ?? 0)}" y="${number(object.positions[i + 1] ?? 0)}" z="${number(object.positions[i + 2] ?? 0)}"/>`,
      );
    }
    lines.push('        </vertices>', '        <triangles>');
    for (let i = 0; i + 2 < object.indices.length; i += 3) {
      lines.push(
        `          <triangle v1="${object.indices[i]}" v2="${object.indices[i + 1]}" v3="${object.indices[i + 2]}"/>`,
      );
    }
    lines.push('        </triangles>', '      </mesh>', '    </object>');
  });
  lines.push('  </resources>', '  <build>');
  objects.forEach((_, index) => {
    lines.push(`    <item objectid="${index + 1}"/>`);
  });
  lines.push('  </build>', '</model>', '');
  return lines.join('\n');
}

export function threeMf(objects: readonly MeshObject[]): Uint8Array {
  const encoder = new TextEncoder();
  return zip([
    { name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: encoder.encode(RELS) },
    { name: '3D/3dmodel.model', data: encoder.encode(modelXml(objects)) },
  ]);
}
