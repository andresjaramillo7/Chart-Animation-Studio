import { DATA_SCHEMES, DEFAULT_DATA_SCHEME, type DataSchemeId } from './brand.js';
import type { ChartSpec, Theme } from './types.js';

/**
 * Resolving data colours from a theme and a scheme.
 *
 * The default scheme deliberately derives from the *theme's* own neutral ramp rather
 * than from a fixed brand list, so switching theme restyles the data while switching
 * scheme changes only the data colours. The two axes stay independent.
 */

export interface DataColors {
  /** Colour per data index. Index N always gets colour N, for every frame. */
  series: string[];
  /** Colour for an intentionally emphasized datum. */
  highlight: string;
  /** Low-to-high ramp for continuous scales. */
  sequential: string[];
}

/**
 * Colours for `count` data items.
 *
 * `neutral-red` (the default) uses the theme's ramp, so a theme keeps its own look;
 * every other scheme is an explicit semantic choice and uses its own fixed colours.
 */
export function dataColors(theme: Theme, scheme: DataSchemeId | undefined, count: number): DataColors {
  const id = scheme ?? DEFAULT_DATA_SCHEME;
  const definition = DATA_SCHEMES[id] ?? DATA_SCHEMES[DEFAULT_DATA_SCHEME];

  const base =
    id === DEFAULT_DATA_SCHEME ? (theme.series?.length ? theme.series : themeRamp(theme)) : definition.series;

  // The default scheme emphasizes with the theme's accent; a semantic scheme carries
  // its own, so red never silently becomes the meaning of an unrelated category.
  const highlight = id === DEFAULT_DATA_SCHEME ? theme.accent : definition.highlight;

  return {
    series: expand(base, count, theme),
    highlight,
    sequential: id === DEFAULT_DATA_SCHEME && theme.series?.length ? definition.sequential : definition.sequential,
  };
}

/** A three-step neutral ramp for a theme that does not declare one. */
function themeRamp(theme: Theme): string[] {
  return [theme.primary, mix(theme.primary, theme.background, 0.3), mix(theme.primary, theme.background, 0.55)];
}

/**
 * Stretch a ramp to `count` colours. Fewer items take the head of the ramp unchanged,
 * so a series keeps its colour when the dataset grows or shrinks; extra items darken
 * on each pass rather than repeating a colour exactly.
 */
function expand(base: string[], count: number, theme: Theme): string[] {
  const n = Math.max(1, count);
  if (n <= base.length) return base.slice(0, n);
  return Array.from({ length: n }, (_, i) => {
    const colour = base[i % base.length];
    const pass = Math.floor(i / base.length);
    return pass === 0 ? colour : mix(colour, theme.background, Math.min(0.55, pass * 0.2));
  });
}

/** Colours for a spec, using its own scheme and data length. */
export function specColors(spec: ChartSpec, count: number): DataColors {
  return dataColors(spec.theme, spec.dataScheme, count);
}

/** Blend two hex colors. `amount` is how much of `b` to mix into `a`. */
export function mix(a: string, b: string, amount: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  if (!pa || !pb) return a;
  const t = Math.max(0, Math.min(1, amount));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Secondary text colour: the theme's own, or a dimmed primary text. */
export function mutedText(theme: Theme): string {
  return theme.textMuted ?? mix(theme.text, theme.background, 0.4);
}

/** Secondary surface: the theme's own, or a lift off the background. */
export function surface(theme: Theme): string {
  return theme.surface ?? mix(theme.background, theme.text, 0.06);
}
