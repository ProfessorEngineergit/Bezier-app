import { describe, expect, it } from 'vitest';
import { CHANNELS, Values } from './channels.js';
import { REACTIONS, type ReactionName } from './reaction-data.js';
import { DECKS, Reactions, type Zone, zoneOf } from './reactions.js';

const names = Object.keys(REACTIONS) as ReactionName[];
const HEAD = ['Kopfschale', 'Kopf', 'Nacken', 'Rumpf', 'Nib'];

/** A dice that cycles through fixed numbers, so a test is the same every time. */
function dice(...numbers: number[]): () => number {
  let i = 0;
  return () => numbers[i++ % numbers.length] ?? 0.5;
}

describe('reaction data', () => {
  it('only asks for channels that exist', () => {
    const known = new Set<string>(CHANNELS);
    for (const name of names)
      for (const [, drives] of REACTIONS[name])
        for (const channel of Object.keys(drives))
          expect(known.has(channel), `${name}: ${channel}`).toBe(true);
  });

  it('lists its steps in time order, starting at zero', () => {
    for (const name of names) {
      const times = REACTIONS[name].map(([time]) => time);
      expect(times[0], name).toBe(0);
      expect(
        [...times].sort((a, b) => a - b),
        name,
      ).toEqual(times);
    }
  });

  it('asks for values a joint can reach', () => {
    for (const name of names)
      for (const [time, drives] of REACTIONS[name])
        for (const [channel, drive] of Object.entries(drives)) {
          const value = typeof drive === 'function' ? drive(time + 0.2) : drive;
          expect(Number.isFinite(value), `${name}: ${channel}`).toBe(true);
          expect(Math.abs(value), `${name}: ${channel}`).toBeLessThan(400);
        }
  });

  it('has every card of every deck', () => {
    for (const zone of Object.keys(DECKS) as Zone[])
      for (const card of DECKS[zone]) expect(names, `${zone}: ${card}`).toContain(card);
  });
});

describe('which part was touched', () => {
  it('reads the node and the joint it hangs on, not the whole ancestry', () => {
    // Every part has the body above it somewhere; the head must still be the head.
    expect(zoneOf(HEAD)).toBe('head');
    expect(zoneOf(['Ohrknopf_L', 'Ohr_L', 'Kopf', 'Nacken', 'Rumpf'])).toBe('ear');
    expect(zoneOf(['Stiftschaft', 'Stift', 'Kopf'])).toBe('pencil');
    expect(zoneOf(['Handfläche_R', 'Hand_R', 'Ellbogen_R', 'Schulter_R', 'Rumpf'])).toBe('hand');
    expect(zoneOf(['Unterarm_L', 'Ellbogen_L', 'Schulter_L', 'Rumpf'])).toBe('hand');
    expect(zoneOf(['Fassung_L', 'Auge_L', 'Kopf', 'Nacken', 'Rumpf'])).toBe('eye');
    expect(zoneOf(['Gesichtsglas', 'Kopf', 'Nacken', 'Rumpf'])).toBe('face');
    expect(zoneOf(['Rumpfschale', 'Rumpf', 'Nib'])).toBe('belly');
    expect(zoneOf(['Schuh_L', 'Fuß_L', 'Hüfte_L', 'Rumpf'])).toBe('foot');
  });
});

describe('what a click answers', () => {
  it('is not one thing: a head gives many different answers', () => {
    const reactions = new Reactions(dice(0.13, 0.71, 0.42, 0.9, 0.28, 0.55));
    const seen = new Set<ReactionName>();
    for (let i = 0; i < 30; i++) seen.add(reactions.click(HEAD, i * 4));
    expect(seen.size).toBeGreaterThanOrEqual(7);
  });

  it('never gives the same answer twice in a row from the same part', () => {
    const reactions = new Reactions();
    let before: ReactionName | null = null;
    for (let i = 0; i < 200; i++) {
      const answer = reactions.click(HEAD, i * 4);
      expect(answer).not.toBe(before);
      before = answer;
    }
  });

  it('answers a hand with something a hand does and a foot with a foot', () => {
    const reactions = new Reactions();
    for (let i = 0; i < 40; i++) {
      expect(DECKS.hand).toContain(reactions.click(['Handfläche_L', 'Hand_L'], i * 4));
      expect(DECKS.foot).toContain(reactions.click(['Schuh_R', 'Fuß_R'], i * 4 + 2));
    }
  });

  it('gets dizzy when poked too often', () => {
    const reactions = new Reactions();
    let last: ReactionName = 'juhu';
    for (let i = 0; i < 6; i++) last = reactions.click(HEAD, 10 + i * 0.3);
    expect(last).toBe('dizzy');
  });

  it('does not get dizzy when the clicks are far apart', () => {
    const reactions = new Reactions();
    let last: ReactionName = 'juhu';
    for (let i = 0; i < 8; i++) last = reactions.click(HEAD, 10 + i * 4);
    expect(last).not.toBe('dizzy');
  });
});

describe('playing', () => {
  it('writes its targets over the idle ones, then ends', () => {
    const reactions = new Reactions();
    const target = new Values();
    target.toRest();
    target.set('yaw', 5);
    reactions.play('spin', 10);
    reactions.apply(10.5, target);
    expect(target.get('yaw')).not.toBe(5);
    expect(reactions.active).toBe(true);
    reactions.apply(13, target);
    expect(reactions.active).toBe(false);
  });

  it('leaves the ground in a hop and lands again', () => {
    const reactions = new Reactions();
    const target = new Values();
    reactions.play('juhu', 0);
    let high = 0;
    for (let t = 0; t < 1.5; t += 1 / 60) {
      reactions.apply(t, target);
      high = Math.max(high, reactions.hop);
      expect(reactions.hop).toBeGreaterThanOrEqual(0);
    }
    expect(high).toBeGreaterThan(0.03);
    reactions.apply(1.5, target);
    expect(reactions.hop).toBe(0);
  });

  it('mirrors a wave onto the other arm', () => {
    const plain = new Reactions();
    const target = new Values();
    plain.play('wave', 0);
    plain.apply(0.3, target);
    expect(target.get('armROut')).toBeGreaterThan(60);
    expect(target.get('armLOut')).toBe(0);

    // A dice below one half mirrors; the others keep the size and speed at their middle.
    const mirrored = new Reactions(dice(0.1, 0.5, 0.5));
    const other = new Values();
    mirrored.play('wave', 0, true);
    mirrored.apply(0.3, other);
    expect(other.get('armLOut')).toBeGreaterThan(60);
    expect(other.get('armROut')).toBe(0);
  });

  it('turns the head the other way when mirrored', () => {
    const plain = new Reactions();
    const a = new Values();
    plain.play('tilt', 0);
    plain.apply(0.4, a);
    const mirrored = new Reactions(dice(0.1, 0.5, 0.5));
    const b = new Values();
    mirrored.play('tilt', 0, true);
    mirrored.apply(0.4, b);
    expect(Math.sign(b.get('neckTilt'))).toBe(-Math.sign(a.get('neckTilt')));
  });

  it('winks one eye and leaves the other', () => {
    const reactions = new Reactions();
    const target = new Values();
    reactions.play('wink', 0);
    reactions.apply(0.2, target);
    expect(target.get('lidCloseL')).toBe(1);
    expect(target.get('lidCloseR')).toBe(0);
  });

  it('plays a varied reaction larger or smaller, never by much', () => {
    const big = new Reactions(dice(0.9, 0.99, 0.5));
    const small = new Reactions(dice(0.9, 0.01, 0.5));
    const a = new Values();
    const b = new Values();
    big.play('wave', 0, true);
    small.play('wave', 0, true);
    big.apply(0.3, a);
    small.apply(0.3, b);
    expect(a.get('armROut')).toBeGreaterThan(b.get('armROut'));
    expect(a.get('armROut') / b.get('armROut')).toBeLessThan(1.5);
  });
});
