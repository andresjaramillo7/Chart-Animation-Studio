/**
 * Composition geometry.
 *
 * Every template lays itself out from a Layout rather than from hardcoded pixels, so
 * the same spec composes correctly in landscape (YouTube) and portrait (Shorts). The
 * portrait layout is a genuinely different composition — larger type, tighter side
 * margins, more vertical room for the plot — not a crop of the landscape one.
 */

export interface Canvas {
  width: number;
  height: number;
}

export type ResolutionId = 'landscape' | 'portrait';

export const LANDSCAPE: Canvas = { width: 1920, height: 1080 };
export const PORTRAIT: Canvas = { width: 1080, height: 1920 };

export const RESOLUTIONS: Record<ResolutionId, Canvas> = {
  landscape: LANDSCAPE,
  portrait: PORTRAIT,
};

export const RESOLUTION_LABELS: Record<ResolutionId, string> = {
  landscape: '1920 x 1080 — landscape',
  portrait: '1080 x 1920 — portrait (Shorts)',
};

/**
 * Inter is bundled locally (see src/shared/fonts.css); the rest of the stack only
 * exists so a missing bundle degrades rather than crashes. The render host verifies
 * that Inter actually resolved before capturing any frame.
 */
export const FONT_STACK = 'Inter, "Segoe UI", "Helvetica Neue", Arial, sans-serif';

/** Used sparingly, for small technical annotations and identifiers. */
export const MONO_STACK = '"IBM Plex Mono", "Cascadia Mono", Consolas, monospace';

/** The faces the renderer requires. Missing ones are reported, never silently swapped. */
export const REQUIRED_FACES = [
  '400 16px Inter',
  '600 16px Inter',
  '700 16px Inter',
  '400 16px "IBM Plex Mono"',
] as const;

export interface Layout extends Canvas {
  portrait: boolean;
  /** Side margin. */
  pad: number;
  titleTop: number;
  titleSize: number;
  titleLineHeight: number;
  subtitleSize: number;
  subtitleLineHeight: number;
  /** Gap between the title and the subtitle. */
  titleGap: number;
  /** Gap between the header block and the plot area. */
  headerGap: number;
  /** Thickness of the brand motif rule. */
  accentWidth: number;
  /** Length of the brand motif rule. */
  motifLength: number;
  axisLabelSize: number;
  valueLabelSize: number;
  /** Legend text, kept identical across every template that has a legend. */
  legendSize: number;
  /** Axis name text, e.g. the scatter axis titles. */
  axisTitleSize: number;
  /** Small monospace annotations. */
  monoSize: number;
  gridBottom: number;
  gridLeft: number;
  gridRight: number;
  /** Comparison chart uses an outsized value read-out. */
  comparisonValueSize: number;
  comparisonCategorySize: number;
  bigValueSize: number;
  lineWidth: number;
  symbolSize: number;
}

/**
 * One typography and spacing scale per composition, so nine templates share a single
 * visual hierarchy instead of each carrying its own magic numbers.
 */
const LANDSCAPE_BASE = {
  pad: 110,
  titleTop: 96,
  titleSize: 56,
  titleLineHeight: 68,
  subtitleSize: 26,
  subtitleLineHeight: 36,
  titleGap: 16,
  headerGap: 104,
  accentWidth: 4,
  motifLength: 72,
  axisLabelSize: 28,
  valueLabelSize: 31,
  legendSize: 26,
  axisTitleSize: 26,
  monoSize: 22,
  gridBottom: 112,
  gridLeft: 104,
  gridRight: 104,
  comparisonValueSize: 78,
  comparisonCategorySize: 36,
  bigValueSize: 268,
  lineWidth: 5,
  symbolSize: 17,
};

const PORTRAIT_BASE = {
  pad: 76,
  titleTop: 170,
  titleSize: 64,
  titleLineHeight: 80,
  subtitleSize: 33,
  subtitleLineHeight: 46,
  titleGap: 20,
  headerGap: 140,
  accentWidth: 5,
  motifLength: 84,
  axisLabelSize: 33,
  valueLabelSize: 39,
  legendSize: 31,
  axisTitleSize: 31,
  monoSize: 26,
  gridBottom: 290,
  gridLeft: 60,
  gridRight: 60,
  comparisonValueSize: 80,
  comparisonCategorySize: 38,
  bigValueSize: 196,
  lineWidth: 7,
  symbolSize: 21,
};

/**
 * Build a layout for a canvas. Values are scaled from whichever base composition
 * matches the aspect ratio, so non-standard sizes still produce sane geometry.
 */
export function getLayout(canvas: Canvas): Layout {
  const portrait = canvas.height > canvas.width;
  const base = portrait ? PORTRAIT_BASE : LANDSCAPE_BASE;
  const baseWidth = portrait ? PORTRAIT.width : LANDSCAPE.width;
  const s = canvas.width / baseWidth;

  const scaled = Object.fromEntries(
    Object.entries(base).map(([k, v]) => [k, Math.round(v * s)]),
  ) as typeof LANDSCAPE_BASE;

  return { ...scaled, width: canvas.width, height: canvas.height, portrait };
}

/**
 * Approximate rendered width of a string. ECharts measures text on a canvas we do not
 * have here, so this is a deliberate estimate used only to decide when to wrap or
 * shrink; it errs wide so content is never clipped.
 */
export function estimateTextWidth(text: string, fontSize: number, bold = false): number {
  // Measured against Inter: ~0.55em per glyph bold, ~0.52em regular, rounded up so the
  // estimate errs wide and content is never clipped.
  return text.length * fontSize * (bold ? 0.56 : 0.52);
}

/** Greedy word wrap into a `\n`-joined string ECharts can render directly. */
export function wrapText(text: string, maxWidth: number, fontSize: number, bold = false): string {
  if (!text) return '';
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && estimateTextWidth(candidate, fontSize, bold) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

export function countLines(wrapped: string): number {
  return wrapped ? wrapped.split('\n').length : 0;
}

export interface CategoryLabelFit {
  fontSize: number;
  rotate: number;
}

/**
 * Shrink, then rotate, category labels until they fit the space each one is given.
 * Purely a function of the strings and the budget, so it is identical every frame.
 */
export function fitCategoryLabels(
  categories: string[],
  budgetPerLabel: number,
  baseSize: number,
  minSize = Math.round(baseSize * 0.72),
): CategoryLabelFit {
  const longest = categories.reduce((a, b) => (b.length > a.length ? b : a), '');
  if (!longest) return { fontSize: baseSize, rotate: 0 };

  if (estimateTextWidth(longest, baseSize) <= budgetPerLabel) return { fontSize: baseSize, rotate: 0 };

  const fitted = Math.floor(budgetPerLabel / (longest.length * 0.53));
  if (fitted >= minSize) return { fontSize: fitted, rotate: 0 };
  // Rotating buys roughly 2.5x the horizontal budget at 30 degrees.
  return { fontSize: minSize, rotate: 30 };
}
