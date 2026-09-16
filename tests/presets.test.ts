import { describe, it, expect } from 'vitest';
import { PRESETS, getPreset } from '../src/presets/index.js';
import { COMEBACK_CURVE_CSV } from '../src/presets/comebackCurve.js';
import { SCALING_COMPARISON_CSV, SCALING_COMPARISON_0_3K_CSV } from '../src/presets/scalingComparison.js';
import { BIG_NUMBER_VARIANTS } from '../src/presets/bigNumbers.js';
import { parseCsv } from '../src/shared/csv.js';
import { parseHeatmapCsv, parseScatterCsv, parseSeriesCsv } from '../src/shared/schemas.js';
import { ILLUSTRATIVE } from '../src/presets/examples.js';
import { TEMPLATE_IDS, TEMPLATE_META } from '../src/templates/index.js';

describe('preset data integrity', () => {
  it('ships one immediately selectable preset per template family', () => {
    expect(PRESETS.map((p) => p.id)).toEqual([
      'comeback-curve',
      'comeback-curve-line',
      'comeback-curve-area',
      'scaling-comparison',
      'scaling-comparison-0-3k',
      'big-numbers',
      'donut-example',
      'stacked-example',
      'scatter-example',
      'heatmap-example',
    ]);
  });

  it('covers every registered template with at least one preset', () => {
    const covered = new Set(PRESETS.map((p) => p.template));
    for (const id of TEMPLATE_IDS) expect(covered.has(id), id).toBe(true);
  });

  it('labels every synthetic example as illustrative, and no real preset as such', () => {
    const synthetic = ['donut-example', 'stacked-example', 'scatter-example', 'heatmap-example'];
    for (const preset of PRESETS) {
      expect(preset.subtitle === ILLUSTRATIVE, preset.id).toBe(synthetic.includes(preset.id));
    }
  });

  it('reuses the real Comeback Curve data for the Area preset', () => {
    const area = getPreset('comeback-curve-area');
    expect(area?.template).toBe('area');
    expect(area?.csv).toBe(COMEBACK_CURVE_CSV);
  });

  it('keeps the Comeback Curve values exactly as supplied', () => {
    const parsed = parseCsv(COMEBACK_CURVE_CSV, 'percent');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data).toEqual([
      { category: '0-999', value: 45.4 },
      { category: '1000-1999', value: 37.4 },
      { category: '2000-2999', value: 30.5 },
      { category: '3000-3999', value: 21.1 },
      { category: '4000-4999', value: 16.3 },
      { category: '5000-5999', value: 12.4 },
      { category: '6000+', value: 6.6 },
    ]);
  });

  it('keeps Demo 2 — Scaling Comparison exactly as supplied', () => {
    const parsed = parseCsv(SCALING_COMPARISON_CSV, 'percent');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data).toEqual([
      { category: 'Scales Worse', value: 25.5 },
      { category: 'Similar', value: 29.7 },
      { category: 'Scales Better', value: 35.4 },
    ]);
  });

  it('keeps Demo 3 — Scaling Comparison at 0-3k exactly as supplied', () => {
    const parsed = parseCsv(SCALING_COMPARISON_0_3K_CSV, 'percent');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data).toEqual([
      { category: 'Scales Worse', value: 32.2 },
      { category: 'Similar', value: 41.2 },
      { category: 'Scales Better', value: 47.5 },
    ]);
  });

  it('gives the comparison presets the exact titles and subtitles supplied', () => {
    const demo2 = getPreset('scaling-comparison');
    expect(demo2?.title).toBe('Comeback Rate by Champion Scaling');
    expect(demo2?.subtitle).toBe('');

    const demo3 = getPreset('scaling-comparison-0-3k');
    expect(demo3?.title).toBe('Comeback Rate by Champion Scaling');
    expect(demo3?.subtitle).toBe('0–3,000 gold deficit');
  });

  it('marks the Comeback Curve preset as percentage data', () => {
    expect(getPreset('comeback-curve')?.valueMode).toBe('percent');
  });

  it('offers three individually selectable Big Number variants', () => {
    const preset = getPreset('big-numbers');
    expect(preset?.template).toBe('big-number');
    expect(preset?.variants?.map((v) => v.id)).toEqual(['a', 'b', 'c']);
    expect(BIG_NUMBER_VARIANTS.map((v) => v.value)).toEqual([11149, 5.6, 5968.5]);
  });

  it('parses every dataset preset with the schema its template declares', () => {
    for (const preset of PRESETS) {
      if (!preset.csv) continue;
      const meta = TEMPLATE_META[preset.template];
      switch (meta.schema) {
        case 'category-value': {
          const parsed = parseCsv(preset.csv, preset.valueMode);
          expect(parsed.ok, `${preset.id} should parse`).toBe(true);
          if (!parsed.ok) break;
          expect(parsed.data.length).toBeGreaterThanOrEqual(meta.minCategories);
          expect(parsed.data.length).toBeLessThanOrEqual(meta.maxCategories);
          break;
        }
        case 'category-series': {
          const parsed = parseSeriesCsv(preset.csv, preset.valueMode);
          expect(parsed.ok, `${preset.id} should parse`).toBe(true);
          if (parsed.ok) expect(parsed.table.series.length).toBeGreaterThanOrEqual(2);
          break;
        }
        case 'xy-label': {
          const parsed = parseScatterCsv(preset.csv);
          expect(parsed.ok, `${preset.id} should parse`).toBe(true);
          break;
        }
        case 'xy-value': {
          const parsed = parseHeatmapCsv(preset.csv, preset.valueMode);
          expect(parsed.ok, `${preset.id} should parse`).toBe(true);
          break;
        }
        default:
          throw new Error(`${preset.id} has a csv but schema ${meta.schema}`);
      }
    }
  });

  it('only highlights a category that exists in its own dataset', () => {
    for (const preset of PRESETS) {
      if (!preset.csv || !preset.highlight) continue;
      if (TEMPLATE_META[preset.template].schema !== 'category-value') continue;
      const parsed = parseCsv(preset.csv, preset.valueMode);
      if (!parsed.ok) continue;
      expect(parsed.data.some((d) => d.category === preset.highlight)).toBe(true);
    }
  });
});

describe('CSV upload parsing', () => {
  it('reads a Windows file with CRLF line endings and a BOM', () => {
    const uploaded = '﻿category,value\r\nScales Worse,25.5\r\nSimilar,29.7\r\nScales Better,35.4\r\n';
    const parsed = parseCsv(uploaded, 'percent');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data).toEqual([
      { category: 'Scales Worse', value: 25.5 },
      { category: 'Similar', value: 29.7 },
      { category: 'Scales Better', value: 35.4 },
    ]);
  });

  it('tolerates surrounding whitespace and a mixed-case header', () => {
    const parsed = parseCsv('\n  Category,Value  \n a , 1 \n b , 2 \n', 'number');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data).toEqual([
      { category: 'a', value: 1 },
      { category: 'b', value: 2 },
    ]);
  });

  it('reports an uploaded file that is missing the value column', () => {
    const parsed = parseCsv('category,rate\r\na,1\r\n', 'number');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.join('\n')).toMatch(/Missing required column: value/);
  });
});
