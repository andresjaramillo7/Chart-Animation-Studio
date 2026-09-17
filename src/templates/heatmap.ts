import type { EChartsOption } from 'echarts';
import { DEFAULT_COMPOSITION, type Composition, type HeatmapSpec } from '../shared/types.js';
import { clamp01, itemProgress } from '../shared/timeline.js';
import { decimalsOf } from '../shared/csv.js';
import { cellKey } from '../shared/schemas.js';
import { specColors } from '../shared/palette.js';
import { formatNumber, valueSuffix } from '../shared/format.js';
import { LANDSCAPE, fitCategoryLabels, getLayout, type Canvas } from '../shared/layout.js';
import {
  FONT_STACK,
  baseOption,
  buildHeader,
  mutedText,
  valueLabelStyle,
  wantsMotif,
  withAlpha,
} from './common.js';

export interface HeatmapCellState {
  x: string;
  y: string;
  value: number;
  /** 0 before the cell's window opens, 1 once it is fully revealed. */
  appeared: number;
}

/**
 * Per-cell reveal state, straight from the timeline.
 *
 * `row` walks the Y categories one at a time; `simultaneous` gives every cell the
 * global progress. A cell that has not started is at 0 and is not drawn at all — it is
 * never drawn faintly or as a zero.
 */
export function heatmapState(spec: HeatmapSpec, progress: number): HeatmapCellState[] {
  const t = clamp01(progress);
  const reveal = spec.heatReveal ?? 'simultaneous';
  const rows = spec.yCategories.length;

  return spec.cells.map((cell) => {
    const rowIndex = spec.yCategories.indexOf(cell.y);
    const appeared = reveal === 'row' ? itemProgress(rowIndex, rows, t, 'sequential') : t;
    return { ...cell, appeared };
  });
}

/**
 * Heatmap — numeric values on a grid of two categorical axes.
 *
 * Only supplied combinations are drawn. A missing cell stays blank, showing the
 * background through the grid, while a zero-valued cell is drawn at the bottom of the
 * colour scale — so the two are visually distinct and nothing is invented.
 */
export function buildHeatmapOption(
  spec: HeatmapSpec,
  progress: number,
  canvas: Canvas = LANDSCAPE,
  composition: Composition = DEFAULT_COMPOSITION,
): EChartsOption {
  const { theme } = spec;
  const show = composition.show;
  const layout = getLayout(canvas);

  const header = buildHeader(spec.title, spec.subtitle, layout, theme, show, wantsMotif(composition));
  const values = spec.cells.map((c) => c.value);
  const decimals = decimalsOf(values);
  const suffix = valueSuffix(spec.valueMode);
  const states = heatmapState(spec, progress);

  // Percentage data always reads against a fixed 0-100 scale; numeric data gets a
  // scale derived from the supplied values, which are never altered.
  const scaleMin = spec.valueMode === 'percent' ? 0 : Math.min(...values, 0);
  const scaleMax = spec.valueMode === 'percent' ? 100 : Math.max(...values, scaleMin + 1);

  // A deliberate single-direction ramp from the active scheme, so colour preserves the
  // numeric ordering. Nothing here turns a quantitative scale into arbitrary categorical
  // colours, and no diverging scale is applied unless one is explicitly chosen.
  const ramp = specColors(spec, 1).sequential;

  const scaleHeight = show.legend ? Math.round(layout.axisLabelSize * 3.2) : 0;
  const plotWidth = layout.width - layout.gridLeft - layout.gridRight;
  const xFit = fitCategoryLabels(
    spec.xCategories,
    (plotWidth * 0.86) / Math.max(1, spec.xCategories.length),
    layout.axisLabelSize,
  );

  const axisBase = {
    axisLine: { show: show.axes, lineStyle: { color: theme.grid, width: 1 } },
    axisTick: { show: false },
    splitArea: { show: false },
    splitLine: { show: false },
  };

  return {
    ...baseOption(theme, composition),
    title: header.title,
    graphic: header.graphic,
    grid: {
      left: layout.gridLeft,
      right: layout.gridRight,
      top: header.contentTop,
      bottom: layout.gridBottom + scaleHeight,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: spec.xCategories,
      ...axisBase,
      axisLabel: {
        show: show.axisLabels,
        color: mutedText(theme),
        fontSize: xFit.fontSize,
        fontFamily: FONT_STACK,
        margin: Math.round(layout.axisLabelSize * 0.7),
        interval: 0,
        rotate: xFit.rotate,
      },
    },
    yAxis: {
      type: 'category',
      data: spec.yCategories,
      // First-appearance order reads top to bottom.
      inverse: true,
      ...axisBase,
      axisLabel: {
        show: show.axisLabels,
        color: mutedText(theme),
        fontSize: layout.axisLabelSize,
        fontFamily: FONT_STACK,
        margin: Math.round(layout.axisLabelSize * 0.6),
        interval: 0,
      },
    },
    visualMap: {
      show: show.legend,
      type: 'continuous',
      min: scaleMin,
      max: scaleMax,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: Math.round(layout.gridBottom * 0.3),
      itemWidth: Math.round(layout.axisLabelSize * 0.7),
      itemHeight: Math.round(layout.width * 0.16),
      inRange: { color: ramp },
      // The ends of the scale are labelled explicitly, so the reader can tell what the
      // colours mean without hovering. ECharts wants [max, min] in that order.
      text: [
        formatNumber(scaleMax, decimals > 0 ? 1 : 0, true, '', suffix),
        formatNumber(scaleMin, decimals > 0 ? 1 : 0, true, '', suffix),
      ],
      textGap: Math.round(layout.axisLabelSize * 0.6),
      textStyle: {
        color: mutedText(theme),
        fontSize: layout.legendSize,
        fontFamily: FONT_STACK,
      },
      formatter: (v: number) => formatNumber(v, 0, true, '', suffix),
    },
    series: [
      {
        type: 'heatmap',
        animation: false,
        emphasis: { disabled: true },
        progressive: 0,
        // Only supplied combinations ever become data points.
        data: states
          .filter((s) => s.appeared > 0)
          .map((s) => ({
            value: [spec.xCategories.indexOf(s.x), spec.yCategories.indexOf(s.y), s.value],
            itemStyle: {
              opacity: s.appeared,
              borderColor:
                spec.highlight !== null && spec.highlight === cellKey(s.x, s.y) ? theme.accent : 'transparent',
              borderWidth:
                spec.highlight !== null && spec.highlight === cellKey(s.x, s.y)
                  ? Math.round(layout.accentWidth * 0.7)
                  : 0,
            },
            label: { opacity: clamp01((s.appeared - 0.4) / 0.6) },
          })),
        label: {
          show: show.valueLabels,
          ...valueLabelStyle(layout, theme, Math.round(layout.valueLabelSize * 0.78)),
          formatter: (p: { value?: unknown }) => {
            const triple = p.value as [number, number, number] | undefined;
            return formatNumber(Number(triple?.[2] ?? 0), decimals, true, '', suffix);
          },
        },
        itemStyle: {
          borderColor: composition.background.mode === 'solid' ? theme.background : withAlpha(theme.text, 0.12),
          borderWidth: 2,
        },
      },
    ],
  } as EChartsOption;
}
