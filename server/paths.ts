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

export function ensureDirs(): void {
  for (const dir of [OUTPUT_DIR, CACHE_DIR, WORK_DIR, FAILED_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
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
