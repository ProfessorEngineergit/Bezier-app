/**
 * What a viewport click picks: anything, faces, edges or bodies. Tab cycles, as in other CAD tools.
 */

export type SelectionFilter = 'any' | 'faces' | 'edges' | 'bodies';

const ORDER: readonly SelectionFilter[] = ['any', 'faces', 'edges', 'bodies'];

export function nextFilter(current: SelectionFilter): SelectionFilter {
  return ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? 'any';
}

export const FILTER_LABEL: Record<SelectionFilter, string> = {
  any: 'Anything',
  faces: 'Faces',
  edges: 'Edges',
  bodies: 'Bodies',
};
