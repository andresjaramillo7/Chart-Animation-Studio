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
  type ValueMode,
  type VisibilitySpec,
} from '../src/shared/types.js';
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

  for (const key of ['background', 'primary', 'accent', 'text', 'grid'] as const) {
    const v = chart.theme?.[key];
    if (typeof v !== 'string' || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim())) {
      errors.push(`"chart.theme.${key}" must be a hex color.`);
    }
  }

  const meta = TEMPLATE_META[chart.template];
  if (meta.needsData) {
    validateDataset(chart as DataChartSpec, mode, meta, errors);
  } else {
    validateBigNumber(chart, errors);
  }

  if (chart.template === 'animated-bar' && chart.orientation != null) {
    if (chart.orientation !== 'vertical' && chart.orientation !== 'horizontal') {
      errors.push('"chart.orientation" must be "vertical" or "horizontal".');
    }
  }
  if ((chart.template === 'animated-bar' || chart.template === 'comparison') && chart.reveal != null) {
    if (chart.reveal !== 'simultaneous' && chart.reveal !== 'sequential') {
      errors.push('"chart.reveal" must be "simultaneous" or "sequential".');
    }
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
