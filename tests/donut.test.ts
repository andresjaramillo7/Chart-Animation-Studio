import { describe, it, expect } from 'vitest';
import { buildDonutOption, donutState } from '../src/templates/donut.js';
import { parseCsv } from '../src/shared/csv.js';
import { DONUT_TOTAL_TOLERANCE, donutProportions, validateDonutData } from '../src/shared/schemas.js';
import { DONUT_EXAMPLE_CSV } from '../src/presets/examples.js';
import { DARK_MINIMAL, type DonutSpec } from '../src/shared/types.js';
import { PORTRAIT } from '../src/shared/layout.js';

const SOURCE = [60, 25, 15];

function donutSpec(over: Partial<DonutSpec> = {}): DonutSpec {
  const parsed = parseCsv(DONUT_EXAMPLE_CSV, 'percent');
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return {
    template: 'donut',
    title: 'Example Share of Total',
    subtitle: 'Illustrative example data, not a study result.',
    data: parsed.data,
    valueMode: 'percent',
    highlight: null,
    theme: DARK_MINIMAL,
    innerRadius: 58,
    display: 'percent',
    showTotal: false,
    centerLabel: '',
    ...over,
  };
}

type Slice = { name: string; value: number; itemStyle: { color: string }; label: { show: boolean } };
function slices(option: unknown): Slice[] {
  return (option as { series: Array<{ data: Slice[] }> }).series[0].data;
}
/** Real segments, excluding the invisible remainder that keeps the ring 360 degrees. */
function segments(option: unknown): Slice[] {
  return slices(option).filter((s) => s.name !== '');
}

describe('donut sweep', () => {
  it('shows nothing drawn on the first frame', () => {
    const state = donutState(SOURCE, 0);
    expect(state.map((s) => s.visible)).toEqual([0, 0, 0]);
  });

  it('shows the exact source proportions on the final frame', () => {
    const state = donutState(SOURCE, 1);
    expect(state.map((s) => s.visible)).toEqual([216, 90, 54]);
    expect(state.map((s) => s.span)).toEqual([216, 90, 54]);
    // 60/25/15 of 360 degrees.
    expect(state.reduce((sum, s) => sum + s.visible, 0)).toBeCloseTo(360, 10);
  });

  it('genuinely part-draws segments rather than fading in a whole donut', () => {
    // Half a sweep is 180 degrees: the first segment (216) is partly drawn, the rest none.
    const state = donutState(SOURCE, 0.5);
    expect(state[0].visible).toBeCloseTo(180, 10);
    expect(state[0].visible).toBeLessThan(state[0].span);
    expect(state[1].visible).toBe(0);
    expect(state[2].visible).toBe(0);
  });

  it('opens segments strictly in source order', () => {
    // 0.7 * 360 = 252: first complete (216), second partly (36 of 90), third untouched.
    const state = donutState(SOURCE, 0.7);
    expect(state[0].visible).toBeCloseTo(216, 10);
    expect(state[1].visible).toBeCloseTo(36, 10);
    expect(state[2].visible).toBe(0);
  });

  it('never runs backwards and never exceeds a segment span', () => {
    for (let step = 0; step <= 30; step++) {
      const state = donutState(SOURCE, step / 30);
      state.forEach((s, i) => {
        expect(s.visible).toBeGreaterThanOrEqual(0);
        expect(s.visible).toBeLessThanOrEqual(s.span + 1e-9);
        if (step > 0) {
          const previous = donutState(SOURCE, (step - 1) / 30)[i].visible;
          expect(s.visible).toBeGreaterThanOrEqual(previous - 1e-9);
        }
      });
    }
  });
});

describe('donut data integrity', () => {
  it('accepts percentages that total 100', () => {
    expect(validateDonutData([{ category: 'a', value: 60 }, { category: 'b', value: 40 }], 'percent')).toEqual([]);
  });

  it('never silently normalizes percentages that do not total 100', () => {
    const errors = validateDonutData([{ category: 'a', value: 60 }, { category: 'b', value: 25 }], 'percent');
    expect(errors.join('\n')).toMatch(/total 85%, not 100%/);
  });

  it('absorbs floating-point error but not a real mistake', () => {
    const drift = [
      { category: 'a', value: 33.33 },
      { category: 'b', value: 33.33 },
      { category: 'c', value: 33.34 },
    ];
    expect(validateDonutData(drift, 'percent')).toEqual([]);
    expect(DONUT_TOTAL_TOLERANCE).toBe(0.01);

    const wrong = [
      { category: 'a', value: 33.3 },
      { category: 'b', value: 33.3 },
      { category: 'c', value: 33.3 },
    ];
    expect(validateDonutData(wrong, 'percent').length).toBeGreaterThan(0);
  });

  it('rejects negative values', () => {
    const errors = validateDonutData([{ category: 'a', value: -1 }, { category: 'b', value: 101 }], 'number');
    expect(errors.join('\n')).toMatch(/cannot be negative/);
  });

  it('rejects an all-zero dataset', () => {
    const errors = validateDonutData([{ category: 'a', value: 0 }, { category: 'b', value: 0 }], 'number');
    expect(errors.join('\n')).toMatch(/no whole to divide/);
  });

  it('derives proportions from numeric values without requiring a total of 100', () => {
    const numeric = [
      { category: 'a', value: 30 },
      { category: 'b', value: 10 },
    ];
    expect(validateDonutData(numeric, 'number')).toEqual([]);
    expect(donutProportions(numeric)).toEqual([75, 25]);
  });

  it('leaves the source values untouched when deriving proportions', () => {
    const rows = [{ category: 'a', value: 7 }, { category: 'b', value: 13 }];
    const copy = rows.map((r) => ({ ...r }));
    donutProportions(rows);
    expect(rows).toEqual(copy);
  });
});

describe('donut option', () => {
  it('ends on the exact source proportions in source order', () => {
    const final = segments(buildDonutOption(donutSpec(), 1));
    expect(final.map((s) => s.name)).toEqual(['Category A', 'Category B', 'Category C']);
    expect(final.map((s) => s.value)).toEqual([216, 90, 54]);
  });

  it('adds an invisible remainder only while the ring is still opening', () => {
    const partial = slices(buildDonutOption(donutSpec(), 0.5));
    expect(partial).toHaveLength(4);
    expect(partial[3].itemStyle.color).toBe('transparent');
    expect(partial.reduce((sum, s) => sum + s.value, 0)).toBeCloseTo(360, 10);

    const complete = slices(buildDonutOption(donutSpec(), 1));
    expect(complete).toHaveLength(3);
  });

  it('sweeps clockwise from twelve o clock', () => {
    const option = buildDonutOption(donutSpec(), 0.5) as unknown as {
      series: Array<{ startAngle: number; clockwise: boolean; radius: [string, string] }>;
    };
    expect(option.series[0].startAngle).toBe(90);
    expect(option.series[0].clockwise).toBe(true);
  });

  it('honours the configured inner radius', () => {
    const thin = buildDonutOption(donutSpec({ innerRadius: 20 }), 1) as unknown as {
      series: Array<{ radius: [string, string] }>;
    };
    const thick = buildDonutOption(donutSpec({ innerRadius: 80 }), 1) as unknown as {
      series: Array<{ radius: [string, string] }>;
    };
    expect(parseFloat(thin.series[0].radius[0])).toBeLessThan(parseFloat(thick.series[0].radius[0]));
    expect(parseFloat(thin.series[0].radius[0])).toBeGreaterThan(0);
  });

  it('labels segments with their share or with the source value', () => {
    const asPercent = segments(buildDonutOption(donutSpec({ display: 'percent' }), 1)) as unknown as Array<{
      label: { formatter: string };
    }>;
    expect(asPercent[0].label.formatter).toContain('Category A');
    expect(asPercent[0].label.formatter).toContain('60.0%');

    const asValue = segments(buildDonutOption(donutSpec({ display: 'value' }), 1)) as unknown as Array<{
      label: { formatter: string };
    }>;
    expect(asValue[0].label.formatter).toContain('60%');
  });

  it('emphasizes one segment with the accent color', () => {
    const colors = segments(buildDonutOption(donutSpec({ highlight: 'Category B' }), 1)).map((s) => s.itemStyle.color);
    expect(colors[1]).toBe(DARK_MINIMAL.accent);
    expect(colors[0]).not.toBe(DARK_MINIMAL.accent);
  });

  it('can show an animated total in the centre', () => {
    const option = buildDonutOption(donutSpec({ showTotal: true, centerLabel: 'Total' }), 1) as unknown as {
      graphic: Array<{ type: string; style?: { text?: string } }>;
    };
    const texts = option.graphic.filter((g) => g.type === 'text').map((g) => g.style?.text);
    expect(texts).toContain('100%');
    expect(texts).toContain('Total');

    const half = buildDonutOption(donutSpec({ showTotal: true }), 0.5) as unknown as {
      graphic: Array<{ type: string; style?: { text?: string } }>;
    };
    expect(half.graphic.find((g) => g.type === 'text' && g.style?.text !== undefined)?.style?.text).toBe('50%');
  });

  it('keeps the exact final proportions in portrait', () => {
    expect(segments(buildDonutOption(donutSpec(), 1, PORTRAIT)).map((s) => s.value)).toEqual([216, 90, 54]);
  });

  it('disables native ECharts animation', () => {
    const option = buildDonutOption(donutSpec(), 0.4) as unknown as {
      animation: boolean;
      series: Array<{ animation: boolean }>;
    };
    expect(option.animation).toBe(false);
    expect(option.series[0].animation).toBe(false);
  });
});
