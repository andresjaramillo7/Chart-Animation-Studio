import type { EChartsOption } from 'echarts';
import { DEFAULT_COMPOSITION, type Composition, type StackedBarSpec } from '../shared/types.js';
import { clamp01, itemProgress } from '../shared/timeline.js';
import { decimalsOf } from '../shared/csv.js';
import { stackProportions, type SeriesTable } from '../shared/schemas.js';
import { formatNumber, valueSuffix } from '../shared/format.js';
import { LANDSCAPE, fitCategoryLabels, getLayout, type Canvas } from '../shared/layout.js';
import {
  FONT_STACK,
  baseOption,
  buildHeader,
  categoryAxis,
  legendOption,
  seriesPalette,
  valueAxis,
  withAlpha,
} from './common.js';

/** A stack segment is only labelled when it is tall enough to hold the text. */
const MIN_LABEL_SHARE = 0.08;

function asTable(spec: StackedBarSpec): SeriesTable {
  return { categories: spec.categories, series: spec.series, decimals: 0 };
}

/**
 * The values each segment should show at a given progress.
 *
 * In `regular` mode these are the source values scaled by the category's progress; in
 * `percent` mode they are proportions derived from that category's own total. The
 * source values are never modified — `percent` is a derived view, and the subtitle
 * says so.
 */
export function stackedValues(spec: StackedBarSpec, progress: number): number[][] {
  const t = clamp01(progress);
  const reveal = spec.reveal ?? 'simultaneous';
  const count = spec.categories.length;
  const base = spec.stackMode === 'percent' ? stackProportions(asTable(spec)) : spec.series.map((s) => s.values);

  // One progress per category, so a stack grows as a whole rather than each segment
  // floating up independently.
  return base.map((values) => values.map((v, c) => v * itemProgress(c, count, t, reveal)));
}

/**
 * Stacked Bar Chart — two or more series stacked per category, in either orientation,
 * as raw values or normalized to 100%.
 */
export function buildStackedBarOption(
  spec: StackedBarSpec,
  progress: number,
  canvas: Canvas = LANDSCAPE,
  composition: Composition = DEFAULT_COMPOSITION,
): EChartsOption {
  const { theme } = spec;
  const show = composition.show;
  const layout = getLayout(canvas);
  const horizontal = (spec.orientation ?? 'vertical') === 'horizontal';
  const isPercentStack = spec.stackMode === 'percent';

  const header = buildHeader(spec.title, spec.subtitle, layout, theme, show);
  const palette = seriesPalette(theme, spec.series.length);
  const values = stackedValues(spec, progress);

  const rawDecimals = decimalsOf(spec.series.flatMap((s) => s.values));
  // A normalized stack is a derived percentage regardless of the source value mode.
  const decimals = isPercentStack ? Math.max(1, rawDecimals) : rawDecimals;
  const suffix = isPercentStack ? '%' : valueSuffix(spec.valueMode);

  const totals = spec.categories.map((_, c) => spec.series.reduce((sum, s) => sum + s.values[c], 0));
  const stackMax = isPercentStack ? 100 : Math.max(...totals, 0);

  const legendHeight = show.legend ? Math.round(layout.axisLabelSize * 2.4) : 0;
  const plotWidth = layout.width - layout.gridLeft - layout.gridRight;
  const fit = horizontal
    ? { fontSize: layout.axisLabelSize, rotate: 0 }
    : fitCategoryLabels(spec.categories, (plotWidth * 0.82) / Math.max(1, spec.categories.length), layout.axisLabelSize);

  const catAxis = {
    ...categoryAxis(spec.categories, layout, theme, fit, show),
    ...(horizontal ? { inverse: true } : {}),
  };
  // A normalized stack always runs 0-100; a raw stack starts at zero and scales to fit.
  const valAxis = isPercentStack
    ? { ...valueAxis('percent', layout, theme, show), max: 100, interval: 25 }
    : valueAxis(spec.valueMode, layout, theme, show);

  return {
    ...baseOption(theme, composition),
    title: header.title,
    graphic: header.graphic,
    legend: legendOption(
      spec.series.map((s) => s.name),
      layout,
      theme,
      show,
      palette,
      spec.highlight,
    ),
    grid: {
      left: layout.gridLeft,
      right: layout.gridRight,
      top: header.contentTop,
      bottom: layout.gridBottom + legendHeight,
      containLabel: true,
    },
    xAxis: horizontal ? valAxis : catAxis,
    yAxis: horizontal ? catAxis : valAxis,
    series: spec.series.map((s, si) => {
      const emphasized = spec.highlight !== null && s.name === spec.highlight;
      return {
        name: s.name,
        type: 'bar',
        stack: 'total',
        animation: false,
        emphasis: { disabled: true },
        barWidth: '58%',
        barMaxWidth: Math.round(layout.width * 0.12),
        data: values[si].map((v, c) => {
          const categoryEmphasized = spec.highlight !== null && spec.categories[c] === spec.highlight;
          const share = stackMax > 0 ? s.values[c] / stackMax : 0;
          return {
            value: v,
            itemStyle: {
              color: emphasized || categoryEmphasized ? theme.accent : palette[si],
              // Dim other categories only when a specific category is emphasized.
              opacity:
                spec.highlight !== null && spec.categories.includes(spec.highlight) && !categoryEmphasized ? 0.45 : 1,
            },
            label: {
              // Small segments would collide with their neighbours, so they stay unlabelled.
              show: show.valueLabels && share >= MIN_LABEL_SHARE,
              opacity: clamp01(itemProgress(c, spec.categories.length, clamp01(progress), spec.reveal ?? 'simultaneous') / 0.3),
            },
          };
        }),
        label: {
          show: show.valueLabels,
          position: 'inside',
          color: theme.text,
          fontSize: Math.round(layout.valueLabelSize * 0.78),
          fontWeight: 600,
          fontFamily: FONT_STACK,
          textBorderWidth: 0,
          formatter: (p: { value?: unknown }) => formatNumber(Number(p.value ?? 0), decimals, true, '', suffix),
        },
        itemStyle: { borderColor: withAlpha(theme.background, 0) },
      };
    }),
  } as EChartsOption;
}
