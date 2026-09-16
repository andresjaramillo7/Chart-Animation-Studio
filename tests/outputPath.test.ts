import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { resolveOutputPath, OUTPUT_DIR } from '../server/paths.js';
import { sanitizeFilename, uniqueFilename } from '../src/shared/filename.js';

describe('resolveOutputPath', () => {
  it('resolves a plain filename inside outputs/', () => {
    expect(resolveOutputPath('a.mp4')).toBe(path.join(OUTPUT_DIR, 'a.mp4'));
  });

  it('refuses anything that escapes outputs/', () => {
    expect(() => resolveOutputPath('../a.mp4')).toThrow(/outside the outputs directory/);
    expect(() => resolveOutputPath('sub/a.mp4')).toThrow(/outside the outputs directory/);
    expect(() => resolveOutputPath('..\\..\\a.mp4')).toThrow(/outside the outputs directory/);
    expect(() => resolveOutputPath('C:\\Windows\\a.mp4')).toThrow(/outside the outputs directory/);
  });
});

describe('sanitize + unique, as the exporter combines them', () => {
  it('turns hostile input into a safe, non-colliding name inside outputs/', () => {
    const safe = sanitizeFilename('../../../Windows/System32/comeback');
    const final = uniqueFilename(safe, ['comeback.mp4']);
    expect(final).toBe('comeback-1.mp4');
    expect(resolveOutputPath(final)).toBe(path.join(OUTPUT_DIR, 'comeback-1.mp4'));
  });
});
