/** Curated material families for Visualize. */

import type { PresentationProceduralPattern } from '@bezier/renderer';
import { AMBIENT_MATERIALS } from './ambient-materials.js';
import { GPU_MATERIALS } from './gpu-materials.js';
import { LIGHT_MATERIALS } from './light-materials.js';
import type { MaterialCategory, MaterialPreset } from './material-types.js';
import { POLY_MATERIALS } from './poly-materials.js';

export type { MaterialCategory, MaterialPreset } from './material-types.js';

export const CATEGORIES: readonly MaterialCategory[] = [
  'Plastic',
  'Metal',
  'Wood',
  'Stone',
  'Ceramic',
  'Glass',
  'Rubber',
  'Leather',
  'Textile',
  'Light',
];

const PLASTIC_COLORS = [
  '#ecebe7',
  '#242529',
  '#c83c35',
  '#e17a35',
  '#ddb83f',
  '#6f947d',
  '#416fab',
  '#8c6aa8',
] as const;
const ANODIZED_COLORS = [
  '#252a30',
  '#aeb5bd',
  '#865340',
  '#9d7c35',
  '#315b72',
  '#5e4775',
  '#6e2f35',
] as const;
const CERAMIC_COLORS = ['#eeeae0', '#b7b4aa', '#2b2b2d', '#4d6a65', '#35577b', '#9f4f3b'] as const;
const GLASS_COLORS = ['#ffffff', '#b9dce0', '#bdd1af', '#d4b589', '#a7a9bb', '#747d83'] as const;
const SOFT_COLORS = ['#202124', '#696c70', '#d9d5cb', '#b75c53', '#58778f', '#708a74'] as const;

interface ManufacturedOptions {
  clearcoat?: number;
  grain?: number;
  metalness?: number;
  normalStrength?: number;
  palette?: readonly string[];
  repeat?: number;
  textureScale?: number;
  tintable?: boolean;
  transmission?: number;
}

const manufactured = (
  name: string,
  category: MaterialCategory,
  finish: string,
  color: string,
  roughness: number,
  pattern?: PresentationProceduralPattern,
  options: ManufacturedOptions = {},
): MaterialPreset => ({
  name,
  category,
  finish,
  color,
  roughness,
  metalness: options.metalness ?? 0,
  transmission: options.transmission ?? 0,
  clearcoat: options.clearcoat ?? 0,
  grain: options.grain ?? (pattern === undefined ? 0 : 1),
  textureScale: options.textureScale ?? 1,
  ...(pattern === undefined
    ? {}
    : {
        surface: {
          kind: 'procedural' as const,
          pattern,
          repeat: options.repeat ?? 3,
          normalStrength: options.normalStrength ?? 0.7,
        },
      }),
  ...(options.tintable ? { tintable: true, palette: options.palette } : {}),
});

const photographed = (
  name: string,
  category: Extract<MaterialCategory, 'Wood' | 'Stone' | 'Leather' | 'Textile' | 'Metal'>,
  asset: string,
  roughness: number,
  repeat: number,
  options: {
    clearcoat?: number;
    grain?: number;
    metalness?: number;
    normalStrength?: number;
    source?: string;
  } = {},
): MaterialPreset => ({
  name,
  category,
  finish: 'Photo-scanned',
  color: '#ffffff',
  roughness,
  metalness: options.metalness ?? 0,
  transmission: 0,
  clearcoat: options.clearcoat ?? 0,
  grain: options.grain ?? 1,
  textureScale: 1,
  source: options.source ?? 'Poly Haven · CC0',
  surface: {
    kind: 'texture',
    color: `/materials/${asset}/albedo.jpg`,
    normal: `/materials/${asset}/normal.jpg`,
    roughness: `/materials/${asset}/roughness.jpg`,
    repeat,
    ...(options.normalStrength === undefined ? {} : { normalStrength: options.normalStrength }),
  },
});

const BASE_MATERIALS: readonly MaterialPreset[] = [
  manufactured('ABS', 'Plastic', 'Satin · fine pebble', '#d9d8d4', 0.34, 'abs', {
    clearcoat: 0.18,
    grain: 0.72,
    normalStrength: 0.48,
    palette: PLASTIC_COLORS,
    repeat: 7,
    tintable: true,
  }),
  manufactured('PLA', 'Plastic', 'Matte · print layers', '#d8d5cf', 0.62, 'pla', {
    grain: 0.65,
    normalStrength: 0.28,
    palette: PLASTIC_COLORS,
    repeat: 2,
    tintable: true,
  }),
  manufactured('PETG', 'Plastic', 'Translucent satin', '#8dad9f', 0.28, 'petg', {
    clearcoat: 0.28,
    grain: 0.36,
    normalStrength: 0.3,
    palette: PLASTIC_COLORS,
    repeat: 5,
    tintable: true,
    transmission: 0.08,
  }),
  manufactured('UV Resin', 'Plastic', 'Dense gloss', '#d9d2c1', 0.16, 'resin', {
    clearcoat: 0.72,
    grain: 0.24,
    normalStrength: 0.22,
    palette: PLASTIC_COLORS,
    repeat: 8,
    tintable: true,
    transmission: 0.04,
  }),

  photographed('Micro-scratched Steel', 'Metal', 'metal030', 0.36, 2.6, {
    metalness: 1,
    normalStrength: 0.75,
    source: 'ambientCG · CC0',
  }),
  manufactured('Brushed Aluminium', 'Metal', 'Linear brushed', '#b8bec6', 0.42, 'brushed-metal', {
    grain: 0.72,
    metalness: 1,
    normalStrength: 0.58,
    repeat: 3.5,
  }),
  manufactured('Polished Aluminium', 'Metal', 'Mirror polished', '#dfe2e6', 0.08, undefined, {
    metalness: 1,
  }),
  manufactured('Stainless Steel', 'Metal', 'Fine satin', '#a9adb3', 0.3, 'brushed-metal', {
    grain: 0.32,
    metalness: 1,
    normalStrength: 0.34,
    repeat: 6,
  }),
  manufactured('Titanium', 'Metal', 'Soft satin', '#757c84', 0.36, undefined, { metalness: 1 }),
  manufactured('Anodized Aluminium', 'Metal', 'Dyed satin', '#252a30', 0.34, 'brushed-metal', {
    grain: 0.3,
    metalness: 0.88,
    normalStrength: 0.3,
    palette: ANODIZED_COLORS,
    repeat: 7,
    tintable: true,
  }),
  manufactured('Copper', 'Metal', 'Polished', '#b87852', 0.18, undefined, { metalness: 1 }),
  manufactured('Brass', 'Metal', 'Polished', '#b19b5e', 0.2, undefined, { metalness: 1 }),
  manufactured('Gold', 'Metal', 'Polished', '#d4af37', 0.12, undefined, { metalness: 1 }),
  manufactured('Powder Coat', 'Metal', 'Fine textured paint', '#47515a', 0.5, 'abs', {
    grain: 0.85,
    normalStrength: 0.62,
    palette: PLASTIC_COLORS,
    repeat: 9,
    tintable: true,
  }),

  photographed('American Walnut', 'Wood', 'american_walnut_veneer', 0.52, 1.15, {
    normalStrength: 0.65,
  }),
  photographed('Natural Ash', 'Wood', 'ash_veneer', 0.62, 1.2, { normalStrength: 0.7 }),
  photographed('Lacquered Rosewood', 'Wood', 'rosewood_veneer1', 0.28, 1.05, {
    clearcoat: 0.38,
    normalStrength: 0.55,
  }),
  photographed('Birch Plywood', 'Wood', 'plywood', 0.58, 1.3, { normalStrength: 0.7 }),
  photographed('Weathered Stone', 'Stone', 'rock_01', 0.82, 1.45, { normalStrength: 1.15 }),
  photographed('Brushed Concrete', 'Stone', 'brushed_concrete', 0.88, 1.25, {
    normalStrength: 1.1,
  }),

  manufactured('Glazed Ceramic', 'Ceramic', 'Glazed', '#eeeae0', 0.14, 'ceramic', {
    clearcoat: 0.9,
    grain: 0.18,
    normalStrength: 0.18,
    palette: CERAMIC_COLORS,
    repeat: 7,
    tintable: true,
  }),
  manufactured('Matte Stoneware', 'Ceramic', 'Unglazed', '#aaa297', 0.74, 'stoneware', {
    grain: 0.82,
    normalStrength: 0.72,
    palette: CERAMIC_COLORS,
    repeat: 5,
    tintable: true,
  }),
  manufactured('Clear Glass', 'Glass', 'Clear', '#ffffff', 0.04, undefined, {
    clearcoat: 1,
    palette: GLASS_COLORS,
    tintable: true,
    transmission: 0.96,
  }),
  manufactured('Frosted Glass', 'Glass', 'Etched', '#edf0ee', 0.42, 'resin', {
    clearcoat: 0.25,
    grain: 0.74,
    normalStrength: 0.5,
    palette: GLASS_COLORS,
    repeat: 8,
    tintable: true,
    transmission: 0.9,
  }),
  manufactured('Rubber', 'Rubber', 'Dense matte', '#202124', 0.9, 'rubber', {
    grain: 0.95,
    normalStrength: 0.88,
    palette: SOFT_COLORS,
    repeat: 7,
    tintable: true,
  }),
  manufactured('Silicone', 'Rubber', 'Soft touch', '#737579', 0.8, 'silicone', {
    grain: 0.46,
    normalStrength: 0.42,
    palette: SOFT_COLORS,
    repeat: 6,
    tintable: true,
  }),

  photographed('Vintage Brown Leather', 'Leather', 'brown_leather', 0.7, 2.4, {
    normalStrength: 1.05,
  }),
  photographed('Indigo Denim', 'Textile', 'denim_fabric_03', 0.92, 4.5, {
    normalStrength: 1.25,
  }),
];

const sourced = [...AMBIENT_MATERIALS, ...GPU_MATERIALS, ...POLY_MATERIALS];
const graphite = GPU_MATERIALS.find((material) => material.name === 'Textured Graphite');
export const MATERIALS: readonly MaterialPreset[] = [
  ...BASE_MATERIALS.map((material) => {
    const replacement = sourced.find((source) => source.name === material.name);
    if (replacement) return replacement;
    if (material.name === 'ABS' && graphite?.surface?.kind === 'texture')
      return {
        ...material,
        roughness: 0.58,
        clearcoat: 0,
        source: graphite.source ?? 'GPUOpen · MIT',
        surface: {
          kind: 'texture' as const,
          ...(graphite.surface.normal ? { normal: graphite.surface.normal } : {}),
          normalStrength: graphite.surface.normalStrength ?? 0.5,
          repeat: 3,
        },
      };
    return material;
  }),
  ...sourced.filter((material) => !BASE_MATERIALS.some((base) => base.name === material.name)),
  ...LIGHT_MATERIALS,
];
