/**
 * Turns channel values into node transforms. A port of the film's rig (forward kinematics only):
 * Nib has no bones, every joint is an empty node and every part a rigid shell on one, so posing him
 * is setting a rotation (and for a few joints a position) per node. No skinning, no animation clips.
 */

import { type Object3D, Quaternion, Vector3 } from 'three';
import type { Values } from './channels.js';
import { addModelOffset, gltfEuler, modelAxis, modelEuler, toGltfRotation } from './rig-math.js';

/** Where the lids pivot, behind the lens (metres, model space), and how far a lid turns to shut. */
const LID_CENTRE = new Vector3(0, 0, -0.045);
const LID_SHUT = 61;
const CHEEK_MAX = 36;
const LEG = 0.0355;
const HIP = new Vector3(0, 0, -0.042);

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** three.js turns spaces in node names into underscores. */
const nodeName = (name: string): string => name.replace(/ /g, '_');

const q = new Quaternion();
const qt = new Quaternion();
const qc = new Quaternion();
const hip = new Vector3();
const pivot = new Vector3();
const shifted = new Vector3();

export class NibRig {
  readonly #nodes = new Map<string, Object3D>();
  readonly #rest = new Map<string, Vector3>();
  readonly #root: Object3D;

  constructor(root: Object3D) {
    this.#root = root;
    root.traverse((node) => {
      this.#nodes.set(node.name, node);
      this.#rest.set(node.name, node.position.clone());
    });
  }

  /** A node by the name it has in the model ("Lid L"), or null when this model lacks it. */
  node(name: string): Object3D | null {
    return this.#nodes.get(nodeName(name)) ?? null;
  }

  #rotate(name: string, x: number, y: number, z: number): Object3D | null {
    const node = this.node(name);
    if (node !== null) gltfEuler(x, y, z, node.quaternion);
    return node;
  }

  #place(name: string, x: number, y: number, z: number): void {
    const node = this.node(name);
    const rest = this.#rest.get(nodeName(name));
    if (node !== null && rest !== undefined) addModelOffset(node.position, x, y, z, rest);
  }

  /** One lid or lower lid: it turns about a point behind the lens, so it also has to move. */
  #lid(name: string, tilt: number, shut: number): void {
    const node = this.node(name);
    if (node === null) return;
    modelAxis('z', tilt, qt);
    modelAxis('x', shut, qc);
    q.copy(qt).multiply(qc);
    toGltfRotation(q);
    node.quaternion.copy(q);
    // position = Rt * (C - Rc * C), then into glTF's axes
    shifted.copy(LID_CENTRE).sub(pivot.copy(LID_CENTRE).applyQuaternion(qc)).applyQuaternion(qt);
    node.position.set(shifted.x, shifted.z, -shifted.y);
  }

  apply(v: Values): void {
    const root = this.#root.children[0];
    const nib = this.node('Nib') ?? root;
    if (nib !== undefined) {
      gltfEuler(0, 0, v.get('yaw'), nib.quaternion);
      const rest = this.#rest.get(nib.name);
      if (rest !== undefined)
        addModelOffset(nib.position, v.get('posX'), v.get('posY'), v.get('posZ'), rest);
    }
    // The body turns about the hips, so turning it also moves it.
    const pitch = v.get('bodyPitch');
    const roll = v.get('bodyRoll');
    const twist = v.get('bodyTwist');
    modelEuler(pitch, roll, twist, q);
    hip.copy(HIP).applyQuaternion(q);
    this.#rotate('Rumpf', pitch, roll, twist);
    this.#place('Rumpf', HIP.x - hip.x, HIP.y - hip.y, HIP.z - hip.z + v.get('bodyZ'));
    this.#rotate('Nacken', v.get('neckNod'), v.get('neckTilt'), v.get('neckTurn'));

    const tilt = v.get('lidTilt');
    const closeBoth = v.get('lidClose');
    const shutL = clamp(closeBoth + v.get('lidCloseL'), -0.25, 1) * LID_SHUT;
    const shutR = clamp(closeBoth + v.get('lidCloseR'), -0.25, 1) * LID_SHUT;
    const cheek = -CHEEK_MAX * clamp(v.get('cheek'), 0, 1);
    this.#lid('Lid L', -tilt, shutL);
    this.#lid('Lid R', tilt, shutR);
    this.#lid('Unterlid L', tilt * 0.5, cheek);
    this.#lid('Unterlid R', -tilt * 0.5, cheek);

    const finger = v.get('finger');
    for (const side of ['L', 'R'] as const) {
      const sx = side === 'L' ? 1 : -1;
      const arm = (part: 'Fwd' | 'Out' | 'Twist' | 'Bend' | 'BendOut'): number =>
        v.get(`arm${side}${part}`);
      const leg = (part: 'Swing' | 'Spread' | 'Ext'): number => v.get(`leg${side}${part}`);
      this.#rotate(`Schulter ${side}`, -arm('Fwd'), -arm('Out') * sx, arm('Twist') * sx);
      this.#rotate(`Ellbogen ${side}`, -arm('Bend'), -arm('BendOut') * sx, 0);
      this.#rotate(`Hüfte ${side}`, -leg('Swing'), -leg('Spread') * sx, 0);
      const foot = this.node(`Fuß ${side}`);
      if (foot !== null) {
        foot.quaternion.identity();
        foot.position.set(0, -(LEG + leg('Ext')), 0);
      }
      for (let i = 0; i < 3; i++) {
        if (i < 2) this.#rotate(`Finger ${side} ${i}`, -finger, i === 0 ? 5 : -5, 0);
        else this.#rotate(`Finger ${side} ${i}`, -finger * 0.6, 52 * sx, 0);
        this.#rotate(`Fingerspitze ${side} ${i}`, -finger * 1.1, 0, 0);
      }
    }
  }
}
