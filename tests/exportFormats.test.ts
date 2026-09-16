import { describe, it, expect } from 'vitest';
import { validateExportRequest } from '../server/validate.js';
import { sniffImageType } from '../server/backgrounds.js';
import { isUploadId, resolveUploadPath, UPLOAD_DIR } from '../server/paths.js';
import { sanitizeFilename, uniqueFilename } from '../src/shared/filename.js';
import { buildTimeline } from '../src/shared/timeline.js';
import {
  DEFAULT_COMPOSITION,
  supportsTransparency,
  THEMES,
  TRANSPARENT_MP4_MESSAGE,
  type BackgroundSpec,
  type ExportFormat,
} from '../src/shared/types.js';
import path from 'node:path';

const THEME = THEMES['dark-minimal'];
const VALID_ID = '123e4567-e89b-12d3-a456-426614174000.png';

function request(over: Record<string, unknown> = {}) {
  return {
    chart: {
      template: 'animated-bar',
      title: 't',
      subtitle: '',
      data: [{ category: 'A', value: 10 }],
      valueMode: 'percent',
      highlight: null,
      theme: THEME,
    },
    animation: { durationSeconds: 2, holdSeconds: 0.5, easing: 'ease-out', fps: 30 },
    composition: DEFAULT_COMPOSITION,
    format: 'mp4',
    filename: 'x',
    width: 1920,
    height: 1080,
    ...over,
  };
}

const background = (over: Partial<BackgroundSpec> = {}): BackgroundSpec => ({
  mode: 'solid',
  imageId: null,
  fit: 'cover',
  ...over,
});

describe('export format selection', () => {
  it('accepts the three supported formats', () => {
    for (const format of ['mp4', 'png', 'png-sequence'] as ExportFormat[]) {
      expect(validateExportRequest(request({ format })).ok, format).toBe(true);
    }
  });

  it('rejects an unknown format', () => {
    const r = validateExportRequest(request({ format: 'prores' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toMatch(/"format" must be one of/);
  });

  it('knows which formats can carry alpha', () => {
    expect(supportsTransparency('png')).toBe(true);
    expect(supportsTransparency('png-sequence')).toBe(true);
    expect(supportsTransparency('mp4')).toBe(false);
  });
});

describe('transparent + MP4 is refused with an explanation', () => {
  const transparent = { ...DEFAULT_COMPOSITION, background: background({ mode: 'transparent' }) };

  it('rejects the combination rather than flattening it', () => {
    const r = validateExportRequest(request({ format: 'mp4', composition: transparent }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toContain(TRANSPARENT_MP4_MESSAGE);
  });

  it('explains why and what to do instead', () => {
    expect(TRANSPARENT_MP4_MESSAGE).toMatch(/yuv420p/);
    expect(TRANSPARENT_MP4_MESSAGE).toMatch(/PNG/);
  });

  it('allows transparency with the PNG formats', () => {
    expect(validateExportRequest(request({ format: 'png', composition: transparent })).ok).toBe(true);
    expect(validateExportRequest(request({ format: 'png-sequence', composition: transparent })).ok).toBe(true);
  });

  it('allows MP4 with a solid or image background', () => {
    expect(validateExportRequest(request({ format: 'mp4' })).ok).toBe(true);
    const image = { ...DEFAULT_COMPOSITION, background: background({ mode: 'image', imageId: VALID_ID }) };
    expect(validateExportRequest(request({ format: 'mp4', composition: image })).ok).toBe(true);
  });
});

describe('composition validation', () => {
  it('requires a composition', () => {
    const r = validateExportRequest(request({ composition: undefined }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toMatch(/Missing "composition"/);
  });

  it('rejects an unknown background mode or fit', () => {
    const bad = validateExportRequest(
      request({ composition: { ...DEFAULT_COMPOSITION, background: background({ mode: 'stretch' as never }) } }),
    );
    expect(bad.ok).toBe(false);

    const badFit = validateExportRequest(
      request({ composition: { ...DEFAULT_COMPOSITION, background: background({ fit: 'fill' as never }) } }),
    );
    expect(badFit.ok).toBe(false);
    if (!badFit.ok) expect(badFit.errors.join('\n')).toMatch(/"cover" or "contain"/);
  });

  it('requires a real uploaded id in image mode', () => {
    const missing = validateExportRequest(
      request({ composition: { ...DEFAULT_COMPOSITION, background: background({ mode: 'image' }) } }),
    );
    expect(missing.ok).toBe(false);

    const traversal = validateExportRequest(
      request({
        composition: { ...DEFAULT_COMPOSITION, background: background({ mode: 'image', imageId: '../../secret.png' }) },
      }),
    );
    expect(traversal.ok).toBe(false);
    if (!traversal.ok) expect(traversal.errors.join('\n')).toMatch(/id of an uploaded image/);
  });

  it('requires every visibility flag to be a boolean', () => {
    const r = validateExportRequest(
      request({
        composition: { ...DEFAULT_COMPOSITION, show: { ...DEFAULT_COMPOSITION.show, gridlines: 'yes' as never } },
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toMatch(/composition\.show\.gridlines/);
  });
});

describe('background upload safety', () => {
  it('identifies PNG and JPEG by magic bytes', () => {
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
  });

  it('rejects anything that is not a real image, whatever it claims to be', () => {
    expect(sniffImageType(Buffer.from('<?php echo 1; ?>', 'utf8'))).toBeNull();
    expect(sniffImageType(Buffer.from('GIF89a', 'utf8'))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
    // A PNG signature with one byte wrong is not a PNG.
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x46, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull();
  });

  it('only accepts server-generated ids', () => {
    expect(isUploadId(VALID_ID)).toBe(true);
    expect(isUploadId('123e4567-e89b-12d3-a456-426614174000.jpg')).toBe(true);
    expect(isUploadId('../../../etc/passwd')).toBe(false);
    expect(isUploadId('123e4567-e89b-12d3-a456-426614174000.svg')).toBe(false);
    expect(isUploadId('anything.png')).toBe(false);
  });

  it('resolves inside the upload directory and refuses to escape it', () => {
    expect(resolveUploadPath(VALID_ID)).toBe(path.join(UPLOAD_DIR, VALID_ID));
    expect(() => resolveUploadPath('../x.png')).toThrow(/Invalid background image id/);
    expect(() => resolveUploadPath('sub/x.png')).toThrow(/Invalid background image id/);
  });
});

describe('output naming for the new formats', () => {
  it('gives each format its own extension and keeps the name safe', () => {
    expect(sanitizeFilename('my chart', 'fallback', '.png')).toBe('my chart.png');
    expect(sanitizeFilename('../../../etc/passwd', 'fallback', '.png')).toBe('passwd.png');
    expect(sanitizeFilename('shot.png', 'fallback', '.png')).toBe('shot.png');
    // A directory name for a PNG sequence takes no extension.
    expect(sanitizeFilename('..\\..\\run', 'fallback', '')).toBe('run');
    expect(sanitizeFilename('', 'chart-sequence', '')).toBe('chart-sequence');
  });

  it('never overwrites an existing PNG or sequence directory', () => {
    expect(uniqueFilename('shot.png', ['shot.png'])).toBe('shot-1.png');
    expect(uniqueFilename('shot.png', ['shot.png', 'shot-1.png'])).toBe('shot-2.png');
    expect(uniqueFilename('run-frames', ['run-frames'])).toBe('run-frames-1');
    expect(uniqueFilename('run-frames', ['run-frames', 'run-frames-1'])).toBe('run-frames-2');
  });

  it('still behaves exactly as before for MP4', () => {
    expect(sanitizeFilename('comeback-curve')).toBe('comeback-curve.mp4');
    expect(uniqueFilename('a.mp4', ['a.mp4'])).toBe('a-1.mp4');
  });
});

describe('PNG sequence frame counts', () => {
  it('writes one frame per timeline frame, hold included', () => {
    const t = buildTimeline({ durationSeconds: 3, holdSeconds: 1, easing: 'linear', fps: 30 });
    expect(t.animationFrames).toBe(90);
    expect(t.holdFrames).toBe(30);
    expect(t.totalFrames).toBe(120);
  });

  it('matches the MP4 frame count for the same settings', () => {
    for (const [d, h] of [
      [2, 0.5],
      [1.5, 0.5],
      [2.51, 0.52],
    ]) {
      const t = buildTimeline({ durationSeconds: d, holdSeconds: h, easing: 'ease-out', fps: 30 });
      expect(t.totalFrames).toBe(Math.round(d * 30) + Math.max(1, Math.round(h * 30)));
    }
  });

  it('captures exactly one frame for a single PNG, whatever the timeline length', () => {
    // Mirrors the exporter's captureCount rule.
    const captureCount = (format: ExportFormat, frames: number) => (format === 'png' ? 1 : frames);
    const t = buildTimeline({ durationSeconds: 2, holdSeconds: 0.5, easing: 'linear', fps: 30 });
    expect(captureCount('png', t.totalFrames)).toBe(1);
    expect(captureCount('png-sequence', t.totalFrames)).toBe(75);
    expect(captureCount('mp4', t.totalFrames)).toBe(75);
  });
});
