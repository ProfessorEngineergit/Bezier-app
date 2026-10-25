import { Color, Vector4 } from 'three';
import type { GridPlane } from './helpers.js';

/**
 * Draws where the grid plane cuts a part as a line in the colour of the plane's normal axis (blue
 * for the ground, like Z), so the grid reads as passing through the part.
 */
const AXIS: Record<GridPlane, string> = { YZ: '#e5484d', XZ: '#30a46c', XY: '#0a84ff' };
const STRENGTH = 0.75;

/** Uniforms change only on preferences, never on a camera movement or a geometry rebuild. */
export class DatumLine {
  readonly plane = { value: new Vector4(0, 0, 1, 0) };
  readonly strength = { value: STRENGTH };
  /** The colour of the plane's normal axis, used for the line. */
  readonly colour = { value: new Color(AXIS.XY) };
  setPlane(plane: GridPlane): void {
    this.plane.value.set(plane === 'YZ' ? 1 : 0, plane === 'XZ' ? 1 : 0, plane === 'XY' ? 1 : 0, 0);
    this.colour.value.set(AXIS[plane]);
  }
  setVisible(visible: boolean): void {
    this.strength.value = visible ? STRENGTH : 0;
  }
}

export const DATUM_FRAGMENT = `
float datumDistance = dot(vec4(vBodyPosition, 1.0), uDatumPlane);
// A line a pixel and a half wide however far away: the width follows the screen, not the part.
float datumWidth = max(fwidth(datumDistance) * 1.5, 1e-6);
float datumCrossing = 1.0 - abs(dot(normalize(vBodyNormal), uDatumPlane.xyz));
// Coplanar faces must remain solid, rather than becoming an entirely tinted plane.
float datumLine = (1.0 - smoothstep(datumWidth * 0.25, datumWidth, abs(datumDistance)))
  * smoothstep(0.001, 0.03, datumCrossing);
diffuseColor.rgb = mix(diffuseColor.rgb, uDatumColour, datumLine * uDatumStrength);
`;
