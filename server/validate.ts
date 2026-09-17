import {
  EXPORT_FORMAT_LABELS,
  supportsTransparency,
  TRANSPARENT_MP4_MESSAGE,
  type ChartSpec,
  type Composition,
  type DataChartSpec,
  type Easing,
  type ExportFormat,
  type ExportRequest,
  type DataPoint,
  type ValueMode,
  type VisibilitySpec,
} from '../src/shared/types.js';
import { cellKey, validateDonutData, validatePercentStack } from '../src/shared/schemas.js';
import { isDataSchemeId } from '../src/shared/brand.js';
import { RESOLUTIONS } from '../src/shared/layout.js';
import { TEMPLATE_META, isTemplateId } from '../src/templates/index.js';
import { isUploadId } from './paths.js';

const FORMATS = Object.keys(EXPORT_FORMAT_LABELS) as ExportFormat[];
const VISIBILITY_KEYS: Array<keyof VisibilitySpec> = [
  'title',
  'subtitle',
  'axisLabels',
  'axes',
  'gridlines',
  'legend',
  'valueLabels',
];

const MAX_FRAMES = 30 * 60 * 2; // two minutes at 30fps — a guard against runaway jobs

const ALLOWED_SIZES = Object.values(RESOLUTIONS).map((r) => `${r.width}x${r.height}`);

/**
 * Server-side validation of an export request. The UI validates too, but the backend
 * never trusts the client: an invalid request must be rejected before a browser is
 * launched or anything is written to disk.
 */
export function validateExportRequest(
  body: unknown,
): { ok: true; value: ExportRequest } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const b = body as Partial<ExportRequest> | null;
  if (!b || typeof b !== 'object') return { ok: false, errors: ['Request body must be a JSON object.'] };

  validateChart(b.chart, errors);
  validateAnimation(b.animation, errors);
  validateComposition(b.composition, errors);

  const format = b.format as ExportFormat;
  if (!FORMATS.includes(format)) {
    errors.push(`"format" must be one of: ${FORMATS.join(', ')}.`);
  } else if (b.composition?.background?.mode === 'transparent' && !supportsTransparency(format)) {
    // Refused up front rather than silently flattened onto an opaque background.
    errors.push(TRANSPARENT_MP4_MESSAGE);
  }

  const size = `${b.width}x${b.height}`;
  if (!ALLOWED_SIZES.includes(size)) {
    errors.push(`Unsupported resolution ${size}. Supported: ${ALLOWED_SIZES.join(', ')}.`);
  }
  if (typeof b.filename !== 'string') errors.push('"filename" must be a string.');

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: b as ExportRequest };
}

function validateComposition(composition: Composition | undefined, errors: string[]): void {
  if (!composition || typeof composition !== 'object') {
    errors.push('Missing "composition".');
    return;
  }
  const bg = composition.background;
  if (!bg || typeof bg !== 'object') {
    errors.push('Missing "composition.background".');
  } else {
    if (bg.mode !== 'solid' && bg.mode !== 'image' && bg.mode !== 'transparent') {
      errors.push('"composition.background.mode" must be "solid", "image" or "transparent".');
    }
    if (bg.fit !== 'cover' && bg.fit !== 'contain') {
      errors.push('"composition.background.fit" must be "cover" or "contain".');
    }
    if (bg.mode === 'image') {
      if (typeof bg.imageId !== 'string' || !isUploadId(bg.imageId)) {
        errors.push('"composition.background.imageId" must be the id of an uploaded image.');
      }
    } else if (bg.imageId != null && typeof bg.imageId !== 'string') {
      errors.push('"composition.background.imageId" must be a string or null.');
    }
  }

  if (composition.motif != null && typeof composition.motif !== 'boolean') {
    errors.push('"composition.motif" must be true or false.');
  }

  const show = composition.show;
  if (!show || typeof show !== 'object') {
    errors.push('Missing "composition.show".');
    return;
  }
  for (const key of VISIBILITY_KEYS) {
    if (typeof show[key] !== 'boolean') errors.push(`"composition.show.${key}" must be true or false.`);
  }
}

function validateChart(chart: ChartSpec | undefined, errors: string[]): void {
  if (!chart || typeof chart !== 'object') {
    errors.push('Missing "chart".');
    return;
  }
  if (!isTemplateId(chart.template)) {
    errors.push(`Unsupported template "${String((chart as { template?: unknown }).template)}".`);
    return;
  }
  if (typeof chart.title !== 'string') errors.push('"chart.title" must be a string.');
  if (typeof chart.subtitle !== 'string') errors.push('"chart.subtitle" must be a string.');

  const mode = chart.valueMode as ValueMode;
  if (mode !== 'percent' && mode !== 'number') errors.push('"chart.valueMode" must be "percent" or "number".');

  if (chart.dataScheme != null && !isDataSchemeId(chart.dataScheme)) {
    errors.push('"chart.dataScheme" must be a known data color scheme.');
  }

  for (const key of ['background', 'primary', 'accent', 'text', 'grid'] as const) {
    const v = chart.theme?.[key];
    if (typeof v !== 'string' || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim())) {
      errors.push(`"chart.theme.${key}" must be a hex color.`);
    }
  }

  // Each template declares the CSV shape it expects, so the payload is checked against
  // that shape rather than being forced through one schema.
  const meta = TEMPLATE_META[chart.template];
  switch (meta.schema) {
    case 'category-value':
      validateDataset(chart as DataChartSpec, mode, meta, errors);
      if (chart.template === 'donut') validateDonut(chart, mode, errors);
      if (chart.template === 'area') validateArea(chart, errors);
      break;
    case 'category-series':
      validateSeriesTable(chart as unknown as Record<string, unknown>, mode, errors);
      break;
    case 'xy-label':
      validateScatter(chart as unknown as Record<string, unknown>, errors);
      break;
    case 'xy-value':
      validateHeatmap(chart as unknown as Record<string, unknown>, mode, errors);
      break;
    case 'none':
      validateBigNumber(chart, errors);
      break;
  }

  if ((chart.template === 'animated-bar' || chart.template === 'stacked-bar') && chart.orientation != null) {
    if (chart.orientation !== 'vertical' && chart.orientation !== 'horizontal') {
      errors.push('"chart.orientation" must be "vertical" or "horizontal".');
    }
  }
  if (
    (chart.template === 'animated-bar' ||
      chart.template === 'comparison' ||
      chart.template === 'stacked-bar' ||
      chart.template === 'scatter') &&
    chart.reveal != null
  ) {
    if (chart.reveal !== 'simultaneous' && chart.reveal !== 'sequential') {
      errors.push('"chart.reveal" must be "simultaneous" or "sequential".');
    }
  }
}

/** A donut shows parts of one whole, so its parts have to add up. */
function validateDonut(chart: ChartSpec, mode: ValueMode, errors: string[]): void {
  const d = chart as {
    data?: unknown;
    innerRadius?: unknown;
    display?: unknown;
    showTotal?: unknown;
    centerLabel?: unknown;
  };
  if (typeof d.innerRadius !== 'number' || d.innerRadius < 0 || d.innerRadius > 90) {
    errors.push('"chart.innerRadius" must be between 0 and 90.');
  }
  if (d.display !== 'percent' && d.display !== 'value') errors.push('"chart.display" must be "percent" or "value".');
  if (typeof d.showTotal !== 'boolean') errors.push('"chart.showTotal" must be true or false.');
  if (typeof d.centerLabel !== 'string') errors.push('"chart.centerLabel" must be a string.');

  const rows = d.data;
  if (Array.isArray(rows) && rows.every((r) => typeof r?.value === 'number' && Number.isFinite(r.value))) {
    errors.push(...validateDonutData(rows as DataPoint[], mode));
  }
}

function validateArea(chart: ChartSpec, errors: string[]): void {
  const a = chart as { areaOpacity?: unknown; showPoints?: unknown };
  if (typeof a.areaOpacity !== 'number' || a.areaOpacity < 0 || a.areaOpacity > 1) {
    errors.push('"chart.areaOpacity" must be between 0 and 1.');
  }
  if (typeof a.showPoints !== 'boolean') errors.push('"chart.showPoints" must be true or false.');
}

function validateSeriesTable(chart: Record<string, unknown>, mode: ValueMode, errors: string[]): void {
  const categories = chart.categories;
  const series = chart.series;
  if (!Array.isArray(categories) || categories.length === 0) {
    errors.push('"chart.categories" must contain at least one category.');
    return;
  }
  if (categories.some((c) => typeof c !== 'string' || !c.trim())) {
    errors.push('Every category must be a non-empty string.');
  }
  if (new Set(categories).size !== categories.length) errors.push('Categories must be unique.');

  if (!Array.isArray(series) || series.length < 2) {
    errors.push('A stacked bar needs at least two series.');
    return;
  }
  series.forEach((s, i) => {
    const entry = s as { name?: unknown; values?: unknown };
    if (typeof entry.name !== 'string' || !entry.name.trim()) errors.push(`Series ${i + 1}: missing name.`);
    if (!Array.isArray(entry.values) || entry.values.length !== categories.length) {
      errors.push(`Series ${i + 1}: expected ${categories.length} values.`);
      return;
    }
    entry.values.forEach((v, c) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        errors.push(`Series ${i + 1}, category ${c + 1}: value must be a finite number.`);
      } else if (v < 0) {
        errors.push(`Series ${i + 1}, category ${c + 1}: stacked bars require non-negative values.`);
      } else if (mode === 'percent' && v > 100) {
        errors.push(`Series ${i + 1}, category ${c + 1}: percentage ${v} is outside 0-100.`);
      }
    });
  });

  const stackMode = chart.stackMode;
  if (stackMode !== 'regular' && stackMode !== 'percent') {
    errors.push('"chart.stackMode" must be "regular" or "percent".');
    return;
  }
  // A category of all zeros has no 100% composition and would divide by zero.
  if (stackMode === 'percent' && errors.length === 0) {
    errors.push(
      ...validatePercentStack({
        categories: categories as string[],
        series: series as Array<{ name: string; values: number[] }>,
        decimals: 0,
      }),
    );
  }
}

function validateScatter(chart: Record<string, unknown>, errors: string[]): void {
  const points = chart.points;
  if (!Array.isArray(points) || points.length === 0) {
    errors.push('"chart.points" must contain at least one point.');
    return;
  }
  // Duplicate coordinates are deliberately allowed; two observations may share a spot.
  points.forEach((p, i) => {
    const point = p as { x?: unknown; y?: unknown; label?: unknown };
    if (typeof point.x !== 'number' || !Number.isFinite(point.x)) {
      errors.push(`Point ${i + 1}: x must be a finite number.`);
    }
    if (typeof point.y !== 'number' || !Number.isFinite(point.y)) {
      errors.push(`Point ${i + 1}: y must be a finite number.`);
    }
    if (typeof point.label !== 'string') errors.push(`Point ${i + 1}: label must be a string.`);
  });
  for (const key of ['xTitle', 'yTitle'] as const) {
    if (typeof chart[key] !== 'string') errors.push(`"chart.${key}" must be a string.`);
  }
  const size = chart.symbolSize;
  if (typeof size !== 'number' || size < 4 || size > 200) errors.push('"chart.symbolSize" must be between 4 and 200.');
}

function validateHeatmap(chart: Record<string, unknown>, mode: ValueMode, errors: string[]): void {
  const xs = chart.xCategories;
  const ys = chart.yCategories;
  const cells = chart.cells;
  if (!Array.isArray(xs) || xs.length === 0 || !Array.isArray(ys) || ys.length === 0) {
    errors.push('"chart.xCategories" and "chart.yCategories" must each contain at least one category.');
    return;
  }
  if (!Array.isArray(cells) || cells.length === 0) {
    errors.push('"chart.cells" must contain at least one cell.');
    return;
  }
  const seen = new Set<string>();
  cells.forEach((c, i) => {
    const cell = c as { x?: unknown; y?: unknown; value?: unknown };
    if (typeof cell.x !== 'string' || !xs.includes(cell.x)) {
      errors.push(`Cell ${i + 1}: x is not one of the declared X categories.`);
    }
    if (typeof cell.y !== 'string' || !ys.includes(cell.y)) {
      errors.push(`Cell ${i + 1}: y is not one of the declared Y categories.`);
    }
    if (typeof cell.value !== 'number' || !Number.isFinite(cell.value)) {
      errors.push(`Cell ${i + 1}: value must be a finite number.`);
    } else if (mode === 'percent' && (cell.value < 0 || cell.value > 100)) {
      errors.push(`Cell ${i + 1}: percentage ${cell.value} is outside 0-100.`);
    }
    if (typeof cell.x === 'string' && typeof cell.y === 'string') {
      const key = cellKey(cell.x, cell.y);
      if (seen.has(key)) errors.push(`Cell ${i + 1}: duplicate cell "${cell.x}" / "${cell.y}".`);
      seen.add(key);
    }
  });
  const reveal = chart.heatReveal;
  if (reveal != null && reveal !== 'simultaneous' && reveal !== 'row') {
    errors.push('"chart.heatReveal" must be "simultaneous" or "row".');
  }
}

function validateDataset(
  chart: DataChartSpec,
  mode: ValueMode,
  meta: { label: string; minCategories: number; maxCategories: number },
  errors: string[],
): void {
  if (!Array.isArray(chart.data) || chart.data.length === 0) {
    errors.push('"chart.data" must contain at least one row.');
    return;
  }
  if (chart.data.length < meta.minCategories || chart.data.length > meta.maxCategories) {
    errors.push(
      meta.minCategories === meta.maxCategories
        ? `${meta.label} requires exactly ${meta.minCategories} categories; got ${chart.data.length}.`
        : `${meta.label} requires between ${meta.minCategories} and ${meta.maxCategories} categories; got ${chart.data.length}.`,
    );
  }

  const seen = new Set<string>();
  chart.data.forEach((d, i) => {
    if (!d || typeof d.category !== 'string' || !d.category.trim()) errors.push(`Row ${i + 1}: invalid category.`);
    if (typeof d?.value !== 'number' || !Number.isFinite(d.value)) {
      errors.push(`Row ${i + 1}: value must be a finite number.`);
    } else if (mode === 'percent' && (d.value < 0 || d.value > 100)) {
      errors.push(`Row ${i + 1}: percentage ${d.value} is outside 0-100.`);
    }
    if (d && typeof d.category === 'string') {
      if (seen.has(d.category)) errors.push(`Row ${i + 1}: duplicate category "${d.category}".`);
      seen.add(d.category);
    }
  });

  if (chart.highlight != null && typeof chart.highlight !== 'string') {
    errors.push('"chart.highlight" must be a string or null.');
  }
}

function validateBigNumber(chart: ChartSpec, errors: string[]): void {
  const n = chart as { value?: unknown; decimals?: unknown; prefix?: unknown; suffix?: unknown; separators?: unknown };
  if (typeof n.value !== 'number' || !Number.isFinite(n.value)) {
    errors.push('"chart.value" must be a finite number.');
  }
  if (typeof n.decimals !== 'number' || !Number.isInteger(n.decimals) || n.decimals < 0 || n.decimals > 6) {
    errors.push('"chart.decimals" must be a whole number between 0 and 6.');
  }
  for (const key of ['prefix', 'suffix'] as const) {
    const v = n[key];
    if (typeof v !== 'string' || v.length > 8) errors.push(`"chart.${key}" must be a string of at most 8 characters.`);
  }
  if (typeof n.separators !== 'boolean') errors.push('"chart.separators" must be true or false.');
}

function validateAnimation(anim: ExportRequest['animation'] | undefined, errors: string[]): void {
  if (!anim || typeof anim !== 'object') {
    errors.push('Missing "animation".');
    return;
  }
  if (typeof anim.durationSeconds !== 'number' || !(anim.durationSeconds > 0) || anim.durationSeconds > 60) {
    errors.push('"animation.durationSeconds" must be between 0 (exclusive) and 60.');
  }
  if (typeof anim.holdSeconds !== 'number' || anim.holdSeconds < 0 || anim.holdSeconds > 60) {
    errors.push('"animation.holdSeconds" must be between 0 and 60.');
  }
  const easing = anim.easing as Easing;
  if (easing !== 'linear' && easing !== 'ease-out') errors.push('"animation.easing" must be "linear" or "ease-out".');
  if (anim.fps !== 30) errors.push('"animation.fps" must be 30.');

  if (typeof anim.durationSeconds === 'number' && typeof anim.holdSeconds === 'number' && anim.fps === 30) {
    const frames = Math.round(anim.durationSeconds * 30) + Math.max(1, Math.round(anim.holdSeconds * 30));
    if (frames > MAX_FRAMES) errors.push(`Requested ${frames} frames, which exceeds the ${MAX_FRAMES}-frame limit.`);
  }
}
