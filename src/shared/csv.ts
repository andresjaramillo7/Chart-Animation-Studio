import Papa from 'papaparse';
import type { DataPoint, ValueMode } from './types.js';

export interface ParseSuccess {
  ok: true;
  data: DataPoint[];
  /** Decimal places present in the source, so labels never invent or drop precision. */
  decimals: number;
}
export interface ParseFailure {
  ok: false;
  errors: string[];
}
export type ParseResult = ParseSuccess | ParseFailure;

const REQUIRED_COLUMNS = ['category', 'value'] as const;

/**
 * Parse and validate pasted CSV.
 *
 * Validation is deliberately strict: bad data should be rejected with a readable
 * message rather than silently coerced, because the numbers end up in a published video.
 */
export function parseCsv(input: string, valueMode: ValueMode): ParseResult {
  const errors: string[] = [];
  const text = input.replace(/^﻿/, '').trim();

  if (!text) return { ok: false, errors: ['CSV is empty. Paste data with a "category,value" header row.'] };

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  for (const err of parsed.errors) {
    // Papa reports row indexes 0-based over data rows; +2 accounts for the header line.
    const line = typeof err.row === 'number' ? ` (line ${err.row + 2})` : '';
    errors.push(`CSV syntax error${line}: ${err.message}`);
  }
  if (errors.length) return { ok: false, errors };

  const fields = (parsed.meta.fields ?? []).map((f) => f.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((c) => !fields.includes(c));
  if (missing.length) {
    return {
      ok: false,
      errors: [`Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Expected a header row of "category,value".`],
    };
  }

  const rows = parsed.data;
  if (rows.length === 0) return { ok: false, errors: ['CSV contains a header row but no data rows.'] };

  const data: DataPoint[] = [];
  const seen = new Map<string, number>();
  let decimals = 0;

  rows.forEach((row, i) => {
    const line = i + 2;
    const rawCategory = (row.category ?? '').trim();
    const rawValue = (row.value ?? '').trim();

    if (!rawCategory) errors.push(`Line ${line}: missing category.`);
    if (!rawValue) errors.push(`Line ${line}: missing value for category "${rawCategory || '(blank)'}".`);
    if (!rawCategory || !rawValue) return;

    if (seen.has(rawCategory)) {
      errors.push(`Line ${line}: duplicate category "${rawCategory}" (first seen on line ${seen.get(rawCategory)}).`);
      return;
    }
    seen.set(rawCategory, line);

    // Reject anything Number() would quietly accept but a human would not, e.g. "1e5x", "", "0x10".
    if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(rawValue)) {
      errors.push(`Line ${line}: value "${rawValue}" for "${rawCategory}" is not a plain number.`);
      return;
    }
    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      errors.push(`Line ${line}: value "${rawValue}" for "${rawCategory}" is not a finite number.`);
      return;
    }

    if (valueMode === 'percent' && (value < 0 || value > 100)) {
      errors.push(`Line ${line}: percentage value ${value} for "${rawCategory}" is outside the valid 0-100 range.`);
      return;
    }
    if (valueMode === 'number' && value < 0) {
      errors.push(`Line ${line}: negative value ${value} for "${rawCategory}" is not supported by the Animated Bar template.`);
      return;
    }

    const dot = rawValue.indexOf('.');
    if (dot >= 0) decimals = Math.max(decimals, rawValue.length - dot - 1);

    data.push({ category: rawCategory, value });
  });

  if (errors.length) return { ok: false, errors };
  if (data.length === 0) return { ok: false, errors: ['No usable data rows found.'] };

  // Category order is the source order; nothing here sorts or reorders.
  return { ok: true, data, decimals: Math.min(decimals, 6) };
}

/** Max decimal places used by any value, so the final frame matches the source exactly. */
export function decimalsOf(values: number[]): number {
  let max = 0;
  for (const v of values) {
    const s = String(v);
    const dot = s.indexOf('.');
    if (dot >= 0) max = Math.max(max, s.length - dot - 1);
  }
  return Math.min(max, 6);
}

/* ---------------------------------------------------------------------------
 * Low-level table parsing, shared by the template-specific schema parsers.
 *
 * `parseCsv` above stays the canonical "category,value" reader. Templates with a
 * different shape build on `parseTable`, which does the generic work (BOM, quoting,
 * blank lines) and leaves every column name and value untouched.
 * ------------------------------------------------------------------------- */

export interface TableSuccess {
  ok: true;
  /** Header names exactly as written, only trimmed. */
  fields: string[];
  rows: Array<Record<string, string>>;
}
export type TableResult = TableSuccess | ParseFailure;

export function parseTable(input: string, expected: string): TableResult {
  const text = (input ?? '').replace(/^﻿/, '').trim();
  if (!text) return { ok: false, errors: [`CSV is empty. Paste data with a "${expected}" header row.`] };

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });

  const errors: string[] = [];
  for (const err of parsed.errors) {
    const line = typeof err.row === 'number' ? ` (line ${err.row + 2})` : '';
    errors.push(`CSV syntax error${line}: ${err.message}`);
  }
  if (errors.length) return { ok: false, errors };

  const fields = (parsed.meta.fields ?? []).map((f) => f.trim()).filter((f) => f !== '');
  if (fields.length === 0) return { ok: false, errors: [`CSV has no header row. Expected "${expected}".`] };
  if (parsed.data.length === 0) return { ok: false, errors: ['CSV contains a header row but no data rows.'] };

  return { ok: true, fields, rows: parsed.data };
}

/** Find a column by name, ignoring case, so "X" and "x" both work. */
export function columnKey(fields: string[], name: string): string | null {
  return fields.find((f) => f.toLowerCase() === name.toLowerCase()) ?? null;
}

/**
 * Strict numeric reader. Accepts a leading sign and a plain decimal; rejects anything
 * Number() would quietly accept but a human would not ("1e5x", "0x10", "").
 */
export function readNumber(raw: string | undefined): number | null {
  const s = (raw ?? '').trim();
  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Decimal places written in a raw cell, so labels never invent or drop precision. */
export function rawDecimals(raw: string): number {
  const dot = raw.indexOf('.');
  return dot >= 0 ? Math.min(6, raw.length - dot - 1) : 0;
}
