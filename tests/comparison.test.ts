import { describe, it, expect } from 'vitest';
import { buildComparisonOption } from '../src/templates/comparison.js';
import { parseCsv } from '../src/shared/csv.js';
import { SCALING_COMPARISON_CSV, SCALING_COMPARISON_0_3K_CSV } from '../src/presets/scalingComparison.js';
import { DARK_MINIMAL, DEFAULT_COMPOSITION, type ComparisonSpec } from '../src/shared/types.js';
import { TEMPLATE_META } from '../src/templates/index.js';
import { validateExportRequest } from '../server/validate.js';

function comparisonSpec(csv: string, over: Partial<ComparisonSpec> = {}): ComparisonSpec {
  const parsed = parseCsv(csv, 'percent');
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return {
    template: 'comparison',
    title: 'Comeback Rate by Champion Scaling',
    subtitle: '',
    data: parsed.data,
    valueMode: 'percent',
    highlight: null,
    theme: DARK_MINIMAL,
    ...over,
  };
}

function values(option: unknown): number[] {
  return (option as { series: Array<{ data: Array<{ value: number }> }> }).series[0].data.map((d) => d.value);
}

function request(data: Array<{ category: string; value: number }>) {
  return {
    chart: {
      template: 'comparison',
      title: 't',
      subtitle: '',
      data,
      valueMode: 'percent',
      highlight: null,
      theme: DARK_MINIMAL,
    },
    animation: { durationSeconds: 1, holdSeconds: 0.5, easing: 'ease-out', fps: 30 },
    composition: DEFAULT_COMPOSITION,
    format: 'mp4',
    filename: 'x',
    width: 1920,
    height: 1080,
  };
}

describe('comparison chart', () => {
  it('animates Demo 2 from zero to the exact source values', () => {
    const spec = comparisonSpec(SCALING_COMPARISON_CSV);
    expect(values(buildComparisonOption(spec, 0))).toEqual([0, 0, 0]);
    expect(values(buildComparisonOption(spec, 0.5))).toEqual([25.5 * 0.5, 29.7 * 0.5, 35.4 * 0.5]);
    expect(values(buildComparisonOption(spec, 1))).toEqual([25.5, 29.7, 35.4]);
  });

  it('animates Demo 3 from zero to the exact source values', () => {
    const spec = comparisonSpec(SCALING_COMPARISON_0_3K_CSV);
    expect(values(buildComparisonOption(spec, 0))).toEqual([0, 0, 0]);
    expect(values(buildComparisonOption(spec, 1))).toEqual([32.2, 41.2, 47.5]);
  });

  it('keeps category order and shows a zero-based 0-100 axis', () => {
    const option = buildComparisonOption(comparisonSpec(SCALING_COMPARISON_CSV), 1) as unknown as {
      xAxis: { data: string[] };
      yAxis: { min: number; max: number };
    };
    expect(option.xAxis.data).toEqual(['Scales Worse', 'Similar', 'Scales Better']);
    expect(option.yAxis.min).toBe(0);
    expect(option.yAxis.max).toBe(100);
  });

  it('supports sequential reveal without changing the endpoints', () => {
    const seq = comparisonSpec(SCALING_COMPARISON_CSV, { reveal: 'sequential' });
    const sim = comparisonSpec(SCALING_COMPARISON_CSV, { reveal: 'simultaneous' });
    expect(values(buildComparisonOption(seq, 0))).toEqual([0, 0, 0]);
    expect(values(buildComparisonOption(seq, 1))).toEqual([25.5, 29.7, 35.4]);
    expect(values(buildComparisonOption(seq, 0.4))).not.toEqual(values(buildComparisonOption(sim, 0.4)));
  });

  it('works with two categories', () => {
    const spec = comparisonSpec('category,value\nA,10\nB,20\n');
    expect(values(buildComparisonOption(spec, 1))).toEqual([10, 20]);
  });

  it('emphasizes one category with the accent color', () => {
    const option = buildComparisonOption(
      comparisonSpec(SCALING_COMPARISON_CSV, { highlight: 'Scales Better' }),
      1,
    ) as unknown as { series: Array<{ data: Array<{ itemStyle: { color: string } }> }> };
    const colors = option.series[0].data.map((d) => d.itemStyle.color);
    expect(colors).toEqual([DARK_MINIMAL.primary, DARK_MINIMAL.primary, DARK_MINIMAL.accent]);
  });

  it('declares a two-to-three category range', () => {
    expect(TEMPLATE_META.comparison.minCategories).toBe(2);
    expect(TEMPLATE_META.comparison.maxCategories).toBe(3);
  });

  it('is rejected server-side with fewer than two or more than three categories', () => {
    const one = validateExportRequest(request([{ category: 'A', value: 10 }]));
    expect(one.ok).toBe(false);
    if (!one.ok) expect(one.errors.join('\n')).toMatch(/between 2 and 3 categories; got 1/);

    const four = validateExportRequest(
      request([
        { category: 'A', value: 10 },
        { category: 'B', value: 20 },
        { category: 'C', value: 30 },
        { category: 'D', value: 40 },
      ]),
    );
    expect(four.ok).toBe(false);
    if (!four.ok) expect(four.errors.join('\n')).toMatch(/between 2 and 3 categories; got 4/);
  });

  it('accepts exactly two and exactly three categories server-side', () => {
    expect(validateExportRequest(request([{ category: 'A', value: 10 }, { category: 'B', value: 20 }])).ok).toBe(true);
    expect(
      validateExportRequest(
        request([
          { category: 'A', value: 10 },
          { category: 'B', value: 20 },
          { category: 'C', value: 30 },
        ]),
      ).ok,
    ).toBe(true);
  });
});
