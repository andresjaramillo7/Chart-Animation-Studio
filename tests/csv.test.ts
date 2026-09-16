import { describe, it, expect } from 'vitest';
import { parseCsv } from '../src/shared/csv.js';
import { COMEBACK_CURVE_CSV } from '../src/presets/comebackCurve.js';

describe('parseCsv', () => {
  it('parses the real Comeback Curve dataset without altering any value', () => {
    const result = parseCsv(COMEBACK_CURVE_CSV, 'percent');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Exact source values — nothing normalized, rescaled, reordered or rounded.
    expect(result.data).toEqual([
      { category: '0-999', value: 45.4 },
      { category: '1000-1999', value: 37.4 },
      { category: '2000-2999', value: 30.5 },
      { category: '3000-3999', value: 21.1 },
      { category: '4000-4999', value: 16.3 },
      { category: '5000-5999', value: 12.4 },
      { category: '6000+', value: 6.6 },
    ]);
    expect(result.decimals).toBe(1);
  });

  it('preserves category order rather than sorting by value', () => {
    const result = parseCsv('category,value\nzebra,1\nalpha,99\nmid,50\n', 'number');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((d) => d.category)).toEqual(['zebra', 'alpha', 'mid']);
  });

  it('rejects a missing required column', () => {
    const result = parseCsv('category,amount\na,1\n', 'number');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/Missing required column: value/);
  });

  it('rejects a missing value', () => {
    const result = parseCsv('category,value\na,1\nb,\n', 'number');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('\n')).toMatch(/Line 3: missing value for category "b"/);
  });

  it('rejects a missing category', () => {
    const result = parseCsv('category,value\n,12\n', 'number');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('\n')).toMatch(/Line 2: missing category/);
  });

  it('rejects non-numeric values', () => {
    const result = parseCsv('category,value\na,twelve\n', 'number');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('\n')).toMatch(/is not a plain number/);
  });

  it('rejects duplicate categories', () => {
    const result = parseCsv('category,value\na,1\nb,2\na,3\n', 'number');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('\n')).toMatch(/duplicate category "a" \(first seen on line 2\)/);
  });

  it('rejects percentages outside 0-100 in percent mode', () => {
    const high = parseCsv('category,value\na,100.1\n', 'percent');
    expect(high.ok).toBe(false);
    if (!high.ok) expect(high.errors.join('\n')).toMatch(/outside the valid 0-100 range/);

    const low = parseCsv('category,value\na,-0.5\n', 'percent');
    expect(low.ok).toBe(false);
  });

  it('allows values above 100 in number mode', () => {
    const result = parseCsv('category,value\na,4200\nb,138000\n', 'number');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((d) => d.value)).toEqual([4200, 138000]);
  });

  it('accepts 0 and 100 as the inclusive percentage bounds', () => {
    const result = parseCsv('category,value\na,0\nb,100\n', 'percent');
    expect(result.ok).toBe(true);
  });

  it('rejects an empty input with a readable message', () => {
    const result = parseCsv('   ', 'percent');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/CSV is empty/);
  });
});
