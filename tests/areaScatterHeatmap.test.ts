import { describe, it, expect } from 'vitest';
import { buildAreaOption } from '../src/templates/area.js';
import { buildAnimatedLineOption, lineState } from '../src/templates/animatedLine.js';
import { buildScatterOption, scatterPointProgress } from '../src/templates/scatter.js';
import { buildHeatmapOption, heatmapState } from '../src/templates/heatmap.js';
import { parseCsv } from '../src/shared/csv.js';
import { cellKey, parseHeatmapCsv, parseScatterCsv } from '../src/shared/schemas.js';
import { COMEBACK_CURVE_CSV } from '../src/presets/comebackCurve.js';
import { HEATMAP_EXAMPLE_CSV, SCATTER_EXAMPLE_CSV } from '../src/presets/examples.js';
import {
  DARK_MINIMAL,
  type AreaSpec,
  type HeatmapSpec,
  type LineSpec,
  type ScatterSpec,
} from '../src/shared/types.js';
import { PORTRAIT } from '../src/shared/layout.js';

const COMEBACK = [45.4, 37.4, 30.5, 21.1, 16.3, 12.4, 6.6];

/* ------------------------------------------------------------------- area ---- */

function comebackData() {
  const parsed = parseCsv(COMEBACK_CURVE_CSV, 'percent');
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.data;
}

function areaSpec(over: Partial<AreaSpec> = {}): AreaSpec {
  return {
    template: 'area',
    title: 'Comeback Rate by Gold Deficit',
    subtitle: 'Observed comeback rates among games continuing past 20 minutes.',
    valueMode: 'percent',
    theme: DARK_MINIMAL,
    data: comebackData(),
    highlight: null,
    areaOpacity: 0.28,
    showPoints: true,
    ...over,
  };
}

type Point = { value: [number, number]; symbolSize?: number };
function points(option: unknown): Point[] {
  return (option as { series: Array<{ data: Point[] }> }).series[0].data;
}
function areaStyle(option: unknown): { opacity: number } | undefined {
  return (option as { series: Array<{ areaStyle?: { opacity: number } }> }).series[0].areaStyle;
}

describe('area chart', () => {
  it('fills under the line with the configured opacity', () => {
    expect(areaStyle(buildAreaOption(areaSpec({ areaOpacity: 0.4 }), 1))?.opacity).toBe(0.4);
    // A plain line has no fill at all.
    expect(areaStyle(buildAnimatedLineOption(areaSpec() as unknown as LineSpec, 1))).toBeUndefined();
  });

  it('ends the fill exactly where the partially drawn line ends', () => {
    for (const progress of [0, 0.17, 0.25, 0.5, 0.83, 1]) {
      const areaPoints = points(buildAreaOption(areaSpec(), progress));
      const linePoints = points(buildAnimatedLineOption(areaSpec() as unknown as LineSpec, progress));
      // Same polyline drives both the stroke and the fill, so the fill can never run ahead.
      expect(areaPoints.map((p) => p.value), `progress ${progress}`).toEqual(linePoints.map((p) => p.value));
      const state = lineState(COMEBACK, progress);
      expect(areaPoints[areaPoints.length - 1].value[0]).toBeCloseTo(state.head, 10);
    }
  });

  it('does not show a completed fill under a partial line', () => {
    const early = points(buildAreaOption(areaSpec(), 0.25));
    const full = points(buildAreaOption(areaSpec(), 1));
    expect(early.length).toBeLessThan(full.length);
    expect(early[early.length - 1].value[0]).toBeLessThan(6);
  });

  it('uses the source observations exactly at the final frame', () => {
    expect(points(buildAreaOption(areaSpec(), 1)).map((p) => p.value[1])).toEqual(COMEBACK);
  });

  it('can hide the data points while keeping the line and fill', () => {
    const hidden = points(buildAreaOption(areaSpec({ showPoints: false }), 1));
    expect(hidden.every((p) => p.symbolSize === 0)).toBe(true);
    expect(areaStyle(buildAreaOption(areaSpec({ showPoints: false }), 1))?.opacity).toBe(0.28);
  });

  it('keeps a percentage Y axis on 0-100', () => {
    const option = buildAreaOption(areaSpec(), 1) as unknown as { yAxis: { min: number; max: number } };
    expect(option.yAxis.min).toBe(0);
    expect(option.yAxis.max).toBe(100);
  });

  it('keeps exact values in portrait', () => {
    expect(points(buildAreaOption(areaSpec(), 1, PORTRAIT)).map((p) => p.value[1])).toEqual(COMEBACK);
  });
});

/* ---------------------------------------------------------------- scatter ---- */

function scatterSpec(over: Partial<ScatterSpec> = {}): ScatterSpec {
  const parsed = parseScatterCsv(SCATTER_EXAMPLE_CSV);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return {
    template: 'scatter',
    title: 'Example Relationship',
    subtitle: 'Illustrative example data, not a study result.',
    valueMode: 'number',
    theme: DARK_MINIMAL,
    points: parsed.table.points,
    xTitle: 'X value',
    yTitle: 'Y value',
    symbolSize: 34,
    reveal: 'sequential',
    highlight: null,
    ...over,
  };
}

type Dot = { value: [number, number]; symbolSize: number; itemStyle: { color: string; opacity: number } };
function dots(option: unknown): Dot[] {
  return (option as { series: Array<{ data: Dot[] }> }).series[0].data;
}

describe('scatter plot', () => {
  it('preserves the exact coordinates at every progress', () => {
    for (const progress of [0, 0.3, 0.6, 1]) {
      expect(dots(buildScatterOption(scatterSpec(), progress)).map((d) => d.value)).toEqual([
        [1000, 45.4],
        [2000, 37.4],
        [3000, 30.5],
      ]);
    }
  });

  it('keeps duplicate coordinates as separate observations', () => {
    const parsed = parseScatterCsv('x,y,label\n10,20,A\n10,20,B\n10,20,\n');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.table.points).toHaveLength(3);
    expect(dots(buildScatterOption(scatterSpec({ points: parsed.table.points }), 1))).toHaveLength(3);
  });

  it('animates only the symbol, from invisible to full size', () => {
    const start = dots(buildScatterOption(scatterSpec({ reveal: 'simultaneous' }), 0));
    expect(start.every((d) => d.symbolSize === 0 && d.itemStyle.opacity === 0)).toBe(true);
    const end = dots(buildScatterOption(scatterSpec({ reveal: 'simultaneous' }), 1));
    expect(end.every((d) => d.symbolSize === 34 && d.itemStyle.opacity === 1)).toBe(true);
  });

  it('reveals points in order when sequential, and together when simultaneous', () => {
    const seq = scatterPointProgress(scatterSpec({ reveal: 'sequential' }), 0.5);
    expect(seq[0]).toBeGreaterThan(seq[2]);
    const sim = scatterPointProgress(scatterSpec({ reveal: 'simultaneous' }), 0.5);
    expect(sim).toEqual([0.5, 0.5, 0.5]);
  });

  it('is deterministic: the same progress always gives the same state', () => {
    const a = scatterPointProgress(scatterSpec(), 0.37);
    const b = scatterPointProgress(scatterSpec(), 0.37);
    expect(a).toEqual(b);
  });

  it('emphasizes a point by its label', () => {
    const colors = dots(buildScatterOption(scatterSpec({ highlight: 'B' }), 1)).map((d) => d.itemStyle.color);
    expect(colors).toEqual([DARK_MINIMAL.primary, DARK_MINIMAL.accent, DARK_MINIMAL.primary]);
  });

  it('carries axis titles onto both numeric axes', () => {
    const option = buildScatterOption(scatterSpec(), 1) as unknown as {
      xAxis: { type: string; name: string };
      yAxis: { type: string; name: string };
    };
    expect(option.xAxis.type).toBe('value');
    expect(option.yAxis.type).toBe('value');
    expect(option.xAxis.name).toBe('X value');
    expect(option.yAxis.name).toBe('Y value');
  });
});

/* ---------------------------------------------------------------- heatmap ---- */

function heatSpec(csv = HEATMAP_EXAMPLE_CSV, over: Partial<HeatmapSpec> = {}): HeatmapSpec {
  const parsed = parseHeatmapCsv(csv, 'percent');
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return {
    template: 'heatmap',
    title: 'Example Grid',
    subtitle: 'Illustrative example data, not a study result.',
    valueMode: 'percent',
    theme: DARK_MINIMAL,
    xCategories: parsed.table.xCategories,
    yCategories: parsed.table.yCategories,
    cells: parsed.table.cells,
    heatReveal: 'simultaneous',
    highlight: null,
    ...over,
  };
}

type Cell = { value: [number, number, number]; itemStyle: { opacity: number } };
function cells(option: unknown): Cell[] {
  return (option as { series: Array<{ data: Cell[] }> }).series[0].data;
}

describe('heatmap', () => {
  it('keeps first-appearance order on both axes', () => {
    const parsed = parseHeatmapCsv('x,y,value\nZ,High,1\nA,Low,2\nZ,Low,3\n', 'number');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.table.xCategories).toEqual(['Z', 'A']);
    expect(parsed.table.yCategories).toEqual(['High', 'Low']);
  });

  it('rejects a duplicate x/y pair', () => {
    const parsed = parseHeatmapCsv('x,y,value\nA,Low,1\nA,Low,2\n', 'number');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.join('\n')).toMatch(/duplicate cell "A" \/ "Low"/);
  });

  it('never invents a missing combination', () => {
    // Three of the four grid positions are supplied; the fourth stays absent.
    const spec = heatSpec('x,y,value\nA,Low,10\nA,High,20\nB,Low,30\n');
    expect(spec.xCategories).toEqual(['A', 'B']);
    expect(spec.yCategories).toEqual(['Low', 'High']);
    expect(spec.cells).toHaveLength(3);
    expect(cells(buildHeatmapOption(spec, 1))).toHaveLength(3);
  });

  it('distinguishes a missing cell from a zero-valued one', () => {
    const withZero = heatSpec('x,y,value\nA,Low,0\nA,High,20\nB,Low,30\n');
    const drawn = cells(buildHeatmapOption(withZero, 1));
    // The zero cell is drawn at the bottom of the scale; the absent B/High is not drawn.
    expect(drawn).toHaveLength(3);
    expect(drawn.some((c) => c.value[2] === 0)).toBe(true);
    expect(drawn.every((c) => c.itemStyle.opacity === 1)).toBe(true);
  });

  it('rejects a missing or invalid value rather than defaulting it', () => {
    const missing = parseHeatmapCsv('x,y,value\nA,Low,\n', 'number');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors.join('\n')).toMatch(/missing value/);

    const invalid = parseHeatmapCsv('x,y,value\nA,Low,high\n', 'number');
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.errors.join('\n')).toMatch(/is not a plain number/);
  });

  it('draws no cells on the first frame and every cell on the last', () => {
    const spec = heatSpec();
    expect(cells(buildHeatmapOption(spec, 0))).toHaveLength(0);
    const final = cells(buildHeatmapOption(spec, 1));
    expect(final).toHaveLength(4);
    expect(final.map((c) => c.value[2])).toEqual([25.5, 29.7, 32.2, 41.2]);
  });

  it('reveals row by row when asked, and all at once otherwise', () => {
    const byRow = heatSpec(HEATMAP_EXAMPLE_CSV, { heatReveal: 'row' });
    const mid = heatmapState(byRow, 0.5);
    const lowRow = mid.filter((c) => c.y === 'Low');
    const mediumRow = mid.filter((c) => c.y === 'Medium');
    expect(lowRow[0].appeared).toBeGreaterThan(mediumRow[0].appeared);

    const together = heatmapState(heatSpec(HEATMAP_EXAMPLE_CSV, { heatReveal: 'simultaneous' }), 0.5);
    expect(together.every((c) => c.appeared === 0.5)).toBe(true);
  });

  it('leaves unrevealed cells out of the option entirely', () => {
    const byRow = heatSpec(HEATMAP_EXAMPLE_CSV, { heatReveal: 'row' });
    // With two rows the second opens at progress 0.259, so at 0.2 only the first is drawn.
    const partial = cells(buildHeatmapOption(byRow, 0.2));
    expect(partial).toHaveLength(2);
    expect(partial.every((c) => c.itemStyle.opacity > 0)).toBe(true);
    // The absent cells are simply not in the data, not drawn at zero.
    expect(partial.every((c) => c.value[1] === 0)).toBe(true);
  });

  it('uses a fixed 0-100 colour scale for percentages and a derived one for numbers', () => {
    const pct = buildHeatmapOption(heatSpec(), 1) as unknown as { visualMap: { min: number; max: number } };
    expect(pct.visualMap.min).toBe(0);
    expect(pct.visualMap.max).toBe(100);

    const numericParsed = parseHeatmapCsv('x,y,value\nA,Low,120\nB,Low,400\n', 'number');
    expect(numericParsed.ok).toBe(true);
    if (!numericParsed.ok) return;
    const numeric = buildHeatmapOption(
      {
        ...heatSpec(),
        valueMode: 'number',
        xCategories: numericParsed.table.xCategories,
        yCategories: numericParsed.table.yCategories,
        cells: numericParsed.table.cells,
      },
      1,
    ) as unknown as { visualMap: { min: number; max: number } };
    expect(numeric.visualMap.min).toBe(0);
    expect(numeric.visualMap.max).toBe(400);
  });

  it('emphasizes one cell by its key', () => {
    const spec = heatSpec(HEATMAP_EXAMPLE_CSV, { highlight: cellKey('Group B', 'Medium') });
    const drawn = buildHeatmapOption(spec, 1) as unknown as {
      series: Array<{ data: Array<{ itemStyle: { borderColor: string } }> }>;
    };
    const borders = drawn.series[0].data.map((d) => d.itemStyle.borderColor);
    expect(borders.filter((b) => b === DARK_MINIMAL.accent)).toHaveLength(1);
  });
});
