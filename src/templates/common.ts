import type { Composition, Theme, ValueMode, VisibilitySpec } from '../shared/types.js';
import { FONT_STACK, countLines, wrapText, type Layout } from '../shared/layout.js';
export type { Layout };
import { valueSuffix } from '../shared/format.js';

export { FONT_STACK };

/**
 * Pieces every template shares, so the four templates read as one design system:
 * the same title placement, the same margins, the same axis treatment — and the same
 * response to the composition settings.
 */

/** Blend a hex color toward transparency. Accepts #rgb / #rrggbb. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  let h = m[1];
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface Header {
  title: Record<string, unknown>;
  graphic: Array<Record<string, unknown>>;
  /** Y coordinate where template content may begin. */
  contentTop: number;
}

/**
 * Title block: an accent rule, the title, and an optional subtitle, wrapped to the
 * canvas so nothing is ever clipped. Returns the Y at which content can start.
 *
 * When the titling is hidden the block collapses to a plain top margin and the freed
 * space is handed back to the plot — the content is never cropped away instead.
 */
export function buildHeader(
  title: string,
  subtitle: string,
  layout: Layout,
  theme: Theme,
  show: VisibilitySpec,
): Header {
  const textLeft = layout.pad + Math.round(layout.accentWidth * 4.5);
  const textWidth = layout.width - textLeft - layout.pad;

  const wantTitle = show.title && title.trim() !== '';
  const wantSubtitle = show.subtitle && subtitle.trim() !== '';

  if (!wantTitle && !wantSubtitle) {
    return { title: { show: false }, graphic: [], contentTop: layout.pad };
  }

  const wrappedTitle = wantTitle ? wrapText(title, textWidth, layout.titleSize, true) : '';
  const wrappedSubtitle = wantSubtitle ? wrapText(subtitle, textWidth, layout.subtitleSize, false) : '';
  const titleLines = countLines(wrappedTitle);
  const subtitleLines = countLines(wrappedSubtitle);

  const headerHeight =
    titleLines * layout.titleLineHeight +
    (subtitleLines > 0
      ? (titleLines > 0 ? layout.titleGap : 0) + subtitleLines * layout.subtitleLineHeight
      : 0);

  return {
    title: {
      // ECharts renders the subtext under an empty text just fine, so a subtitle-only
      // header still sits exactly where a full header's subtitle would.
      text: wrappedTitle,
      subtext: wrappedSubtitle,
      left: textLeft,
      top: layout.titleTop,
      itemGap: layout.titleGap,
      textStyle: {
        color: theme.text,
        fontSize: layout.titleSize,
        fontWeight: 700,
        fontFamily: FONT_STACK,
        lineHeight: layout.titleLineHeight,
      },
      subtextStyle: {
        color: withAlpha(theme.text, 0.6),
        fontSize: layout.subtitleSize,
        fontWeight: 400,
        fontFamily: FONT_STACK,
        lineHeight: layout.subtitleLineHeight,
      },
    },
    graphic: [
      {
        type: 'rect',
        left: layout.pad,
        top: layout.titleTop + Math.round(layout.titleLineHeight * 0.08),
        shape: {
          width: layout.accentWidth,
          height: Math.max(
            layout.accentWidth * 4,
            headerHeight - Math.round(layout.titleLineHeight * 0.2),
          ),
          r: layout.accentWidth / 2,
        },
        style: { fill: theme.accent },
        silent: true,
      },
    ],
    contentTop: layout.titleTop + headerHeight + layout.headerGap,
  };
}

/**
 * A zero-based value axis. Percentage data is always pinned to 0-100 so differences
 * are never visually exaggerated; numeric data auto-scales upward from zero.
 */
export function valueAxis(
  valueMode: ValueMode,
  layout: Layout,
  theme: Theme,
  show: VisibilitySpec,
): Record<string, unknown> {
  const suffix = valueSuffix(valueMode);
  return {
    type: 'value',
    min: 0,
    ...(valueMode === 'percent' ? { max: 100, interval: 25 } : {}),
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: {
      show: show.gridlines,
      lineStyle: { color: theme.grid, width: 1, type: [6, 8] as unknown as 'dashed' },
    },
    axisLabel: {
      show: show.axisLabels,
      color: withAlpha(theme.text, 0.45),
      fontSize: Math.round(layout.axisLabelSize * 0.86),
      fontFamily: FONT_STACK,
      margin: Math.round(layout.axisLabelSize * 0.8),
      formatter: (v: number) => `${v}${suffix}`,
    },
  };
}

/** The category axis, with labels shrunk or rotated when space is tight. */
export function categoryAxis(
  categories: string[],
  layout: Layout,
  theme: Theme,
  fit: { fontSize: number; rotate: number },
  show: VisibilitySpec,
): Record<string, unknown> {
  return {
    type: 'category',
    data: categories,
    axisLine: { show: show.axes, lineStyle: { color: withAlpha(theme.text, 0.22), width: 2 } },
    axisTick: { show: false },
    axisLabel: {
      show: show.axisLabels,
      color: withAlpha(theme.text, 0.62),
      fontSize: fit.fontSize,
      fontFamily: FONT_STACK,
      margin: Math.round(layout.axisLabelSize * 0.7),
      interval: 0,
      rotate: fit.rotate,
      hideOverlap: false,
    },
  };
}

/**
 * Shared option scaffolding: fonts, native animation off, and the canvas background.
 *
 * The canvas is painted only in solid mode. For an image or a transparent composition
 * the ECharts canvas stays transparent so the layer behind it (the background image, or
 * nothing at all) shows through — that is what makes a genuinely transparent export
 * possible rather than a chart drawn onto an opaque rectangle.
 */
export function baseOption(theme: Theme, composition: Composition): Record<string, unknown> {
  return {
    backgroundColor: composition.background.mode === 'solid' ? theme.background : 'transparent',
    animation: false,
    textStyle: { fontFamily: FONT_STACK, color: theme.text },
  };
}

/**
 * A categorical palette derived from the active theme, so multi-series charts stay in
 * the same restrained colour world as the single-series ones.
 *
 * The ramp walks from the primary toward the accent in a fixed order, so series N
 * always gets colour N — a series keeps its colour when the data changes.
 */
export function seriesPalette(theme: Theme, count: number): string[] {
  const stops = [theme.primary, theme.accent, mix(theme.primary, theme.text, 0.35), mix(theme.accent, theme.background, 0.3), mix(theme.primary, theme.background, 0.45)];
  if (count <= stops.length) return stops.slice(0, Math.max(1, count));
  // More series than stops: keep cycling, darkening each pass so nothing repeats exactly.
  return Array.from({ length: count }, (_, i) => {
    const base = stops[i % stops.length];
    const pass = Math.floor(i / stops.length);
    return pass === 0 ? base : mix(base, theme.background, Math.min(0.6, pass * 0.22));
  });
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

function hexToRgb(hex: string): [number, number, number] | null {
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

/**
 * A legend styled like the rest of the composition. Returns a hidden legend when the
 * composition switches it off, so templates never have to branch.
 */
export function legendOption(
  names: string[],
  layout: Layout,
  theme: Theme,
  show: VisibilitySpec,
  palette: string[],
  highlight: string | null = null,
): Record<string, unknown> {
  return {
    show: show.legend,
    bottom: Math.round(layout.gridBottom * 0.35),
    left: 'center',
    orient: 'horizontal',
    icon: 'roundRect',
    itemWidth: Math.round(layout.axisLabelSize * 0.8),
    itemHeight: Math.round(layout.axisLabelSize * 0.8),
    itemGap: Math.round(layout.axisLabelSize * 1.4),
    data: names.map((name, i) => ({
      name,
      itemStyle: { color: highlight !== null && name === highlight ? theme.accent : palette[i] },
    })),
    textStyle: {
      color: withAlpha(theme.text, 0.75),
      fontSize: Math.round(layout.axisLabelSize * 0.9),
      fontFamily: FONT_STACK,
    },
    selectedMode: false,
  };
}
