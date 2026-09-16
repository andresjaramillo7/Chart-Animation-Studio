import { describe, it, expect } from 'vitest';
import { buildAnimatedLineOption, lineState } from '../src/templates/animatedLine.js';
import { parseCsv } from '../src/shared/csv.js';
import { COMEBACK_CURVE_CSV } from '../src/presets/comebackCurve.js';
import { DARK_MINIMAL, type LineSpec } from '../src/shared/types.js';

const SOURCE = [45.4, 37.4, 30.5, 21.1, 16.3, 12.4, 6.6];
const CATEGORIES = ['0-999', '1000-1999', '2000-2999', '3000-3999', '4000-4999', '5000-5999', '6000+'];

function lineSpec(over: Partial<LineSpec> = {}): LineSpec {
  const parsed = parseCsv(COMEBACK_CURVE_CSV, 'percent');
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return {
    template: 'animated-line',
    title: 'Comeback Rate by Gold Deficit',
    subtitle: 'Observed comeback rates among games continuing past 20 minutes.',
    data: parsed.data,
    valueMode: 'percent',
    highlight: null,
    theme: DARK_MINIMAL,
    ...over,
  };
}

type Point = { value: [number, number]; symbolSize?: number; label?: { show?: boolean } };
function points(option: unknown): Point[] {
  return (option as { series: Array<{ data: Point[] }> }).series[0].data;
}

describe('line progression state', () => {
  it('starts with only the first point revealed', () => {
    const s = lineState(SOURCE, 0);
    expect(s.head).toBe(0);
    expect(s.lastFullIndex).toBe(0);
    expect(s.segmentFraction).toBe(0);
    expect(s.headValue).toBeNull();
  });

  it('ends with every point revealed and no partial segment', () => {
    const s = lineState(SOURCE, 1);
    expect(s.head).toBe(6);
    expect(s.lastFullIndex).toBe(6);
    expect(s.segmentFraction).toBe(0);
    expect(s.headValue).toBeNull();
  });

  it('interpolates the partially drawn segment between two points', () => {
    // 0.25 of 6 segments = head at index 1.5, halfway from 37.4 to 30.5.
    const s = lineState(SOURCE, 0.25);
    expect(s.head).toBeCloseTo(1.5, 10);
    expect(s.lastFullIndex).toBe(1);
    expect(s.segmentFraction).toBeCloseTo(0.5, 10);
    expect(s.headValue).toBeCloseTo(33.95, 10);
  });

  it('lands exactly on a data point when progress divides evenly', () => {
    const s = lineState(SOURCE, 0.5);
    expect(s.head).toBeCloseTo(3, 10);
    expect(s.lastFullIndex).toBe(3);
    expect(s.segmentFraction).toBe(0);
    expect(s.headValue).toBeNull();
  });

  it('advances the head monotonically', () => {
    let previous = -1;
    for (let step = 0; step <= 30; step++) {
      const s = lineState(SOURCE, step / 30);
      expect(s.head).toBeGreaterThanOrEqual(previous);
      previous = s.head;
    }
  });
});

describe('animated line option', () => {
  it('draws a genuinely shorter polyline early on, not a faded full line', () => {
    const early = points(buildAnimatedLineOption(lineSpec(), 0.25));
    const full = points(buildAnimatedLineOption(lineSpec(), 1));
    expect(full).toHaveLength(7);
    // Two revealed points plus the interpolated head.
    expect(early).toHaveLength(3);
    expect(early[early.length - 1].value[0]).toBeCloseTo(1.5, 10);
  });

  it('reveals points one at a time as the line advances', () => {
    const counts = [0, 0.2, 0.4, 0.6, 0.8, 1].map(
      (p) => points(buildAnimatedLineOption(lineSpec(), p)).filter((pt) => pt.symbolSize !== 0).length,
    );
    expect(counts).toEqual([1, 2, 3, 4, 5, 7]);
    expect(counts.every((c, i) => i === 0 || c >= counts[i - 1])).toBe(true);
  });

  it('hides the marker and read-out on the drawing head', () => {
    const pts = points(buildAnimatedLineOption(lineSpec(), 0.25));
    const head = pts[pts.length - 1];
    expect(head.symbolSize).toBe(0);
    expect(head.label?.show).toBe(false);
  });

  it('ends on the exact source values in the original category order', () => {
    const pts = points(buildAnimatedLineOption(lineSpec(), 1));
    expect(pts.map((p) => p.value[0])).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(pts.map((p) => p.value[1])).toEqual(SOURCE);
  });

  it('labels the numeric X axis with the categories in source order', () => {
    const option = buildAnimatedLineOption(lineSpec(), 1) as unknown as {
      xAxis: { type: string; min: number; max: number; axisLabel: { formatter: (v: number) => string } };
    };
    expect(option.xAxis.type).toBe('value');
    expect(option.xAxis.min).toBe(0);
    expect(option.xAxis.max).toBe(6);
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => option.xAxis.axisLabel.formatter(i))).toEqual(CATEGORIES);
  });

  it('pins a percentage Y axis to 0-100 and auto-scales numeric data', () => {
    const pct = buildAnimatedLineOption(lineSpec(), 1) as unknown as { yAxis: { min: number; max?: number } };
    expect(pct.yAxis.min).toBe(0);
    expect(pct.yAxis.max).toBe(100);

    const numeric = buildAnimatedLineOption(
      lineSpec({ valueMode: 'number', data: [{ category: 'a', value: 900 }, { category: 'b', value: 4200 }] }),
      1,
    ) as unknown as { yAxis: { min: number; max?: number } };
    expect(numeric.yAxis.min).toBe(0);
    expect(numeric.yAxis.max).toBeUndefined();
  });

  it('emphasizes a highlighted point with the accent color', () => {
    const pts = buildAnimatedLineOption(lineSpec({ highlight: '6000+' }), 1) as unknown as {
      series: Array<{ data: Array<{ itemStyle: { color: string } }> }>;
    };
    const itemColors = pts.series[0].data.map((d) => d.itemStyle.color);
    expect(itemColors.slice(0, 6).every((c) => c === DARK_MINIMAL.primary)).toBe(true);
    expect(itemColors[6]).toBe(DARK_MINIMAL.accent);
  });

  it('disables native ECharts animation', () => {
    const option = buildAnimatedLineOption(lineSpec(), 0.5) as unknown as {
      animation: boolean;
      series: Array<{ animation: boolean }>;
    };
    expect(option.animation).toBe(false);
    expect(option.series[0].animation).toBe(false);
  });
});
