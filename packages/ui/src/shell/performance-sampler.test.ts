import { expect, it } from 'vitest';
import { PerformanceSamples } from './performance-sampler.js';

it('retains a real stalled frame and bounds its history without non-finite plot coordinates', () => {
  const samples = new PerformanceSamples();
  samples.sample(100);
  for (const time of [100, 116, 132, 232, 248]) samples.frame(time);
  samples.delay = 80;
  samples.sample(350);
  expect(samples.graph(0).value).toBe(102);
  expect(samples.graph(1).value).toBe(16);
  expect(samples.graph(2).value).toBe(80);
  for (let i = 0; i < 60; i++) {
    samples.frame(350 + i * 250);
    samples.sample(600 + i * 250);
  }
  expect(samples.count).toBe(48);
  for (const metric of [0, 1, 2]) {
    const graph = samples.graph(metric);
    expect(graph.path).not.toMatch(/NaN|Infinity/);
    expect(graph.y).toBeGreaterThan(0);
  }
});

it('captures a stalled interval even when publication precedes the resumed frame', () => {
  const samples = new PerformanceSamples();
  samples.sample(100);
  samples.frame(100);
  samples.frame(116);
  samples.delay = 400;
  samples.sample(550);
  expect(samples.graph(0).value).toBe(434);
  expect(samples.graph(2).value).toBe(400);
  expect(samples.graph(0).y).toBeLessThan(12);
});
