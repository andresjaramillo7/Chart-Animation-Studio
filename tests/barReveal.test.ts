import { describe, it, expect } from 'vitest';
import { buildAnimatedBarOption } from '../src/templates/animatedBar.js';
import { parseCsv } from '../src/shared/csv.js';
import { COMEBACK_CURVE_CSV } from '../src/presets/comebackCurve.js';
import { DARK_MINIMAL, type BarSpec } from '../src/shared/types.js';
import { itemProgress, staggeredProgress } from '../src/shared/timeline.js';
import { PORTRAIT } from '../src/shared/layout.js';

const SOURCE = [45.4, 37.4, 30.5, 21.1, 16.3, 12.4, 6.6];

function barSpec(over: Partial<BarSpec> = {}): BarSpec {
  const parsed = parseCsv(COMEBACK_CURVE_CSV, 'percent');
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return {
    template: 'animated-bar',
    title: 'Comeback Rate by Gold Deficit',
    subtitle: 'Observed comeback rates among games continuing past 20 minutes.',
    data: parsed.data,
    valueMode: 'percent',
    highlight: '6000+',
    theme: DARK_MINIMAL,
    ...over,
  };
}

function values(option: unknown): number[] {
  return (option as { series: Array<{ data: Array<{ value: number }> }> }).series[0].data.map((d) => d.value);
}
function colors(option: unknown): string[] {
  return (option as { series: Array<{ data: Array<{ itemStyle: { color: string } }> }> }).series[0].data.map(
    (d) => d.itemStyle.color,
  );
}

describe('sequential stagger maths', () => {
  it('leaves every item at zero on the first frame', () => {
    for (let i = 0; i < 7; i++) expect(staggeredProgress(i, 7, 0)).toBe(0);
  });

  it('brings every item to exactly 1 on the final frame', () => {
    for (let i = 0; i < 7; i++) expect(staggeredProgress(i, 7, 1)).toBe(1);
  });

  it('starts later items after earlier ones', () => {
    const mid = 0.5;
    const first = staggeredProgress(0, 7, mid);
    const last = staggeredProgress(6, 7, mid);
    expect(first).toBeGreaterThan(last);
    expect(last).toBeLessThan(1);
  });

  it('is monotonic in progress for a given item', () => {
    let previous = -1;
    for (let step = 0; step <= 20; step++) {
      const p = staggeredProgress(3, 7, step / 20);
      expect(p).toBeGreaterThanOrEqual(previous);
      previous = p;
    }
  });

  it('falls back to the global progress for a single item', () => {
    expect(staggeredProgress(0, 1, 0.37)).toBeCloseTo(0.37, 10);
  });

  it('gives every item the global progress in simultaneous mode', () => {
    for (let i = 0; i < 7; i++) expect(itemProgress(i, 7, 0.4, 'simultaneous')).toBeCloseTo(0.4, 10);
  });
});

describe('bar reveal modes', () => {
  it('simultaneous: all bars share one progress', () => {
    const half = values(buildAnimatedBarOption(barSpec({ reveal: 'simultaneous' }), 0.5));
    expect(half).toEqual(SOURCE.map((v) => v * 0.5));
  });

  it('sequential: first frame is all zero, final frame is every original value', () => {
    const spec = barSpec({ reveal: 'sequential' });
    expect(values(buildAnimatedBarOption(spec, 0))).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(values(buildAnimatedBarOption(spec, 1))).toEqual(SOURCE);
  });

  it('sequential: an intermediate frame shows uneven progress across categories', () => {
    const mid = values(buildAnimatedBarOption(barSpec({ reveal: 'sequential' }), 0.5));
    const fractions = mid.map((v, i) => v / SOURCE[i]);
    expect(fractions[0]).toBeGreaterThan(fractions[6]);
    expect(fractions[0]).toBeCloseTo(1, 6);
  });

  it('sequential and simultaneous differ mid-animation but agree at both ends', () => {
    const seq = barSpec({ reveal: 'sequential' });
    const sim = barSpec({ reveal: 'simultaneous' });
    expect(values(buildAnimatedBarOption(seq, 0.4))).not.toEqual(values(buildAnimatedBarOption(sim, 0.4)));
    expect(values(buildAnimatedBarOption(seq, 0))).toEqual(values(buildAnimatedBarOption(sim, 0)));
    expect(values(buildAnimatedBarOption(seq, 1))).toEqual(values(buildAnimatedBarOption(sim, 1)));
  });

  it('defaults to simultaneous when no reveal is given', () => {
    const spec = barSpec();
    delete spec.reveal;
    expect(values(buildAnimatedBarOption(spec, 0.5))).toEqual(SOURCE.map((v) => v * 0.5));
  });
});

describe('bar orientation', () => {
  it('vertical puts categories on X and the value scale on Y', () => {
    const option = buildAnimatedBarOption(barSpec({ orientation: 'vertical' }), 1) as unknown as {
      xAxis: { type: string; data: string[] };
      yAxis: { type: string; min: number; max: number };
      series: Array<{ label: { position: string } }>;
    };
    expect(option.xAxis.type).toBe('category');
    expect(option.xAxis.data[0]).toBe('0-999');
    expect(option.yAxis.type).toBe('value');
    expect(option.yAxis.min).toBe(0);
    expect(option.yAxis.max).toBe(100);
    expect(option.series[0].label.position).toBe('top');
  });

  it('horizontal puts categories on Y in source reading order and keeps a 0-100 X axis', () => {
    const option = buildAnimatedBarOption(barSpec({ orientation: 'horizontal' }), 1) as unknown as {
      xAxis: { type: string; min: number; max: number };
      yAxis: { type: string; data: string[]; inverse: boolean };
      series: Array<{ label: { position: string } }>;
    };
    expect(option.yAxis.type).toBe('category');
    expect(option.yAxis.data).toEqual([
      '0-999', '1000-1999', '2000-2999', '3000-3999', '4000-4999', '5000-5999', '6000+',
    ]);
    // Inverted so the first category reads at the top rather than the bottom.
    expect(option.yAxis.inverse).toBe(true);
    expect(option.xAxis.type).toBe('value');
    expect(option.xAxis.min).toBe(0);
    expect(option.xAxis.max).toBe(100);
    expect(option.series[0].label.position).toBe('right');
  });

  it('animates identically in both orientations', () => {
    expect(values(buildAnimatedBarOption(barSpec({ orientation: 'horizontal' }), 0))).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(values(buildAnimatedBarOption(barSpec({ orientation: 'horizontal' }), 1))).toEqual(SOURCE);
  });

  it('highlights the chosen category in both orientations', () => {
    for (const orientation of ['vertical', 'horizontal'] as const) {
      const c = colors(buildAnimatedBarOption(barSpec({ orientation }), 1));
      expect(c.slice(0, 6).every((x) => x === DARK_MINIMAL.primary)).toBe(true);
      expect(c[6]).toBe(DARK_MINIMAL.accent);
    }
  });

  it('keeps final values exact in portrait as well as landscape', () => {
    expect(values(buildAnimatedBarOption(barSpec({ orientation: 'horizontal' }), 1, PORTRAIT))).toEqual(SOURCE);
  });
});
