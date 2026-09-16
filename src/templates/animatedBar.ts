import type { EChartsOption } from 'echarts';
import type { BarSpec } from '../shared/types.js';
import { clamp01, itemProgress } from '../shared/timeline.js';
import { decimalsOf } from '../shared/csv.js';
import { formatNumber, valueSuffix } from '../shared/format.js';
import { LANDSCAPE, fitCategoryLabels, getLayout, type Canvas } from '../shared/layout.js';
import { FONT_STACK, baseOption, buildHeader, categoryAxis, valueAxis, withAlpha } from './common.js';

/**
 * Animated Bar — bars growing from zero, in either orientation.
 *
 * Pure function of (spec, progress, canvas). It holds no dataset of its own and no
 * timing state, so the same call always produces the same option object.
 */
export function buildAnimatedBarOption(
  spec: BarSpec,
  progress: number,
  canvas: Canvas = LANDSCAPE,
): EChartsOption {
  const t = clamp01(progress);
  const { theme } = spec;
  const layout = getLayout(canvas);
  const horizontal = (spec.orientation ?? 'vertical') === 'horizontal';
  const reveal = spec.reveal ?? 'simultaneous';
  const decimals = decimalsOf(spec.data.map((d) => d.value));
  const suffix = valueSuffix(spec.valueMode);

  const header = buildHeader(spec.title, spec.subtitle, layout, theme);
  const categories = spec.data.map((d) => d.category);
  const count = spec.data.length;

  // Each bar's own progress. Sequential windows come from the global timeline, so the
  // first frame is all-zero and the final frame is every original value.
  const progressOf = (i: number) => itemProgress(i, count, t, reveal);

  const grid = {
    left: layout.gridLeft,
    right: layout.gridRight,
    top: header.contentTop,
    bottom: layout.gridBottom,
    containLabel: true,
  };

  const plotWidth = layout.width - layout.gridLeft - layout.gridRight;
  const fit = horizontal
    ? { fontSize: layout.axisLabelSize, rotate: 0 }
    : fitCategoryLabels(categories, (plotWidth * 0.82) / Math.max(1, count), layout.axisLabelSize);

  // A horizontal category axis renders its first entry at the bottom; inverting keeps
  // the source order reading top-to-bottom.
  const catAxis = { ...categoryAxis(categories, layout, theme, fit), ...(horizontal ? { inverse: true } : {}) };
  const valAxis = valueAxis(spec.valueMode, layout, theme);

  return {
    ...baseOption(theme),
    title: header.title,
    graphic: header.graphic,
    grid,
    xAxis: horizontal ? valAxis : catAxis,
    yAxis: horizontal ? catAxis : valAxis,
    series: [
      {
        type: 'bar',
        data: spec.data.map((d, i) => {
          const p = progressOf(i);
          return {
            value: d.value * p,
            itemStyle: {
              color: spec.highlight && d.category === spec.highlight ? theme.accent : theme.primary,
              borderRadius: horizontal
                ? [0, layout.accentWidth, layout.accentWidth, 0]
                : [layout.accentWidth, layout.accentWidth, 0, 0],
            },
            label: {
              // Fade each read-out in over the start of that bar's own window, so the
              // first frame is a clean zero state rather than a row of "0%" labels.
              opacity: clamp01(p / 0.12),
            },
          };
        }),
        barWidth: '54%',
        barMaxWidth: Math.round(layout.width * 0.085),
        animation: false,
        label: {
          show: true,
          position: horizontal ? 'right' : 'top',
          distance: Math.round(layout.valueLabelSize * 0.5),
          color: theme.text,
          fontSize: layout.valueLabelSize,
          fontWeight: 600,
          fontFamily: FONT_STACK,
          // Typed loosely so the signature stays assignable to ECharts' label callback.
          formatter: (p: { value?: unknown }) =>
            formatNumber(Number(p.value ?? 0), decimals, true, '', suffix),
        },
        emphasis: { disabled: true },
        itemStyle: { borderColor: withAlpha(theme.background, 0) },
      },
    ],
  } as EChartsOption;
}
