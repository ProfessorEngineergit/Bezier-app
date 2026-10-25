import { describe, expect, it } from 'vitest';
import { checkText } from './text-filter.js';

const blocklist = ['badword', 'two words'];

describe('checkText', () => {
  it('lets ordinary titles through', () => {
    expect(checkText('Extrude a box, then fillet the edges', blocklist, 'title')).toBeNull();
  });

  it('catches a listed word through accents, digits and case', () => {
    expect(checkText('BÄDWORD', blocklist, 'title')).not.toBeNull();
    expect(checkText('b4dw0rd', blocklist, 'title')).not.toBeNull();
    expect(checkText('some two   words here', blocklist, 'title')).not.toBeNull();
  });

  it('matches whole words only', () => {
    expect(checkText('badwords are not the word', blocklist, 'title')).toBeNull();
  });

  it('refuses links and addresses', () => {
    for (const text of [
      'https://evil.example',
      'visit www.x.y',
      'buy at shop.com',
      'me@mail.org',
    ]) {
      expect(checkText(text, [], 'description')).toContain('link');
    }
  });

  it('refuses hidden characters but allows line breaks', () => {
    expect(checkText('safe‮txt', [], 'title')).toContain('hidden');
    expect(checkText('one\nline two', [], 'description')).toBeNull();
  });
});
