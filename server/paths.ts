import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUTPUT_DIR = path.join(PROJECT_ROOT, 'outputs');
export const CACHE_DIR = path.join(PROJECT_ROOT, '.cache');
/** Per-job frame scratch space; removed on success. */
export const WORK_DIR = path.join(CACHE_DIR, 'work');
/** Retained artifacts from failed exports, deliberately kept out of outputs/. */
export const FAILED_DIR = path.join(CACHE_DIR, 'failed');
/** Uploaded background images. Never inside outputs/, never served from disk directly. */
export const UPLOAD_DIR = path.join(CACHE_DIR, 'backgrounds');

export function ensureDirs(): void {
  for (const dir of [OUTPUT_DIR, CACHE_DIR, WORK_DIR, FAILED_DIR, UPLOAD_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Background image ids are server-generated: a UUID plus a known extension. Anything
 * that does not match exactly is refused, so a request can never name an arbitrary file.
 */
const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$/;

export function isUploadId(id: string): boolean {
  return UPLOAD_ID.test(id);
}

/** Resolve an uploaded background, refusing anything outside the upload directory. */
export function resolveUploadPath(id: string): string {
  if (!isUploadId(id)) throw new Error(`Invalid background image id: "${id}"`);
  const full = path.resolve(UPLOAD_DIR, id);
  const rel = path.relative(UPLOAD_DIR, full);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel) || rel.includes(path.sep)) {
    throw new Error(`Refusing to read outside the background directory: "${id}"`);
  }
  return full;
}

/**
 * Resolve a filename inside outputs/ and refuse anything that escapes it.
 * Defence in depth: the name is already sanitized before it reaches here.
 */
export function resolveOutputPath(filename: string): string {
  const full = path.resolve(OUTPUT_DIR, filename);
  const rel = path.relative(OUTPUT_DIR, full);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel) || rel.includes(path.sep)) {
    throw new Error(`Refusing to write outside the outputs directory: "${filename}"`);
  }
  return full;
}
