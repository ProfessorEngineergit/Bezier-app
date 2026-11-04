import { describe, expect, it } from 'vitest';
import { unzip, zip } from './formats/zip.js';

describe('a backup of all projects', () => {
  it('reads back what was written, with names and bytes intact', () => {
    const encoder = new TextEncoder();
    const files = [
      { name: 'Bracket.bezier', data: encoder.encode('{"a":1}') },
      { name: 'Gehäuse 2.bezier', data: encoder.encode('{"b":"ü"}') },
      { name: 'Empty.bezier', data: new Uint8Array() },
    ];
    const read = unzip(zip(files));
    expect(read.map((file) => file.name)).toEqual(files.map((file) => file.name));
    expect(read.map((file) => [...file.data])).toEqual(files.map((file) => [...file.data]));
  });

  it('refuses a file that is not one', () => {
    expect(() => unzip(new Uint8Array(40))).toThrow('Not a backup file.');
  });
});
