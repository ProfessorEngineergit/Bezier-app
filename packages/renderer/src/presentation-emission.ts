/** A bounded light proxy makes emissive CAD surfaces illuminate the presentation stage. */
import { RectAreaLightTexturesLib } from 'three/addons/lights/RectAreaLightTexturesLib.js';
import {
  type Box3,
  RectAreaLight,
  RectAreaLightNode,
  type Scene,
  SpotLight,
  Vector3,
} from 'three/webgpu';

export type EmissionMode = 'surface' | 'area' | 'spot';
export type EmissionDirection = 'front' | 'back' | 'left' | 'right' | 'up' | 'down';
export interface EmissionSettings {
  /** Relative artistic intensity, not lumens: document coordinates are millimetres. */
  emission?: number;
  emissionMode?: EmissionMode;
  emissionDirection?: EmissionDirection;
  emissionBeam?: number;
  color: string;
}

const DIRECTIONS: Record<EmissionDirection, readonly [number, number, number]> = {
  front: [0, -1, 0],
  back: [0, 1, 0],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  up: [0, 0, 1],
  down: [0, 0, -1],
};
let initialized = false;

export class PresentationEmission {
  readonly area = new RectAreaLight(0xffffff, 0, 1, 1);
  readonly spot = new SpotLight(0xffffff, 0);
  #bounds: Box3 | null = null;
  #settings: EmissionSettings = { color: '#ffffff' };

  constructor(private readonly scene: Scene) {
    // These shared lookup textures are required by both WebGPU and its WebGL fallback.
    if (!initialized) {
      RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init());
      initialized = true;
    }
    this.area.visible = false;
    this.spot.visible = false;
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.bias = -0.001;
    this.spot.penumbra = 0.35;
    scene.add(this.area, this.spot, this.spot.target);
  }

  setBounds(bounds: Box3 | null) {
    this.#bounds = bounds?.clone() ?? null;
    this.update(this.#settings);
  }

  update(settings: EmissionSettings) {
    this.#settings = settings;
    const intensity = Math.max(0, Math.min(settings.emission ?? 0, 20));
    const mode = settings.emissionMode ?? 'surface';
    const box = this.#bounds;
    this.area.visible = box !== null && intensity > 0 && mode === 'area';
    this.spot.visible = box !== null && intensity > 0 && mode === 'spot';
    this.area.intensity = this.area.visible ? intensity : 0;
    this.spot.intensity = 0;
    if (box === null || intensity === 0 || mode === 'surface') return;
    const size = box.getSize(new Vector3());
    const reach = Math.max(size.length(), 0.001);
    const center = box.getCenter(new Vector3());
    const direction = settings.emissionDirection ?? 'front';
    const normal = new Vector3(...DIRECTIONS[direction]);
    const halfExtent =
      (Math.abs(normal.x) * size.x + Math.abs(normal.y) * size.y + Math.abs(normal.z) * size.z) / 2;
    const position = center.clone().addScaledVector(normal, halfExtent + reach * 0.02);
    const target = position.clone().addScaledVector(normal, reach);
    this.area.color.set(settings.color);
    this.area.position.copy(position);
    this.area.up.set(
      0,
      direction === 'up' || direction === 'down' ? 1 : 0,
      direction === 'up' || direction === 'down' ? 0 : 1,
    );
    this.area.lookAt(target);
    this.area.width = Math.max(normal.x === 0 ? size.x : size.y, reach * 0.005);
    this.area.height = Math.max(normal.z === 0 ? size.z : size.y, reach * 0.005);
    this.spot.color.set(settings.color);
    this.spot.position.copy(position);
    this.spot.target.position.copy(target);
    // Inverse-square attenuation must scale with the model, or a millimetre-sized and a
    // metre-sized copy of the same design would have entirely different preview lighting.
    this.spot.intensity = this.spot.visible ? intensity * reach * reach * 0.4 : 0;
    this.spot.distance = reach * 12;
    this.spot.angle = (Math.max(5, Math.min(settings.emissionBeam ?? 35, 100)) * Math.PI) / 360;
    this.spot.shadow.normalBias = reach * 0.001;
    this.spot.shadow.camera.near = reach * 0.001;
    this.spot.shadow.camera.far = this.spot.distance;
    this.spot.shadow.camera.updateProjectionMatrix();
  }

  dispose() {
    this.scene.remove(this.area, this.spot, this.spot.target);
    this.spot.shadow.dispose();
  }
}
