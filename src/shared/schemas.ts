import { columnKey, parseTable, rawDecimals, readNumber, type ParseFailure } from './csv.js';
import type { DataPoint, ValueMode } from './types.js';

/**
 * Template-specific CSV schemas.
 *
 * Deliberately kept apart from the generic parsing in csv.ts: `parseTable` does the
 * mechanical work, and each function here applies only the rules its template needs.
 * None of them ever rewrites a supplied value.
 */

/* ------------------------------------------------------------------ donut ---- */

/**
 * Percentage donuts must add up. The tolerance absorbs binary floating-point error
 * from summing decimals (0.1 + 0.2 !== 0.3) without letting real mistakes through:
 * a dataset off by 0.5 is a data problem, not a rounding artefact.
 */
export const DONUT_TOTAL_TOLERANCE = 0.01;

/**
 * Extra rules a donut needs on top of "category,value". A donut shows parts of one
 * whole, so the parts have to be non-negative and actually add up to something.
 */
export function validateDonutData(data: DataPoint[], valueMode: ValueMode): string[] {
  const errors: string[] = [];
  data.forEach((d, i) => {
    if (d.value < 0) errors.push(`Row ${i + 1}: "${d.category}" is negative; a donut segment cannot be negative.`);
  });

  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    errors.push('Every value is zero, so there is no whole to divide into segments.');
    return errors;
  }

  if (valueMode === 'percent' && Math.abs(total - 100) > DONUT_TOTAL_TOLERANCE) {
    errors.push(
      `Percentage segments total ${round(total)}%, not 100%. ` +
        `Fix the data or switch to Number mode, which derives proportions from the values as supplied.`,
    );
  }
  return errors;
}

/**
 * Proportions of the whole, derived without touching the source values.
 *
 * Multiplying before dividing keeps exact results for the common case where the parts
 * already total 100: `(55 * 100) / 100` is exactly 55, while `(55 / 100) * 100` is not.
 */
export function donutProportions(data: DataPoint[]): number[] {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total <= 0) return data.map(() => 0);
  return data.map((d) => (d.value * 100) / total);
}

/* ------------------------------------------------------------ stacked bar ---- */

export interface SeriesColumn {
  name: string;
  values: number[];
}

export interface SeriesTable {
  categories: string[];
  /** Series in header order; every series has one value per category. */
  series: SeriesColumn[];
  decimals: number;
}

export type SeriesResult = { ok: true; table: SeriesTable } | ParseFailure;

/**
 * "category,<series A>,<series B>,..." — one column per series, at least two of them.
 * Category order and series order both follow the source.
 */
export function parseSeriesCsv(input: string, valueMode: ValueMode): SeriesResult {
  const table = parseTable(input, 'category,Series A,Series B');
  if (!table.ok) return table;

  const categoryKey = columnKey(table.fields, 'category');
  if (!categoryKey) {
    return { ok: false, errors: ['Missing required column: category. Expected "category" followed by one column per series.'] };
  }
  const seriesNames = table.fields.filter((f) => f !== categoryKey);
  if (seriesNames.length < 2) {
    return {
      ok: false,
      errors: [`A stacked bar needs at least two series columns; found ${seriesNames.length}. Expected "category,Series A,Series B".`],
    };
  }

  const errors: string[] = [];
  const categories: string[] = [];
  const seen = new Map<string, number>();
  const values: number[][] = seriesNames.map(() => []);
  let decimals = 0;

  table.rows.forEach((row, i) => {
    const line = i + 2;
    const category = (row[categoryKey] ?? '').trim();
    if (!category) {
      errors.push(`Line ${line}: missing category.`);
      return;
    }
    if (seen.has(category)) {
      errors.push(`Line ${line}: duplicate category "${category}" (first seen on line ${seen.get(category)}).`);
      return;
    }
    seen.set(category, line);

    const rowValues: number[] = [];
    let rowOk = true;
    seriesNames.forEach((name) => {
      const raw = (row[name] ?? '').trim();
      if (!raw) {
        errors.push(`Line ${line}: missing value for "${name}" in "${category}".`);
        rowOk = false;
        return;
      }
      const n = readNumber(raw);
      if (n === null) {
        errors.push(`Line ${line}: value "${raw}" for "${name}" in "${category}" is not a plain number.`);
        rowOk = false;
        return;
      }
      if (n < 0) {
        errors.push(`Line ${line}: "${name}" in "${category}" is negative; stacked bars require non-negative values.`);
        rowOk = false;
        return;
      }
      if (valueMode === 'percent' && n > 100) {
        errors.push(`Line ${line}: percentage ${n} for "${name}" in "${category}" is outside the valid 0-100 range.`);
        rowOk = false;
        return;
      }
      decimals = Math.max(decimals, rawDecimals(raw));
      rowValues.push(n);
    });

    if (!rowOk) return;
    categories.push(category);
    rowValues.forEach((v, s) => values[s].push(v));
  });

  if (errors.length) return { ok: false, errors };
  if (categories.length === 0) return { ok: false, errors: ['No usable data rows found.'] };

  return {
    ok: true,
    table: {
      categories,
      series: seriesNames.map((name, s) => ({ name, values: values[s] })),
      decimals,
    },
  };
}

/** Per-category totals, used by 100% stacked mode and by its validation. */
export function categoryTotals(table: SeriesTable): number[] {
  return table.categories.map((_, c) => table.series.reduce((sum, s) => sum + s.values[c], 0));
}

/**
 * 100% stacked mode needs a non-zero total per category; a category of all zeros has
 * no composition to show and would divide by zero.
 */
export function validatePercentStack(table: SeriesTable): string[] {
  return categoryTotals(table)
    .map((total, c) => (total === 0 ? `"${table.categories[c]}" totals zero, so it has no 100% composition to show.` : null))
    .filter((e): e is string => e !== null);
}

/**
 * Proportions for 100% stacked mode, computed from each category's own total. The
 * source values are never modified; this is a derived view.
 */
export function stackProportions(table: SeriesTable): number[][] {
  const totals = categoryTotals(table);
  // Multiply before dividing, so a category that already totals 100 normalizes exactly.
  return table.series.map((s) => s.values.map((v, c) => (totals[c] === 0 ? 0 : (v * 100) / totals[c])));
}

/* ---------------------------------------------------------------- scatter ---- */

export interface ScatterPoint {
  x: number;
  y: number;
  /** Empty when the optional label column is absent. */
  label: string;
}

export interface ScatterTable {
  points: ScatterPoint[];
  xDecimals: number;
  yDecimals: number;
  hasLabels: boolean;
}

export type ScatterResult = { ok: true; table: ScatterTable } | ParseFailure;

/**
 * "x,y" with an optional "label" column. Duplicate coordinates are allowed: two
 * observations can legitimately sit at the same point.
 */
export function parseScatterCsv(input: string): ScatterResult {
  const table = parseTable(input, 'x,y,label');
  if (!table.ok) return table;

  const xKey = columnKey(table.fields, 'x');
  const yKey = columnKey(table.fields, 'y');
  const labelKey = columnKey(table.fields, 'label');

  const missing = [!xKey && 'x', !yKey && 'y'].filter(Boolean) as string[];
  if (missing.length) {
    return {
      ok: false,
      errors: [`Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Expected "x,y" with an optional "label".`],
    };
  }

  const errors: string[] = [];
  const points: ScatterPoint[] = [];
  let xDecimals = 0;
  let yDecimals = 0;

  table.rows.forEach((row, i) => {
    const line = i + 2;
    const rawX = (row[xKey as string] ?? '').trim();
    const rawY = (row[yKey as string] ?? '').trim();
    if (!rawX || !rawY) {
      errors.push(`Line ${line}: missing ${!rawX ? 'x' : 'y'} value.`);
      return;
    }
    const x = readNumber(rawX);
    const y = readNumber(rawY);
    if (x === null) {
      errors.push(`Line ${line}: x value "${rawX}" is not a plain number.`);
      return;
    }
    if (y === null) {
      errors.push(`Line ${line}: y value "${rawY}" is not a plain number.`);
      return;
    }
    xDecimals = Math.max(xDecimals, rawDecimals(rawX));
    yDecimals = Math.max(yDecimals, rawDecimals(rawY));
    points.push({ x, y, label: labelKey ? (row[labelKey] ?? '').trim() : '' });
  });

  if (errors.length) return { ok: false, errors };
  if (points.length === 0) return { ok: false, errors: ['No usable data rows found.'] };

  return { ok: true, table: { points, xDecimals, yDecimals, hasLabels: labelKey !== null } };
}

/* ---------------------------------------------------------------- heatmap ---- */

export interface HeatCell {
  x: string;
  y: string;
  value: number;
}

export interface HeatTable {
  /** Both axes keep first-appearance order; nothing is sorted. */
  xCategories: string[];
  yCategories: string[];
  cells: HeatCell[];
  decimals: number;
  min: number;
  max: number;
}

export type HeatmapResult = { ok: true; table: HeatTable } | ParseFailure;

/**
 * Stable identity for one cell. JSON keeps the two parts unambiguous, so categories
 * containing commas or separators cannot collide.
 */
export function cellKey(x: string, y: string): string {
  return JSON.stringify([x, y]);
}

/**
 * "x,y,value". Combinations that are not supplied stay missing — they are never
 * invented, and never quietly turned into zero.
 */
export function parseHeatmapCsv(input: string, valueMode: ValueMode): HeatmapResult {
  const table = parseTable(input, 'x,y,value');
  if (!table.ok) return table;

  const xKey = columnKey(table.fields, 'x');
  const yKey = columnKey(table.fields, 'y');
  const valueKey = columnKey(table.fields, 'value');
  const missing = [!xKey && 'x', !yKey && 'y', !valueKey && 'value'].filter(Boolean) as string[];
  if (missing.length) {
    return {
      ok: false,
      errors: [`Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Expected "x,y,value".`],
    };
  }

  const errors: string[] = [];
  const xCategories: string[] = [];
  const yCategories: string[] = [];
  const cells: HeatCell[] = [];
  const seen = new Map<string, number>();
  let decimals = 0;

  table.rows.forEach((row, i) => {
    const line = i + 2;
    const x = (row[xKey as string] ?? '').trim();
    const y = (row[yKey as string] ?? '').trim();
    const raw = (row[valueKey as string] ?? '').trim();

    if (!x || !y) {
      errors.push(`Line ${line}: missing ${!x ? 'x' : 'y'} category.`);
      return;
    }
    if (!raw) {
      errors.push(`Line ${line}: missing value for "${x}" / "${y}".`);
      return;
    }
    const key = cellKey(x, y);
    if (seen.has(key)) {
      errors.push(`Line ${line}: duplicate cell "${x}" / "${y}" (first seen on line ${seen.get(key)}).`);
      return;
    }
    seen.set(key, line);

    const value = readNumber(raw);
    if (value === null) {
      errors.push(`Line ${line}: value "${raw}" for "${x}" / "${y}" is not a plain number.`);
      return;
    }
    if (valueMode === 'percent' && (value < 0 || value > 100)) {
      errors.push(`Line ${line}: percentage ${value} for "${x}" / "${y}" is outside the valid 0-100 range.`);
      return;
    }

    if (!xCategories.includes(x)) xCategories.push(x);
    if (!yCategories.includes(y)) yCategories.push(y);
    decimals = Math.max(decimals, rawDecimals(raw));
    cells.push({ x, y, value });
  });

  if (errors.length) return { ok: false, errors };
  if (cells.length === 0) return { ok: false, errors: ['No usable data rows found.'] };

  const values = cells.map((c) => c.value);
  return {
    ok: true,
    table: {
      xCategories,
      yCategories,
      cells,
      decimals,
      min: Math.min(...values),
      max: Math.max(...values),
    },
  };
}

function round(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}
