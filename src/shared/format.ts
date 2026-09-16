/** Number formatting shared by every template so read-outs look identical. */

/**
 * Format a value for display.
 *
 * `decimals` is applied exactly, so a value supplied with one decimal place renders
 * with one decimal place on the final frame — no silent rounding or precision drift.
 */
export function formatNumber(
  value: number,
  decimals: number,
  separators = true,
  prefix = '',
  suffix = '',
): string {
  const safeDecimals = Math.max(0, Math.min(6, Math.trunc(decimals)));
  const fixed = Math.abs(value).toFixed(safeDecimals);
  const [whole, fraction] = fixed.split('.');
  const grouped = separators ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : whole;
  const sign = value < 0 ? '-' : '';
  const body = fraction ? `${grouped}.${fraction}` : grouped;
  return `${sign}${prefix}${body}${suffix}`;
}

/** Suffix used by a value axis and its labels. */
export function valueSuffix(valueMode: 'percent' | 'number'): string {
  return valueMode === 'percent' ? '%' : '';
}
