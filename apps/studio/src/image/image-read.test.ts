import { describe, expect, it } from 'vitest';
import {
  extensionOf,
  fitWithin,
  fromBase64,
  IMAGE_EXTENSIONS,
  looksLikeImage,
  mimeOf,
  toBase64,
} from './image-read.js';

describe('which files are pictures', () => {
  it('takes every picture format the list names, in any case, and leaves drawings and models', () => {
    for (const extension of IMAGE_EXTENSIONS)
      expect(looksLikeImage(`Photo${extension.toUpperCase()}`), extension).toBe(true);
    for (const name of ['part.step', 'part.stl', 'plan.dxf', 'logo.svg', 'notes.txt', 'png'])
      expect(looksLikeImage(name), name).toBe(false);
  });

  it('takes a file by its type when the name says nothing, but never an SVG', () => {
    expect(looksLikeImage('IMG_0001', 'image/heic')).toBe(true);
    expect(looksLikeImage('drawing', 'image/svg+xml')).toBe(false);
    expect(looksLikeImage('drawing.SVG', 'image/png')).toBe(false);
  });

  it('knows the type of a name, and trusts a type that says it is a picture', () => {
    expect(mimeOf('a.JPG')).toBe('image/jpeg');
    expect(mimeOf('a.tiff')).toBe('image/tiff');
    expect(mimeOf('a.bin', 'image/png')).toBe('image/png');
    expect(mimeOf('a.bin', 'application/octet-stream')).toBe('');
    expect(extensionOf('archive.tar.gz')).toBe('gz');
    expect(extensionOf('noext')).toBe('');
  });
});

describe('how large a picture is kept', () => {
  it('keeps a small picture as it is and brings a large one down on its longer side', () => {
    expect(fitWithin(800, 600, 3072)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(6144, 3072, 3072)).toEqual({ width: 3072, height: 1536 });
    expect(fitWithin(1000, 8000, 4000)).toEqual({ width: 500, height: 4000 });
    expect(fitWithin(20000, 1, 3072).height).toBe(1);
  });
});

describe('base64', () => {
  it('round-trips bytes, including a long run', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => (i * 31) % 256);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    expect(toBase64(new Uint8Array([104, 105]))).toBe('aGk=');
  });
});
