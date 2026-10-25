import type {
  EmissionDirection,
  EmissionMode,
  PresentationMaterialSurface,
} from '@bezier/renderer';
export type MaterialCategory =
  | 'Plastic'
  | 'Metal'
  | 'Wood'
  | 'Stone'
  | 'Ceramic'
  | 'Glass'
  | 'Rubber'
  | 'Leather'
  | 'Textile'
  | 'Light';
export interface MaterialPreset {
  name: string;
  category: MaterialCategory;
  finish: string;
  color: string;
  roughness: number;
  metalness: number;
  transmission: number;
  clearcoat: number;
  grain: number;
  textureScale: number;
  surface?: PresentationMaterialSurface;
  tintable?: boolean;
  palette?: readonly string[];
  source?: string;
  preview?: string;
  anisotropy?: number;
  anisotropyRotation?: number;
  ior?: number;
  emission?: number;
  emissionMode?: EmissionMode;
  emissionDirection?: EmissionDirection;
  emissionBeam?: number;
}
