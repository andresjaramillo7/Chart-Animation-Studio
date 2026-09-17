import type { EChartsOption } from 'echarts';
import { DEFAULT_COMPOSITION, type ComparisonSpec, type Composition } from '../shared/types.js';
import { clamp01, itemProgress } from '../shared/timeline.js';
import { decimalsOf } from '../shared/csv.js';
import { specColors } from '../shared/palette.js';
import { formatNumber, valueSuffix } from '../shared/format.js';
import { LANDSCAPE, getLayout, type Canvas } from '../shared/layout.js';
import {
  baseOption,
  buildHeader,
  categoryAxis,
  valueAxis,
  valueLabelStyle,
  wantsMotif,
  withAlpha,
} from './common.js';

/** Comparison charts are only meaningful for a small number of side-by-side values. */
export const COMPARISON_MIN_CATEGORIES = 2;
export const COMPARISON_MAX_CATEGORIES = 3;

/**
 * Comparison Chart — two or three values set against each other, with an outsized
 * read-out above each bar.
 *
 * Generic in its categories and values; like every template it is a pure function of
 * (spec, progress, canvas). The value axis always starts at zero, and percentage data
 * is pinned to 0-100, so the visual gap between bars is never exaggerated.
 */
export function buildComparisonOption(
  spec: ComparisonSpec,
  progress: number,
  canvas: Canvas = LANDSCAPE,
  composition: Composition = DEFAULT_COMPOSITION,
): EChartsOption {
  const t = clamp01(progress);
  const { theme } = spec;
  const show = composition.show;
  const layout = getLayout(canvas);
  const reveal = spec.reveal ?? 'simultaneous';
  const decimals = decimalsOf(spec.data.map((d) => d.value));
  const suffix = valueSuffix(spec.valueMode);

  const colors = specColors(spec, 1);

  const header = buildHeader(spec.title, spec.subtitle, layout, theme, show, wantsMotif(composition));
  const categories = spec.data.map((d) => d.category);
  const count = spec.data.length;

  return {
    ...baseOption(theme, composition),
    title: header.title,
    graphic: header.graphic,
    grid: {
      left: layout.gridLeft,
      // Fewer, wider bars read better with extra breathing room at the sides.
      right: layout.gridRight,
      top: header.contentTop,
      bottom: layout.gridBottom,
      containLabel: true,
    },
    xAxis: categoryAxis(
      categories,
      layout,
      theme,
      { fontSize: layout.comparisonCategorySize, rotate: 0 },
      show,
    ),
    yAxis: valueAxis(spec.valueMode, layout, theme, show),
    series: [
      {
        type: 'bar',
        data: spec.data.map((d, i) => {
          const p = itemProgress(i, count, t, reveal);
          const emphasized = spec.highlight !== null && d.category === spec.highlight;
          return {
            value: d.value * p,
            itemStyle: {
              color: emphasized ? colors.highlight : colors.series[0],
              borderRadius: [layout.accentWidth, layout.accentWidth, 0, 0],
            },
            label: { opacity: clamp01(p / 0.12) },
          };
        }),
        barWidth: count === 2 ? '34%' : '40%',
        barMaxWidth: Math.round(layout.width * 0.16),
        animation: false,
        emphasis: { disabled: true },
        label: {
          show: show.valueLabels,
          position: 'top',
          distance: Math.round(layout.comparisonValueSize * 0.34),
          ...valueLabelStyle(layout, theme, layout.comparisonValueSize),
          fontWeight: 700,
          formatter: (p: { value?: unknown }) =>
            formatNumber(Number(p.value ?? 0), decimals, true, '', suffix),
        },
        itemStyle: { borderColor: withAlpha(theme.background, 0) },
      },
    ],
  } as EChartsOption;
}
