import { describe, it, expect } from 'vitest';
import { buildAnimatedBarOption } from '../src/templates/animatedBar.js';
import { parseCsv } from '../src/shared/csv.js';
import { COMEBACK_CURVE, COMEBACK_CURVE_CSV } from '../src/presets/comebackCurve.js';
import { DARK_MINIMAL, type BarSpec } from '../src/shared/types.js';

function comebackSpec(): BarSpec {
  const parsed = parseCsv(COMEBACK_CURVE_CSV, 'percent');
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return {
    template: 'animated-bar',
    title: COMEBACK_CURVE.title,
    subtitle: COMEBACK_CURVE.subtitle,
    data: parsed.data,
    valueMode: 'percent',
    highlight: COMEBACK_CURVE.highlight,
    theme: DARK_MINIMAL,
  };
}

/** Narrow the loosely-typed ECharts option down to the bits under test. */
function barValues(option: unknown): number[] {
  const series = (option as { series: Array<{ data: Array<{ value: number }> }> }).series[0];
  return series.data.map((d) => d.value);
}
function barColors(option: unknown): string[] {
  const series = (option as { series: Array<{ data: Array<{ itemStyle: { color: string } }> }> }).series[0];
  return series.data.map((d) => d.itemStyle.color);
}

describe('animated bar chart state', () => {
  const spec = comebackSpec();

  it('renders every bar at zero on the first frame', () => {
    expect(barValues(buildAnimatedBarOption(spec, 0))).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('renders the exact source values at full progress', () => {
    expect(barValues(buildAnimatedBarOption(spec, 1))).toEqual([45.4, 37.4, 30.5, 21.1, 16.3, 12.4, 6.6]);
  });

  it('interpolates linearly between zero and the final value', () => {
    const half = barValues(buildAnimatedBarOption(spec, 0.5));
    expect(half[0]).toBeCloseTo(22.7, 10);
    expect(half[6]).toBeCloseTo(3.3, 10);
  });

  it('keeps category order identical to the source data', () => {
    const option = buildAnimatedBarOption(spec, 1) as unknown as { xAxis: { data: string[] } };
    expect(option.xAxis.data).toEqual(['0-999', '1000-1999', '2000-2999', '3000-3999', '4000-4999', '5000-5999', '6000+']);
  });

  it('pins a percentage axis to 0-100 so differences are not exaggerated', () => {
    const option = buildAnimatedBarOption(spec, 1) as unknown as { yAxis: { min: number; max: number } };
    expect(option.yAxis.min).toBe(0);
    expect(option.yAxis.max).toBe(100);
  });

  it('lets a numeric dataset use an auto-scaled axis with no percentage cap', () => {
    const numeric: BarSpec = { ...spec, valueMode: 'number', data: [{ category: 'a', value: 5000 }] };
    const option = buildAnimatedBarOption(numeric, 1) as unknown as { yAxis: { min: number; max?: number } };
    expect(option.yAxis.min).toBe(0);
    expect(option.yAxis.max).toBeUndefined();
  });

  it('suffixes percentage value labels with % and keeps the source precision', () => {
    const option = buildAnimatedBarOption(spec, 1) as unknown as {
      series: Array<{ label: { formatter: (p: { value?: unknown }) => string } }>;
    };
    expect(option.series[0].label.formatter({ value: 45.4 })).toBe('45.4%');
    expect(option.series[0].label.formatter({ value: 6.6 })).toBe('6.6%');
  });

  it('paints only the highlighted category with the accent color', () => {
    const colors = barColors(buildAnimatedBarOption(spec, 1));
    expect(colors.slice(0, 6).every((c) => c === DARK_MINIMAL.primary)).toBe(true);
    expect(colors[6]).toBe(DARK_MINIMAL.accent);
  });

  it('uses the primary color everywhere when no category is highlighted', () => {
    const colors = barColors(buildAnimatedBarOption({ ...spec, highlight: null }, 1));
    expect(colors.every((c) => c === DARK_MINIMAL.primary)).toBe(true);
  });

  it('carries the title and subtitle into the composition', () => {
    const option = buildAnimatedBarOption(spec, 1) as unknown as { title: { text: string; subtext: string } };
    expect(option.title.text).toBe('Comeback Rate by Gold Deficit');
    expect(option.title.subtext).toBe('Observed comeback rates among games continuing past 20 minutes.');
  });

  it('disables native ECharts animation so export frames are deterministic', () => {
    const option = buildAnimatedBarOption(spec, 0.4) as unknown as { animation: boolean };
    expect(option.animation).toBe(false);
  });
});
