import { describe, expect, it } from 'vitest';
import { isSoftwareRenderer } from './capability.js';

describe('software renderers', () => {
  it('are recognised by their names', () => {
    expect(
      isSoftwareRenderer(
        'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)',
      ),
    ).toBe(true);
    expect(isSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(isSoftwareRenderer('Microsoft Basic Render Driver')).toBe(true);
  });

  it('are not mistaken for real graphics chips', () => {
    expect(
      isSoftwareRenderer('ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version)'),
    ).toBe(false);
    expect(isSoftwareRenderer('Mesa Intel(R) UHD Graphics 620 (KBL GT2)')).toBe(false);
    expect(isSoftwareRenderer('')).toBe(false);
  });
});
