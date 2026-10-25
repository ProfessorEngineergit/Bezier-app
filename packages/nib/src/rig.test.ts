import { Object3D, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Values } from './channels.js';
import { NibRig } from './rig.js';

/** A tree with the joints the rig drives, named as three.js names them (spaces become underscores). */
function tiny(): Object3D {
  const make = (
    name: string,
    parent: Object3D,
    at: [number, number, number] = [0, 0, 0],
  ): Object3D => {
    const node = new Object3D();
    node.name = name;
    node.position.set(...at);
    parent.add(node);
    return node;
  };
  const scene = new Object3D();
  const nib = make('Nib', scene);
  const body = make('Rumpf', nib, [0, 0.07, 0]);
  const neck = make('Nacken', body, [0, 0.05, 0]);
  const head = make('Kopf', neck, [0, 0.1, 0]);
  for (const side of ['L', 'R']) {
    const eye = make(`Auge_${side}`, head, [side === 'L' ? 0.04 : -0.04, 0, 0.05]);
    make(`Lid_${side}`, eye);
    make(`Unterlid_${side}`, eye);
    make(`Schulter_${side}`, body);
    make(`Ellbogen_${side}`, body);
    make(`Hüfte_${side}`, body);
    make(`Fuß_${side}`, body);
  }
  return scene;
}

const angleOf = (node: Object3D | null): number =>
  node === null ? Number.NaN : (node.quaternion.angleTo(new Quaternion()) * 180) / Math.PI;

describe('the rig', () => {
  it("shuts the lids by the film's sixty-one degrees", () => {
    const rig = new NibRig(tiny());
    const v = new Values();
    v.toRest();
    v.set('lidClose', 1);
    rig.apply(v);
    expect(angleOf(rig.node('Lid L'))).toBeCloseTo(61, 3);
    expect(angleOf(rig.node('Lid R'))).toBeCloseTo(61, 3);
  });

  it('moves a lid as well as turning it, because it pivots behind the lens', () => {
    const rig = new NibRig(tiny());
    const v = new Values();
    v.toRest();
    v.set('lidClose', 1);
    rig.apply(v);
    expect(rig.node('Lid L')?.position.length() ?? 0).toBeGreaterThan(0.01);
  });

  it('extends a leg by moving the foot down by exactly that much', () => {
    const rig = new NibRig(tiny());
    const v = new Values();
    v.toRest();
    rig.apply(v);
    const short = rig.node('Fuß L')?.position.y ?? 0;
    v.set('legLExt', 0.01);
    rig.apply(v);
    expect(short - (rig.node('Fuß L')?.position.y ?? 0)).toBeCloseTo(0.01, 6);
  });

  it('turns the neck about the vertical axis for a positive turn', () => {
    const rig = new NibRig(tiny());
    const v = new Values();
    v.toRest();
    v.set('neckTurn', 30);
    rig.apply(v);
    const ahead = new Vector3(0, 0, 1).applyQuaternion(
      rig.node('Nacken')?.quaternion ?? new Quaternion(),
    );
    expect(ahead.x).toBeGreaterThan(0.4);
    expect(ahead.y).toBeCloseTo(0, 6);
  });

  it('turns the body about the hips, so the body moves when it leans', () => {
    const rig = new NibRig(tiny());
    const v = new Values();
    v.toRest();
    const upright = rig.node('Rumpf')?.position.clone() ?? new Vector3();
    v.set('bodyPitch', 20);
    rig.apply(v);
    expect(rig.node('Rumpf')?.position.distanceTo(upright) ?? 0).toBeGreaterThan(0.0001);
  });

  it('raises the whole figure for a hop', () => {
    const rig = new NibRig(tiny());
    const v = new Values();
    v.toRest();
    v.set('posZ', 0.04);
    rig.apply(v);
    expect(rig.node('Nib')?.position.y).toBeCloseTo(0.04, 6);
  });

  it('copes with a model that lacks joints', () => {
    const rig = new NibRig(new Object3D());
    const v = new Values();
    v.toRest();
    expect(() => rig.apply(v)).not.toThrow();
  });
});
