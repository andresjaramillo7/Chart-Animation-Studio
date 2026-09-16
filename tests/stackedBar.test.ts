import { describe, it, expect } from 'vitest';
import { buildStackedBarOption, stackedValues } from '../src/templates/stackedBar.js';
import {
  categoryTotals,
  parseSeriesCsv,
  stackProportions,
  validatePercentStack,
} from '../src/shared/schemas.js';
import { STACKED_EXAMPLE_CSV } from '../src/presets/examples.js';
import { DARK_MINIMAL, type StackedBarSpec } from '../src/shared/types.js';

function table(csv = STACKED_EXAMPLE_CSV) {
  const parsed = parseSeriesCsv(csv, 'number');
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.table;
}

function stackedSpec(over: Partial<StackedBarSpec> = {}): StackedBarSpec {
  const t = table();
  return {
    template: 'stacked-bar',
    title: 'Example Composition by Group',
    subtitle: 'Illustrative example data, not a study result.',
    valueMode: 'number',
    theme: DARK_MINIMAL,
    categories: t.categories,
    series: t.series,
    stackMode: 'regular',
    orientation: 'vertical',
    reveal: 'simultaneous',
    highlight: null,
    ...over,
  };
}

function seriesValues(option: unknown): number[][] {
  return (option as { series: Array<{ data: Array<{ value: number }> }> }).series.map((s) =>
    s.data.map((d) => d.value),
  );
}

describe('stacked bar ordering', () => {
  it('preserves category order and series order from the source', () => {
    const t = table();
    expect(t.categories).toEqual(['Group 1', 'Group 2', 'Group 3']);
    expect(t.series.map((s) => s.name)).toEqual(['Series A', 'Series B']);
    expect(t.series[0].values).toEqual([30, 45, 60]);
    expect(t.series[1].values).toEqual([70, 55, 40]);
  });

  it('carries that order into the option', () => {
    const option = buildStackedBarOption(stackedSpec(), 1) as unknown as {
      xAxis: { data: string[] };
      series: Array<{ name: string; stack: string }>;
    };
    expect(option.xAxis.data).toEqual(['Group 1', 'Group 2', 'Group 3']);
    expect(option.series.map((s) => s.name)).toEqual(['Series A', 'Series B']);
    expect(option.series.every((s) => s.stack === 'total')).toBe(true);
  });

  it('gives a series the same colour regardless of the data it holds', () => {
    const first = buildStackedBarOption(stackedSpec(), 1) as unknown as {
      series: Array<{ data: Array<{ itemStyle: { color: string } }> }>;
    };
    const swapped = buildStackedBarOption(
      stackedSpec({ categories: ['Only'], series: [
        { name: 'Series A', values: [5] },
        { name: 'Series B', values: [5] },
      ] }),
      1,
    ) as unknown as { series: Array<{ data: Array<{ itemStyle: { color: string } }> }> };
    expect(swapped.series[0].data[0].itemStyle.color).toBe(first.series[0].data[0].itemStyle.color);
    expect(swapped.series[1].data[0].itemStyle.color).toBe(first.series[1].data[0].itemStyle.color);
  });
});

describe('regular versus 100% stacked calculations', () => {
  it('regular mode preserves the raw values exactly', () => {
    expect(stackedValues(stackedSpec({ stackMode: 'regular' }), 1)).toEqual([
      [30, 45, 60],
      [70, 55, 40],
    ]);
  });

  it('100% mode derives proportions from each category total', () => {
    // Every category here happens to total 100, so the proportions equal the values.
    expect(categoryTotals(table())).toEqual([100, 100, 100]);
    expect(stackedValues(stackedSpec({ stackMode: 'percent' }), 1)).toEqual([
      [30, 45, 60],
      [70, 55, 40],
    ]);
  });

  it('100% mode genuinely normalizes a category that does not total 100', () => {
    const uneven = {
      categories: ['G'],
      series: [
        { name: 'A', values: [30] },
        { name: 'B', values: [10] },
      ],
      decimals: 0,
    };
    expect(stackProportions(uneven)).toEqual([[75], [25]]);
    // The raw values are untouched by the derived view.
    expect(uneven.series[0].values).toEqual([30]);
    expect(uneven.series[1].values).toEqual([10]);
  });

  it('does not convert raw values to percentages in regular mode', () => {
    const uneven = stackedSpec({
      categories: ['G'],
      series: [
        { name: 'A', values: [30] },
        { name: 'B', values: [10] },
      ],
      stackMode: 'regular',
    });
    expect(stackedValues(uneven, 1)).toEqual([[30], [10]]);
  });

  it('pins the 100% axis to 0-100 and leaves a raw stack auto-scaled', () => {
    const pct = buildStackedBarOption(stackedSpec({ stackMode: 'percent' }), 1) as unknown as {
      yAxis: { min: number; max: number };
    };
    expect(pct.yAxis.min).toBe(0);
    expect(pct.yAxis.max).toBe(100);

    const raw = buildStackedBarOption(
      stackedSpec({ stackMode: 'regular', valueMode: 'number' }),
      1,
    ) as unknown as { yAxis: { min: number; max?: number } };
    expect(raw.yAxis.min).toBe(0);
    expect(raw.yAxis.max).toBeUndefined();
  });

  it('rejects a category whose total is zero in 100% mode', () => {
    const zeroed = {
      categories: ['Fine', 'Empty'],
      series: [
        { name: 'A', values: [5, 0] },
        { name: 'B', values: [5, 0] },
      ],
      decimals: 0,
    };
    const errors = validatePercentStack(zeroed);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/"Empty" totals zero/);
    expect(validatePercentStack(table())).toEqual([]);
  });
});

describe('stacked bar animation', () => {
  it('grows every stack from zero to its exact final value', () => {
    expect(stackedValues(stackedSpec(), 0)).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(stackedValues(stackedSpec(), 1)).toEqual([
      [30, 45, 60],
      [70, 55, 40],
    ]);
  });

  it('scales a whole stack together so segments do not float apart', () => {
    const half = stackedValues(stackedSpec(), 0.5);
    // Both series in a category share the same fraction.
    expect(half[0][0] / 30).toBeCloseTo(half[1][0] / 70, 10);
  });

  it('staggers categories in sequential mode but still ends exactly', () => {
    const seq = stackedSpec({ reveal: 'sequential' });
    expect(stackedValues(seq, 0)).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(stackedValues(seq, 1)).toEqual([
      [30, 45, 60],
      [70, 55, 40],
    ]);
    const mid = stackedValues(seq, 0.5);
    expect(mid[0][0] / 30).toBeGreaterThan(mid[0][2] / 60);
    expect(stackedValues(seq, 0.4)).not.toEqual(stackedValues(stackedSpec(), 0.4));
  });

  it('supports both orientations without changing the values', () => {
    const horizontal = buildStackedBarOption(stackedSpec({ orientation: 'horizontal' }), 1) as unknown as {
      yAxis: { type: string; data: string[]; inverse: boolean };
      xAxis: { type: string };
    };
    expect(horizontal.yAxis.type).toBe('category');
    expect(horizontal.yAxis.data).toEqual(['Group 1', 'Group 2', 'Group 3']);
    expect(horizontal.yAxis.inverse).toBe(true);
    expect(horizontal.xAxis.type).toBe('value');
    expect(seriesValues(buildStackedBarOption(stackedSpec({ orientation: 'horizontal' }), 1))).toEqual([
      [30, 45, 60],
      [70, 55, 40],
    ]);
  });

  it('hides labels on segments too small to hold them', () => {
    const lopsided = stackedSpec({
      categories: ['G'],
      series: [
        { name: 'Big', values: [99] },
        { name: 'Tiny', values: [1] },
      ],
    });
    const option = buildStackedBarOption(lopsided, 1) as unknown as {
      series: Array<{ data: Array<{ label: { show: boolean } }> }>;
    };
    expect(option.series[0].data[0].label.show).toBe(true);
    expect(option.series[1].data[0].label.show).toBe(false);
  });

  it('offers a legend naming every series', () => {
    const option = buildStackedBarOption(stackedSpec(), 1) as unknown as {
      legend: { show: boolean; data: Array<{ name: string }> };
    };
    expect(option.legend.show).toBe(true);
    expect(option.legend.data.map((d) => d.name)).toEqual(['Series A', 'Series B']);
  });
});
