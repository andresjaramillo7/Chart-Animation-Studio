import { describe, it, expect } from 'vitest';
import { columnKey, parseTable, readNumber } from '../src/shared/csv.js';
import { cellKey, parseHeatmapCsv, parseScatterCsv, parseSeriesCsv } from '../src/shared/schemas.js';
import { SCHEMA_HEADERS, TEMPLATE_IDS, TEMPLATE_META } from '../src/templates/index.js';
import { STACKED_EXAMPLE_CSV } from '../src/presets/examples.js';

describe('shared table parsing', () => {
  it('preserves header case so series keep their names', () => {
    const t = parseTable('Category,Series A,Series B\nG,1,2\n', 'category,Series A,Series B');
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.fields).toEqual(['Category', 'Series A', 'Series B']);
  });

  it('matches column names case-insensitively', () => {
    expect(columnKey(['X', 'Y'], 'x')).toBe('X');
    expect(columnKey(['X', 'Y'], 'label')).toBeNull();
  });

  it('rejects numbers a human would not accept', () => {
    expect(readNumber('12')).toBe(12);
    expect(readNumber('-4.5')).toBe(-4.5);
    expect(readNumber('.5')).toBe(0.5);
    expect(readNumber('1e5')).toBeNull();
    expect(readNumber('0x10')).toBeNull();
    expect(readNumber('twelve')).toBeNull();
    expect(readNumber('')).toBeNull();
    expect(readNumber(undefined)).toBeNull();
  });

  it('handles a BOM and CRLF the same as pasted text', () => {
    const uploaded = parseSeriesCsv('﻿category,A,B\r\nG1,1,2\r\n', 'number');
    const pasted = parseSeriesCsv('category,A,B\nG1,1,2\n', 'number');
    expect(uploaded.ok && pasted.ok).toBe(true);
    if (!uploaded.ok || !pasted.ok) return;
    expect(uploaded.table).toEqual(pasted.table);
  });
});

describe('every template declares its schema', () => {
  it('names the expected header for each template', () => {
    for (const id of TEMPLATE_IDS) {
      const meta = TEMPLATE_META[id];
      expect(SCHEMA_HEADERS[meta.schema], id).toBeDefined();
      expect(meta.needsData, id).toBe(meta.schema !== 'none');
    }
  });

  it('maps the five documented shapes', () => {
    expect(TEMPLATE_META.donut.schema).toBe('category-value');
    expect(TEMPLATE_META.area.schema).toBe('category-value');
    expect(TEMPLATE_META['stacked-bar'].schema).toBe('category-series');
    expect(TEMPLATE_META.scatter.schema).toBe('xy-label');
    expect(TEMPLATE_META.heatmap.schema).toBe('xy-value');
    expect(SCHEMA_HEADERS['xy-label']).toBe('x,y,label');
    expect(SCHEMA_HEADERS['xy-value']).toBe('x,y,value');
  });
});

describe('stacked bar schema', () => {
  it('reads the documented example', () => {
    const parsed = parseSeriesCsv(STACKED_EXAMPLE_CSV, 'number');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.table.categories).toEqual(['Group 1', 'Group 2', 'Group 3']);
    expect(parsed.table.series).toEqual([
      { name: 'Series A', values: [30, 45, 60] },
      { name: 'Series B', values: [70, 55, 40] },
    ]);
  });

  it('requires a category column and at least two series', () => {
    const noCategory = parseSeriesCsv('a,b\n1,2\n', 'number');
    expect(noCategory.ok).toBe(false);
    if (!noCategory.ok) expect(noCategory.errors.join('\n')).toMatch(/Missing required column: category/);

    const oneSeries = parseSeriesCsv('category,A\nG,1\n', 'number');
    expect(oneSeries.ok).toBe(false);
    if (!oneSeries.ok) expect(oneSeries.errors.join('\n')).toMatch(/at least two series columns; found 1/);
  });

  it('reports a missing cell with its series and category', () => {
    const parsed = parseSeriesCsv('category,A,B\nG1,1,2\nG2,3,\n', 'number');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.join('\n')).toMatch(/Line 3: missing value for "B" in "G2"/);
  });

  it('rejects duplicate categories and negative values', () => {
    const dup = parseSeriesCsv('category,A,B\nG,1,2\nG,3,4\n', 'number');
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.errors.join('\n')).toMatch(/duplicate category "G"/);

    const negative = parseSeriesCsv('category,A,B\nG,-1,2\n', 'number');
    expect(negative.ok).toBe(false);
    if (!negative.ok) expect(negative.errors.join('\n')).toMatch(/require non-negative values/);
  });

  it('enforces the 0-100 range only in percent mode', () => {
    expect(parseSeriesCsv('category,A,B\nG,140,10\n', 'percent').ok).toBe(false);
    expect(parseSeriesCsv('category,A,B\nG,140,10\n', 'number').ok).toBe(true);
  });
});

describe('scatter schema', () => {
  it('reads the documented example with optional labels', () => {
    const parsed = parseScatterCsv('x,y,label\n1000,45.4,A\n2000,37.4,B\n');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.table.hasLabels).toBe(true);
    expect(parsed.table.points).toEqual([
      { x: 1000, y: 45.4, label: 'A' },
      { x: 2000, y: 37.4, label: 'B' },
    ]);
  });

  it('works without the label column', () => {
    const parsed = parseScatterCsv('x,y\n1,2\n3,4\n');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.table.hasLabels).toBe(false);
    expect(parsed.table.points.every((p) => p.label === '')).toBe(true);
  });

  it('accepts negative coordinates', () => {
    const parsed = parseScatterCsv('x,y\n-5,-2.5\n');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.table.points[0]).toEqual({ x: -5, y: -2.5, label: '' });
  });

  it('reports missing columns and invalid numbers', () => {
    const missing = parseScatterCsv('x,label\n1,A\n');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors.join('\n')).toMatch(/Missing required column: y/);

    const invalid = parseScatterCsv('x,y\n1,abc\n');
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.errors.join('\n')).toMatch(/y value "abc" is not a plain number/);

    const blank = parseScatterCsv('x,y\n,5\n');
    expect(blank.ok).toBe(false);
    if (!blank.ok) expect(blank.errors.join('\n')).toMatch(/Line 2: missing x value/);
  });
});

describe('heatmap schema', () => {
  it('reads the documented example', () => {
    const parsed = parseHeatmapCsv('x,y,value\nGroup A,Low,25.5\nGroup B,Medium,41.2\n', 'percent');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.table.cells).toEqual([
      { x: 'Group A', y: 'Low', value: 25.5 },
      { x: 'Group B', y: 'Medium', value: 41.2 },
    ]);
    expect(parsed.table.min).toBe(25.5);
    expect(parsed.table.max).toBe(41.2);
  });

  it('reports a missing required column', () => {
    const parsed = parseHeatmapCsv('x,y\nA,Low\n', 'number');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.join('\n')).toMatch(/Missing required column: value/);
  });

  it('enforces the 0-100 range in percent mode only', () => {
    expect(parseHeatmapCsv('x,y,value\nA,Low,140\n', 'percent').ok).toBe(false);
    expect(parseHeatmapCsv('x,y,value\nA,Low,140\n', 'number').ok).toBe(true);
  });

  it('builds cell keys that cannot collide', () => {
    expect(cellKey('a,b', 'c')).not.toBe(cellKey('a', 'b,c'));
    expect(cellKey('A', 'Low')).toBe(cellKey('A', 'Low'));
  });
});
