import type { EChartsOption } from 'echarts';
import { DEFAULT_COMPOSITION, type Composition, type DonutSpec } from '../shared/types.js';
import { clamp01 } from '../shared/timeline.js';
import { decimalsOf } from '../shared/csv.js';
import { donutProportions } from '../shared/schemas.js';
import { specColors } from '../shared/palette.js';
import { formatNumber, valueSuffix } from '../shared/format.js';
import { LANDSCAPE, getLayout, type Canvas } from '../shared/layout.js';
import {
  FONT_STACK,
  baseOption,
  buildHeader,
  legendOption,
  mutedText,
  wantsMotif,
  withAlpha,
} from './common.js';

export interface DonutSegment {
  category: string;
  /** Source value, untouched. */
  value: number;
  /** Share of the whole, in degrees. */
  span: number;
  /** Degrees swept so far, 0..span. */
  visible: number;
}

/**
 * Exact donut state for a frame.
 *
 * The ring is swept clockwise: at progress p, `p * 360` degrees have been drawn, and
 * each segment shows however much of its own arc falls inside that sweep. A partly
 * drawn donut therefore really is partly drawn — no segment is faded in whole.
 */
export function donutState(values: number[], progress: number): DonutSegment[] {
  const t = clamp01(progress);
  const total = values.reduce((sum, v) => sum + v, 0);
  const sweep = t * 360;
  let cursor = 0;

  return values.map((value) => {
    const span = total > 0 ? (value / total) * 360 : 0;
    const visible = Math.min(span, Math.max(0, sweep - cursor));
    cursor += span;
    return { category: '', value, span, visible };
  });
}

/**
 * Donut Chart — parts of one whole, revealed clockwise.
 *
 * ECharts derives pie angles from the data values, so the sweep is expressed as a set
 * of visible arc lengths plus one invisible remainder slice that shrinks to nothing.
 */
export function buildDonutOption(
  spec: DonutSpec,
  progress: number,
  canvas: Canvas = LANDSCAPE,
  composition: Composition = DEFAULT_COMPOSITION,
): EChartsOption {
  const t = clamp01(progress);
  const { theme } = spec;
  const show = composition.show;
  const layout = getLayout(canvas);

  const header = buildHeader(spec.title, spec.subtitle, layout, theme, show, wantsMotif(composition));
  const values = spec.data.map((d) => d.value);
  const decimals = decimalsOf(values);
  const proportions = donutProportions(spec.data);
  const segments = donutState(values, t);
  const colors = specColors(spec, spec.data.length);
  const palette = colors.series;
  const suffix = valueSuffix(spec.valueMode);

  const inner = Math.min(90, Math.max(0, spec.innerRadius));
  // Leave room for outside labels and their leader lines.
  const outerPct = layout.portrait ? 46 : 58;
  const innerPct = (outerPct * inner) / 100;

  const legendHeight = show.legend ? Math.round(layout.axisLabelSize * 2.4) : 0;
  const top = header.contentTop;
  const bottom = layout.gridBottom + legendHeight;
  const centreY = top + (layout.height - top - bottom) / 2;

  const label = (index: number): string => {
    const d = spec.data[index];
    const shown =
      spec.display === 'percent'
        ? formatNumber(proportions[index], Math.max(1, decimals), true, '', '%')
        : formatNumber(d.value, decimals, true, '', suffix);
    return `{name|${d.category}}\n{value|${shown}}`;
  };

  const data = spec.data.map((d, i) => {
    const seg = segments[i];
    const fraction = seg.span > 0 ? seg.visible / seg.span : 0;
    const highlighted = spec.highlight !== null && d.category === spec.highlight;
    return {
      name: d.category,
      // The *visible* arc, not the source value: this is what sweeps the ring open.
      value: seg.visible,
      itemStyle: {
        color: highlighted ? colors.highlight : palette[i],
        borderColor: composition.background.mode === 'solid' ? theme.background : 'transparent',
        // A hairline separator between slices, never a heavy outline.
        borderWidth: composition.background.mode === 'solid' ? 2 : 0,
      },
      label: {
        // Each read-out fades in over the back half of its own segment's sweep, so it
        // never appears before there is an arc to attach it to.
        show: show.valueLabels && fraction > 0,
        opacity: clamp01((fraction - 0.4) / 0.4),
        formatter: label(i),
      },
      labelLine: { show: show.valueLabels && fraction > 0.4 },
    };
  });

  // Invisible remainder keeps the ring a full 360 degrees while it is still opening.
  const remainder = 360 - segments.reduce((sum, s) => sum + s.visible, 0);
  if (remainder > 1e-9) {
    data.push({
      name: '',
      value: remainder,
      itemStyle: { color: 'transparent', borderColor: 'transparent', borderWidth: 0 },
      label: { show: false, opacity: 0, formatter: '' },
      labelLine: { show: false },
    });
  }

  const graphic = [...header.graphic];
  if (spec.showTotal || spec.centerLabel) {
    const total = values.reduce((sum, v) => sum + v, 0);
    const centreSize = Math.round(layout.bigValueSize * (inner / 100) * 0.55);
    if (spec.showTotal) {
      graphic.push({
        type: 'text',
        silent: true,
        style: {
          x: Math.round(layout.width / 2),
          y: Math.round(centreY - (spec.centerLabel ? centreSize * 0.3 : 0)),
          text: formatNumber(total * t, decimals, true, '', suffix),
          fill: theme.text,
          font: `700 ${centreSize}px ${FONT_STACK}`,
          textAlign: 'center',
          textVerticalAlign: 'middle',
        },
      } as unknown as (typeof header.graphic)[number]);
    }
    if (spec.centerLabel) {
      graphic.push({
        type: 'text',
        silent: true,
        style: {
          x: Math.round(layout.width / 2),
          y: Math.round(centreY + (spec.showTotal ? centreSize * 0.62 : 0)),
          text: spec.centerLabel,
          fill: withAlpha(theme.text, 0.6),
          font: `400 ${Math.round(layout.subtitleSize)}px ${FONT_STACK}`,
          textAlign: 'center',
          textVerticalAlign: 'middle',
        },
      } as unknown as (typeof header.graphic)[number]);
    }
  }

  return {
    ...baseOption(theme, composition),
    title: header.title,
    graphic,
    legend: legendOption(
      spec.data.map((d) => d.category),
      layout,
      theme,
      show,
      palette,
      spec.highlight,
      colors.highlight,
    ),
    series: [
      {
        type: 'pie',
        radius: [`${innerPct}%`, `${outerPct}%`],
        center: ['50%', centreY],
        // Clockwise from twelve o'clock, the way a reader expects a share to fill.
        startAngle: 90,
        clockwise: true,
        avoidLabelOverlap: true,
        animation: false,
        silent: true,
        minAngle: 0,
        padAngle: 0,
        data,
        label: {
          position: 'outside',
          color: theme.text,
          fontFamily: FONT_STACK,
          lineHeight: Math.round(layout.valueLabelSize * 1.15),
          rich: {
            name: {
              fontSize: Math.round(layout.valueLabelSize * 0.8),
              color: mutedText(theme),
              fontFamily: FONT_STACK,
              lineHeight: Math.round(layout.valueLabelSize * 1.05),
            },
            value: {
              fontSize: layout.valueLabelSize,
              fontWeight: 700,
              color: theme.text,
              fontFamily: FONT_STACK,
              lineHeight: Math.round(layout.valueLabelSize * 1.25),
            },
          },
        },
        labelLine: {
          length: Math.round(layout.valueLabelSize * 0.9),
          length2: Math.round(layout.valueLabelSize * 1.1),
          lineStyle: { color: withAlpha(mutedText(theme), 0.55), width: 1 },
        },
        emphasis: { disabled: true },
      },
    ],
  } as EChartsOption;
}
