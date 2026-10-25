import { describe, expect, it, vi } from 'vitest';
import { deviceProblem } from './devices.js';

const refused = (name: string) => new DOMException('raw browser text', name);

describe('why a camera or microphone did not come on', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  it('says what to do when access was refused, and never shows the raw text', () => {
    const text = deviceProblem('camera', refused('NotAllowedError'));
    expect(text).toContain('privacy settings');
    expect(text).not.toContain('raw browser text');
  });

  it('says when there is no device, or another app has it', () => {
    expect(deviceProblem('camera', refused('NotFoundError'))).toBe('No camera was found.');
    expect(deviceProblem('microphone', refused('NotReadableError'))).toBe(
      'The microphone is in use by another app.',
    );
  });

  it('treats anything unknown as a refusal', () => {
    expect(deviceProblem('microphone', new Error('boom'))).toContain('privacy settings');
  });
});
