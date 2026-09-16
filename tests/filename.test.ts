import { describe, it, expect } from 'vitest';
import { sanitizeFilename, uniqueFilename } from '../src/shared/filename.js';

describe('sanitizeFilename', () => {
  it('appends .mp4 and leaves a clean name alone', () => {
    expect(sanitizeFilename('comeback-curve')).toBe('comeback-curve.mp4');
    expect(sanitizeFilename('comeback-curve.mp4')).toBe('comeback-curve.mp4');
  });

  it('strips directory components and traversal sequences', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd.mp4');
    expect(sanitizeFilename('..\\..\\Windows\\System32\\evil')).toBe('evil.mp4');
    expect(sanitizeFilename('C:\\Users\\me\\video')).toBe('video.mp4');
    expect(sanitizeFilename('..')).toBe('chart-animation.mp4');
    expect(sanitizeFilename('....//..')).toBe('chart-animation.mp4');
  });

  it('removes characters that are illegal on Windows', () => {
    expect(sanitizeFilename('bad:name?*<>|"')).toBe('badname.mp4');
    expect(sanitizeFilename('null\u0000byte')).toBe('nullbyte.mp4');
  });

  it('falls back for empty and Windows-reserved names', () => {
    expect(sanitizeFilename('')).toBe('chart-animation.mp4');
    expect(sanitizeFilename('   ')).toBe('chart-animation.mp4');
    expect(sanitizeFilename('CON')).toBe('chart-animation.mp4');
    expect(sanitizeFilename('nul.mp4')).toBe('chart-animation.mp4');
  });

  it('caps very long names', () => {
    const name = sanitizeFilename('x'.repeat(500));
    expect(name.length).toBeLessThanOrEqual(124);
    expect(name.endsWith('.mp4')).toBe(true);
  });
});

describe('uniqueFilename', () => {
  it('returns the desired name when nothing collides', () => {
    expect(uniqueFilename('a.mp4', ['b.mp4'])).toBe('a.mp4');
  });

  it('never overwrites an existing output', () => {
    expect(uniqueFilename('a.mp4', ['a.mp4'])).toBe('a-1.mp4');
    expect(uniqueFilename('a.mp4', ['a.mp4', 'a-1.mp4', 'a-2.mp4'])).toBe('a-3.mp4');
  });

  it('treats collisions case-insensitively, matching Windows filesystems', () => {
    expect(uniqueFilename('Chart.mp4', ['chart.mp4'])).toBe('Chart-1.mp4');
  });
});
