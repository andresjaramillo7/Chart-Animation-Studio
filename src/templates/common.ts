import type { Composition, Theme, ValueMode, VisibilitySpec } from '../shared/types.js';
import { FONT_STACK, MONO_STACK, countLines, wrapText, type Layout } from '../shared/layout.js';
import { mix, mutedText } from '../shared/palette.js';
import { valueSuffix } from '../shared/format.js';

export type { Layout };
export { FONT_STACK, MONO_STACK, mix };

/**
 * The pieces every template shares, so nine templates read as one design system: the
 * same title placement, the same margins, the same axis treatment, the same legend —
 * and the same response to the composition settings.
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
 * Title block: the brand motif, the title, and an optional subtitle, wrapped to the
 * canvas so nothing is ever clipped. Returns the Y at which content can start.
 *
 * The motif is a short thin rule in the accent colour, sitting above the title and
 * aligned to the same left margin as everything else. It is optional, it is never
 * inside the plot area, and it disappears with the titling — so Chart Only stays
 * clean, and it costs nothing in a transparent export.
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
  motif = true,
): Header {
  const textLeft = layout.pad;
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

  const motifGap = Math.round(layout.titleSize * 0.52);
  const top = motif ? layout.titleTop + motifGap : layout.titleTop;

  const graphic: Array<Record<string, unknown>> = motif
    ? [
        {
          type: 'rect',
          left: layout.pad,
          top: layout.titleTop,
          shape: { width: layout.motifLength, height: layout.accentWidth, r: layout.accentWidth / 2 },
          style: { fill: theme.accent },
          silent: true,
        },
      ]
    : [];

  return {
    title: {
      // ECharts renders the subtext under an empty text just fine, so a subtitle-only
      // header still sits exactly where a full header's subtitle would.
      text: wrappedTitle,
      subtext: wrappedSubtitle,
      left: textLeft,
      top,
      itemGap: layout.titleGap,
      textStyle: {
        color: theme.text,
        fontSize: layout.titleSize,
        fontWeight: 700,
        fontFamily: FONT_STACK,
        lineHeight: layout.titleLineHeight,
      },
      subtextStyle: {
        color: mutedText(theme),
        fontSize: layout.subtitleSize,
        fontWeight: 400,
        fontFamily: FONT_STACK,
        lineHeight: layout.subtitleLineHeight,
      },
    },
    graphic,
    contentTop: top + headerHeight + layout.headerGap,
  };
}

/** Whether the composition wants the brand motif drawn. */
export function wantsMotif(composition: Composition): boolean {
  return composition.motif ?? true;
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
      // A hairline in the divider token: present enough to read against, quiet enough
      // to disappear behind the data.
      lineStyle: { color: theme.grid, width: 1, type: 'solid' },
    },
    axisLabel: {
      show: show.axisLabels,
      color: withAlpha(mutedText(theme), 0.75),
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
    axisLine: { show: show.axes, lineStyle: { color: theme.grid, width: 1 } },
    axisTick: { show: false },
    axisLabel: {
      show: show.axisLabels,
      color: mutedText(theme),
      fontSize: fit.fontSize,
      fontFamily: FONT_STACK,
      margin: Math.round(layout.axisLabelSize * 0.8),
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
 * A legend styled identically for every template that has one. Returns a hidden legend
 * when the composition switches it off, so templates never have to branch.
 */
export function legendOption(
  names: string[],
  layout: Layout,
  theme: Theme,
  show: VisibilitySpec,
  palette: string[],
  highlight: string | null = null,
  highlightColor: string = theme.accent,
): Record<string, unknown> {
  return {
    show: show.legend,
    bottom: Math.round(layout.gridBottom * 0.3),
    left: 'center',
    orient: 'horizontal',
    icon: 'roundRect',
    itemWidth: Math.round(layout.legendSize * 0.72),
    itemHeight: Math.round(layout.legendSize * 0.72),
    itemGap: Math.round(layout.legendSize * 1.6),
    data: names.map((name, i) => ({
      name,
      itemStyle: { color: highlight !== null && name === highlight ? highlightColor : palette[i] },
    })),
    textStyle: {
      color: mutedText(theme),
      fontSize: layout.legendSize,
      fontFamily: FONT_STACK,
    },
    selectedMode: false,
  };
}

/** Value read-outs, styled the same way wherever they appear. */
export function valueLabelStyle(layout: Layout, theme: Theme, size = layout.valueLabelSize): Record<string, unknown> {
  return {
    color: theme.text,
    fontSize: size,
    fontWeight: 600,
    fontFamily: FONT_STACK,
    // Tabular figures keep columns of numbers from shifting between frames.
    fontFeatureSettings: '"tnum" 1',
  };
}

/** Small technical annotation styling — the only place the mono face is used. */
export function monoLabelStyle(layout: Layout, theme: Theme): Record<string, unknown> {
  return {
    color: withAlpha(mutedText(theme), 0.85),
    fontSize: layout.monoSize,
    fontWeight: 400,
    fontFamily: MONO_STACK,
  };
}

export { mutedText };
