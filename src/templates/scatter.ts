import type { EChartsOption } from 'echarts';
import { DEFAULT_COMPOSITION, type Composition, type ScatterSpec } from '../shared/types.js';
import { clamp01, itemProgress } from '../shared/timeline.js';
import { decimalsOf } from '../shared/csv.js';
import { specColors } from '../shared/palette.js';
import { formatNumber } from '../shared/format.js';
import { LANDSCAPE, getLayout, type Canvas } from '../shared/layout.js';
import {
  FONT_STACK,
  baseOption,
  buildHeader,
  mutedText,
  valueLabelStyle,
  wantsMotif,
  withAlpha,
} from './common.js';

/**
 * How far each point has appeared, purely as a function of the timeline.
 *
 * There is no randomness and no per-point delay drawn from a clock: index `i` of `n`
 * always gets the same window, so frame N is reproducible in isolation.
 */
export function scatterPointProgress(spec: ScatterSpec, progress: number): number[] {
  const t = clamp01(progress);
  const reveal = spec.reveal ?? 'simultaneous';
  const n = spec.points.length;
  return spec.points.map((_, i) => itemProgress(i, n, t, reveal));
}

/**
 * Scatter Plot — the relationship between two numeric variables.
 *
 * Coordinates are drawn exactly as supplied; only the symbol size and opacity animate,
 * so no point ever moves. Duplicate coordinates are kept: two observations may legitimately
 * share a position. No regression line, correlation or other derived statistic is drawn.
 */
export function buildScatterOption(
  spec: ScatterSpec,
  progress: number,
  canvas: Canvas = LANDSCAPE,
  composition: Composition = DEFAULT_COMPOSITION,
): EChartsOption {
  const { theme } = spec;
  const show = composition.show;
  const layout = getLayout(canvas);

  const colors = specColors(spec, 1);

  const header = buildHeader(spec.title, spec.subtitle, layout, theme, show, wantsMotif(composition));
  const xs = spec.points.map((p) => p.x);
  const ys = spec.points.map((p) => p.y);
  const xDecimals = decimalsOf(xs);
  const yDecimals = decimalsOf(ys);
  const appearance = scatterPointProgress(spec, progress);

  const baseSize = Math.max(4, spec.symbolSize);
  const axisTitleSize = layout.axisTitleSize;
  const opaqueBackdrop = composition.background.mode === 'solid';

  return {
    ...baseOption(theme, composition),
    title: header.title,
    graphic: header.graphic,
    grid: {
      left: layout.gridLeft,
      right: layout.gridRight + Math.round(baseSize * 1.5),
      top: header.contentTop,
      // Room for the X axis title beneath the tick labels.
      bottom: layout.gridBottom + (spec.xTitle ? Math.round(axisTitleSize * 2.2) : 0),
      containLabel: true,
    },
    xAxis: {
      type: 'value',
      scale: true,
      // Points sitting on the data extremes would otherwise be bisected by the axis.
      boundaryGap: ['6%', '6%'],
      name: spec.xTitle,
      nameLocation: 'middle',
      nameGap: Math.round(axisTitleSize * 2.6),
      nameTextStyle: {
        color: mutedText(theme),
        fontSize: axisTitleSize,
        fontWeight: 600,
        fontFamily: FONT_STACK,
      },
      axisLine: { show: show.axes, lineStyle: { color: theme.grid, width: 1 } },
      axisTick: { show: false },
      splitLine: {
        show: show.gridlines,
        lineStyle: { color: theme.grid, width: 1, type: 'solid' },
      },
      axisLabel: {
        show: show.axisLabels,
        color: withAlpha(mutedText(theme), 0.75),
        fontSize: Math.round(layout.axisLabelSize * 0.86),
        fontFamily: FONT_STACK,
        margin: Math.round(layout.axisLabelSize * 0.7),
        formatter: (v: number) => formatNumber(v, xDecimals),
      },
    },
    yAxis: {
      type: 'value',
      scale: true,
      boundaryGap: ['8%', '8%'],
      ...(spec.valueMode === 'percent' ? { min: 0, max: 100, interval: 25, scale: false } : {}),
      name: spec.yTitle,
      nameLocation: 'middle',
      nameGap: Math.round(layout.gridLeft * 0.75 + axisTitleSize * 2.4),
      nameRotate: 90,
      nameTextStyle: {
        color: mutedText(theme),
        fontSize: axisTitleSize,
        fontWeight: 600,
        fontFamily: FONT_STACK,
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        show: show.gridlines,
        lineStyle: { color: theme.grid, width: 1, type: 'solid' },
      },
      axisLabel: {
        show: show.axisLabels,
        color: withAlpha(mutedText(theme), 0.75),
        fontSize: Math.round(layout.axisLabelSize * 0.86),
        fontFamily: FONT_STACK,
        margin: Math.round(layout.axisLabelSize * 0.8),
        formatter: (v: number) => formatNumber(v, yDecimals, true, '', spec.valueMode === 'percent' ? '%' : ''),
      },
    },
    series: [
      {
        type: 'scatter',
        animation: false,
        emphasis: { disabled: true },
        data: spec.points.map((p, i) => {
          const appeared = appearance[i];
          const highlighted = spec.highlight !== null && p.label !== '' && p.label === spec.highlight;
          return {
            // Exactly as supplied — only the symbol animates.
            value: [p.x, p.y],
            symbolSize: (highlighted ? baseSize * 1.6 : baseSize) * appeared,
            itemStyle: {
              color: highlighted ? colors.highlight : colors.series[0],
              opacity: appeared,
              borderColor: opaqueBackdrop ? theme.background : 'transparent',
              borderWidth: opaqueBackdrop ? Math.round(baseSize * 0.12) : 0,
            },
            label: {
              show: show.valueLabels && p.label !== '',
              opacity: clamp01((appeared - 0.5) / 0.5),
              color: highlighted ? colors.highlight : theme.text,
            },
          };
        }),
        label: {
          show: show.valueLabels,
          position: 'top',
          distance: Math.round(baseSize * 0.55),
          ...valueLabelStyle(layout, theme, Math.round(layout.valueLabelSize * 0.78)),
          formatter: (p: { dataIndex?: number }) => spec.points[p.dataIndex ?? 0]?.label ?? '',
        },
      },
    ],
  } as EChartsOption;
}
