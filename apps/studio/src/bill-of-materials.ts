/**
 * Bill of materials as CSV: one line per distinct part with its count. Parts are the same when
 * volume and surface area match to a hundredth (copies, patterns, mirrors); a line is named after
 * the first of them.
 */
import type { BodySummary, StableRef } from '@bezier/core';
import type { MassProperties } from '@bezier/kernel';

export interface BomLine {
  name: string;
  quantity: number;
  volume: number;
  area: number;
  bodies: string[];
}

export async function billOfMaterials(
  bodies: readonly BodySummary[],
  measure: (faces: readonly StableRef[]) => Promise<MassProperties | null>,
): Promise<BomLine[]> {
  const lines = new Map<string, BomLine>();
  for (const body of bodies) {
    if (body.hidden) continue;
    const mass = await measure(body.faces);
    if (mass === null) continue;
    const volume = Math.abs(mass.volume);
    const key = `${volume.toFixed(2)}|${mass.area.toFixed(2)}`;
    const line = lines.get(key);
    if (line === undefined)
      lines.set(key, {
        name: body.label,
        quantity: 1,
        volume,
        area: mass.area,
        bodies: [body.label],
      });
    else {
      line.quantity += 1;
      line.bodies.push(body.label);
    }
  }
  return [...lines.values()];
}

const cell = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function bomCsv(lines: readonly BomLine[]): string {
  const rows = [
    ['Item', 'Name', 'Quantity', 'Volume (mm³)', 'Surface (mm²)', 'Bodies'],
    ...lines.map((line, i) => [
      i + 1,
      line.name,
      line.quantity,
      line.volume.toFixed(2),
      line.area.toFixed(2),
      line.bodies.join('; '),
    ]),
  ];
  return `${rows.map((row) => row.map(cell).join(',')).join('\n')}\n`;
}
