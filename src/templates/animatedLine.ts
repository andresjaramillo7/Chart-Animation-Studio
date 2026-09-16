import type { EChartsOption } from 'echarts';
import type { LineSpec } from '../shared/types.js';
import { clamp01 } from '../shared/timeline.js';
import { decimalsOf } from '../shared/csv.js';
import { formatNumber, valueSuffix } from '../shared/format.js';
import { LANDSCAPE, estimateTextWidth, fitCategoryLabels, getLayout, type Canvas } from '../shared/layout.js';
import { FONT_STACK, baseOption, buildHeader, valueAxis, withAlpha } from './common.js';

export interface LineState {
  /** Fractional position of the drawing head along the category index axis. */
  head: number;
  /** Index of the last fully revealed point. */
  lastFullIndex: number;
  /** How far the partially drawn segment has advanced, 0 when none is in progress. */
  segmentFraction: number;
  /** Value at the head when a partial segment is in progress, otherwise null. */
  headValue: number | null;
}

/**
 * Exact line state for a frame. Split out so the progression can be tested directly
 * rather than inferred from an ECharts option.
 */
export function lineState(values: number[], progress: number): LineState {
  const n = values.length;
  const t = clamp01(progress);
  if (n === 0) return { head: 0, lastFullIndex: -1, segmentFraction: 0, headValue: null };
  if (n === 1) return { head: 0, lastFullIndex: 0, segmentFraction: 0, headValue: null };

  const head = t * (n - 1);
  const lastFullIndex = Math.min(n - 1, Math.floor(head + 1e-9));
  const segmentFraction = lastFullIndex >= n - 1 ? 0 : head - lastFullIndex;
  const headValue =
    segmentFraction > 0
      ? values[lastFullIndex] + (values[lastFullIndex + 1] - values[lastFullIndex]) * segmentFraction
      : null;

  return { head, lastFullIndex, segmentFraction, headValue };
}

/**
 * Animated Line — the line is progressively drawn from the first category to the last.
 *
 * The X axis is numeric so the drawing head can sit between two categories; integer
 * ticks are labelled with the category names, preserving the source order. Nothing
 * here fades in a finished line: every frame is a genuinely shorter polyline.
 */
export function buildAnimatedLineOption(
  spec: LineSpec,
  progress: number,
  canvas: Canvas = LANDSCAPE,
): EChartsOption {
  const { theme } = spec;
  const layout = getLayout(canvas);
  const decimals = decimalsOf(spec.data.map((d) => d.value));
  const suffix = valueSuffix(spec.valueMode);

  const header = buildHeader(spec.title, spec.subtitle, layout, theme);
  const categories = spec.data.map((d) => d.category);
  const values = spec.data.map((d) => d.value);
  const n = values.length;

  const state = lineState(values, progress);

  type Point = {
    value: [number, number];
    symbolSize?: number;
    itemStyle?: Record<string, unknown>;
    label?: Record<string, unknown>;
  };

  const points: Point[] = [];
  for (let i = 0; i <= state.lastFullIndex; i++) {
    const highlighted = spec.highlight !== null && categories[i] === spec.highlight;
    points.push({
      value: [i, values[i]],
      symbolSize: highlighted ? Math.round(layout.symbolSize * 1.5) : layout.symbolSize,
      itemStyle: {
        color: highlighted ? theme.accent : theme.primary,
        borderColor: theme.background,
        borderWidth: Math.round(layout.lineWidth * 0.5),
      },
      label: { show: true, color: highlighted ? theme.accent : theme.text },
    });
  }
  // The drawing head itself carries no marker or read-out — only revealed points do.
  if (state.headValue !== null) {
    points.push({ value: [state.head, state.headValue], symbolSize: 0, label: { show: false } });
  }

  // The first and last points sit on the plot edges and their read-outs are centred
  // above them, so half a label hangs outside. Pad the grid by that much on each side
  // to keep those labels clear of the axis labels and the frame edge.
  const widestLabel = values.reduce(
    (w, v) =>
      Math.max(w, estimateTextWidth(formatNumber(v, decimals, true, '', suffix), layout.valueLabelSize, true)),
    0,
  );
  const labelPad = Math.ceil(widestLabel / 2);

  const plotWidth = layout.width - layout.gridLeft - layout.gridRight - labelPad * 2;
  const fit = fitCategoryLabels(categories, (plotWidth * 0.86) / Math.max(1, n), layout.axisLabelSize);

  return {
    ...baseOption(theme),
    title: header.title,
    graphic: header.graphic,
    grid: {
      left: layout.gridLeft + labelPad,
      right: layout.gridRight + labelPad,
      top: header.contentTop,
      bottom: layout.gridBottom,
      containLabel: true,
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: Math.max(1, n - 1),
      interval: 1,
      axisLine: { lineStyle: { color: withAlpha(theme.text, 0.22), width: 2 } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        color: withAlpha(theme.text, 0.62),
        fontSize: fit.fontSize,
        fontFamily: FONT_STACK,
        margin: Math.round(layout.axisLabelSize * 0.7),
        rotate: fit.rotate,
        formatter: (v: number) => categories[Math.round(v)] ?? '',
      },
    },
    yAxis: valueAxis(spec.valueMode, layout, theme),
    series: [
      {
        type: 'line',
        data: points,
        showSymbol: true,
        smooth: false,
        animation: false,
        clip: false,
        lineStyle: { color: theme.primary, width: layout.lineWidth, cap: 'round', join: 'round' },
        itemStyle: { color: theme.primary },
        emphasis: { disabled: true },
        label: {
          show: true,
          position: 'top',
          distance: Math.round(layout.valueLabelSize * 0.6),
          color: theme.text,
          fontSize: layout.valueLabelSize,
          fontWeight: 600,
          fontFamily: FONT_STACK,
          formatter: (p: { value?: unknown }) => {
            const pair = p.value as [number, number] | undefined;
            return formatNumber(Number(pair?.[1] ?? 0), decimals, true, '', suffix);
          },
        },
      },
    ],
  } as EChartsOption;
}
