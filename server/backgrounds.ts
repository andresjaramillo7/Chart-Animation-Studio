import fsp from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { UPLOAD_DIR, ensureDirs, isUploadId, resolveUploadPath } from './paths.js';

export const MAX_BACKGROUND_BYTES = 16 * 1024 * 1024;

export interface StoredBackground {
  id: string;
  bytes: number;
  type: 'image/png' | 'image/jpeg';
}

/**
 * Identify an image by its magic bytes rather than by whatever the client claims.
 * Anything that is not a real PNG or JPEG is rejected before it touches the disk.
 */
export function sniffImageType(buffer: Buffer): StoredBackground['type'] | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  return null;
}

/**
 * Store an uploaded background under a server-generated id. The client never chooses
 * the filename, so there is no path to traverse and nothing to overwrite.
 */
export async function storeBackground(buffer: Buffer): Promise<StoredBackground> {
  if (buffer.length === 0) throw new Error('The uploaded background image is empty.');
  if (buffer.length > MAX_BACKGROUND_BYTES) {
    throw new Error(
      `The background image is ${(buffer.length / 1024 / 1024).toFixed(1)} MB; the limit is ` +
        `${MAX_BACKGROUND_BYTES / 1024 / 1024} MB.`,
    );
  }
  const type = sniffImageType(buffer);
  if (!type) throw new Error('Only PNG and JPG background images are supported.');

  ensureDirs();
  const id = `${randomUUID()}.${type === 'image/png' ? 'png' : 'jpg'}`;
  await fsp.writeFile(resolveUploadPath(id), buffer);
  return { id, bytes: buffer.length, type };
}

export async function readBackground(id: string): Promise<{ buffer: Buffer; type: string }> {
  const buffer = await fsp.readFile(resolveUploadPath(id));
  return { buffer, type: id.endsWith('.png') ? 'image/png' : 'image/jpeg' };
}

/** Confirm a referenced background still exists before a job spends time rendering. */
export async function backgroundExists(id: string): Promise<boolean> {
  if (!isUploadId(id)) return false;
  return fsp
    .stat(resolveUploadPath(id))
    .then((s) => s.isFile())
    .catch(() => false);
}

export { UPLOAD_DIR };
