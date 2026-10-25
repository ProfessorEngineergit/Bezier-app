/** Product-light finishes are authored presets, not downloaded texture assets. */
import type { MaterialPreset } from './material-types.js';

const COLORS = ['#fff0d2', '#ffffff', '#dcecff', '#ff3428', '#50ff72', '#437bff'] as const;
const light = (name: string, color: string, emission: number, spot = false): MaterialPreset => ({
  name,
  category: 'Light',
  finish: spot ? 'Focused beam' : 'Opal diffuser',
  color,
  roughness: 0.38,
  metalness: 0,
  transmission: 0,
  clearcoat: 0,
  grain: 0,
  textureScale: 1,
  tintable: true,
  palette: COLORS,
  emission,
  emissionMode: spot ? 'spot' : 'area',
  emissionDirection: 'front',
  emissionBeam: 35,
});

export const LIGHT_MATERIALS: readonly MaterialPreset[] = [
  light('Warm LED', '#fff0d2', 4),
  light('Cool LED', '#dcecff', 4),
  light('LED Strip', '#ffffff', 6),
  light('Warm LED Strip', '#ffe3b6', 6),
  light('Red LED', '#ff3428', 3),
  light('Green LED', '#50ff72', 3),
  light('Blue LED', '#437bff', 3),
  light('Headlight', '#e5eeff', 8, true),
];
