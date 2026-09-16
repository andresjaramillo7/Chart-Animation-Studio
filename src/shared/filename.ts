/**
 * Turn arbitrary user input into a safe, single-segment output name.
 * Strips directory separators, traversal sequences, control characters and
 * Windows-reserved names so a request can never escape the outputs/ directory.
 */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const KNOWN_EXTENSION = /\.(mp4|png|jpe?g)$/i;

/**
 * `extension` is appended to the cleaned name. Pass '' for a name that is a directory
 * (a PNG sequence folder) rather than a file.
 */
export function sanitizeFilename(input: string, fallback = 'chart-animation', extension = '.mp4'): string {
  let name = (input ?? '').toString();

  // Drop any path component the user typed; only the last segment is considered.
  name = name.split(/[\\/]/).pop() ?? '';
  name = name.replace(KNOWN_EXTENSION, '');
  // Strip control chars and characters that are illegal or ambiguous on Windows.
  name = name.replace(/[\x00-\x1f\x7f<>:"|?*]/g, '');
  // Collapse traversal dots and whitespace runs.
  name = name.replace(/\.{2,}/g, '.');
  name = name.replace(/\s+/g, ' ').trim();
  name = name.replace(/[^A-Za-z0-9._ \-()]/g, '');
  name = name.replace(/^[.\- ]+/, '').replace(/[.\- ]+$/, '');

  if (!name || WINDOWS_RESERVED.test(name)) name = fallback;
  if (name.length > 120) name = name.slice(0, 120).trimEnd();

  return `${name}${extension}`;
}

/**
 * Given a desired name and the names already present, return one that does not
 * collide. Existing files and directories are never overwritten.
 */
export function uniqueFilename(desired: string, existing: Iterable<string>): string {
  const taken = new Set(Array.from(existing, (n) => n.toLowerCase()));
  if (!taken.has(desired.toLowerCase())) return desired;

  const dot = desired.lastIndexOf('.');
  const base = dot > 0 ? desired.slice(0, dot) : desired;
  const ext = dot > 0 ? desired.slice(dot) : '';

  for (let n = 1; n < 10000; n++) {
    const candidate = `${base}-${n}${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base}-${Date.now()}${ext}`;
}
