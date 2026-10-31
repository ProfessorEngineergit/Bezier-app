import { describe, expect, it } from 'vitest';
import { accelerationOf } from './glass-fallback.js';

const RTX =
  'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E0) Direct3D11 vs_5_0 ps_5_0, D3D11)';
const IRIS =
  'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x000046A6) Direct3D11 vs_5_0 ps_5_0, D3D11)';
const WARP =
  'ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11)';
const SWIFTSHADER =
  'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';

describe('whether the machine draws with graphics acceleration', () => {
  it('trusts a context that refuses a performance caveat, unless the adapter is a software one', () => {
    expect(accelerationOf(true, RTX)).toBe(true);
    expect(accelerationOf(true, '')).toBe(true);
    expect(accelerationOf(true, SWIFTSHADER)).toBe(false);
    expect(accelerationOf(true, 'Mesa llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(false);
  });

  it('believes a named Windows adapter even when the caveat check said no', () => {
    // A laptop with two graphics chips failed the check with the GPU working, and kept plain panels.
    expect(accelerationOf(false, RTX)).toBe(true);
    expect(accelerationOf(false, IRIS)).toBe(true);
  });

  it('still says no to software behind a failed check', () => {
    expect(accelerationOf(false, WARP)).toBe(false);
    expect(accelerationOf(false, SWIFTSHADER)).toBe(false);
    expect(accelerationOf(false, '')).toBe(false);
  });

  it('leaves macOS and Linux as they were: a failed check there is a no', () => {
    expect(accelerationOf(false, 'Apple GPU')).toBe(false);
    expect(accelerationOf(false, 'Mesa Intel(R) UHD Graphics 620 (KBL GT2)')).toBe(false);
    expect(accelerationOf(false, 'NVIDIA GeForce GTX 1650/PCIe/SSE2')).toBe(false);
  });
});
