import * as echarts from 'echarts';
// The same bundled faces the render host uses, so preview and export match exactly.
import '../shared/fonts.css';
import {
  ALL_VISIBLE,
  CHART_ONLY,
  DATA_SCHEMES,
  DATA_SCHEME_IDS,
  DEFAULT_ANIMATION,
  DEFAULT_COMPOSITION,
  DEFAULT_DATA_SCHEME,
  DEFAULT_THEME_ID,
  EXPORT_FORMAT_LABELS,
  supportsTransparency,
  THEMES,
  THEME_LABELS,
  TRANSPARENT_MP4_MESSAGE,
  type BackgroundMode,
  type ChartSpec,
  type Composition,
  type DataPoint,
  type DataSchemeId,
  type DonutDisplay,
  type Easing,
  type ExportFormat,
  type HeatmapReveal,
  type ImageFit,
  type JobState,
  type Orientation,
  type Reveal,
  type StackMode,
  type TemplateId,
  type Theme,
  type ThemeId,
  type ValueMode,
  type VisibilitySpec,
} from '../shared/types.js';
import { parseCsv } from '../shared/csv.js';
import {
  cellKey,
  parseHeatmapCsv,
  parseScatterCsv,
  parseSeriesCsv,
  validateDonutData,
  validatePercentStack,
  type HeatTable,
  type ScatterTable,
  type SeriesTable,
} from '../shared/schemas.js';
import { buildTimeline, frameProgress } from '../shared/timeline.js';
import { RESOLUTIONS, RESOLUTION_LABELS, type ResolutionId } from '../shared/layout.js';
import {
  buildOption,
  SCHEMA_HEADERS,
  supportedVisibility,
  TEMPLATE_GROUPS,
  TEMPLATE_IDS,
  TEMPLATE_META,
  templatesInGroup,
} from '../templates/index.js';
import { PRESETS, getPreset, presetForTemplate } from '../presets/index.js';
import type { BigNumberVariant } from '../presets/bigNumbers.js';

const FPS = 30;

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

const els = {
  template: $<HTMLSelectElement>('template'),
  openGallery: $<HTMLButtonElement>('openGallery'),
  closeGallery: $<HTMLButtonElement>('closeGallery'),
  gallery: $<HTMLDivElement>('gallery'),
  galleryBody: $<HTMLDivElement>('galleryBody'),
  preset: $<HTMLSelectElement>('preset'),
  variant: $<HTMLSelectElement>('variant'),
  title: $<HTMLInputElement>('title'),
  subtitle: $<HTMLInputElement>('subtitle'),
  valueMode: $<HTMLSelectElement>('valueMode'),
  schemaHint: $<HTMLElement>('schemaHint'),
  csv: $<HTMLTextAreaElement>('csv'),
  uploadBtn: $<HTMLButtonElement>('uploadBtn'),
  uploadInput: $<HTMLInputElement>('uploadInput'),
  highlight: $<HTMLSelectElement>('highlight'),
  orientation: $<HTMLSelectElement>('orientation'),
  stackMode: $<HTMLSelectElement>('stackMode'),
  innerRadius: $<HTMLInputElement>('innerRadius'),
  donutDisplay: $<HTMLSelectElement>('donutDisplay'),
  showTotal: $<HTMLInputElement>('showTotal'),
  centerLabel: $<HTMLInputElement>('centerLabel'),
  areaOpacity: $<HTMLInputElement>('areaOpacity'),
  showPoints: $<HTMLInputElement>('showPoints'),
  xTitle: $<HTMLInputElement>('xTitle'),
  yTitle: $<HTMLInputElement>('yTitle'),
  symbolSize: $<HTMLInputElement>('symbolSize'),
  heatReveal: $<HTMLSelectElement>('heatReveal'),
  bnValue: $<HTMLInputElement>('bnValue'),
  bnDecimals: $<HTMLInputElement>('bnDecimals'),
  bnPrefix: $<HTMLInputElement>('bnPrefix'),
  bnSuffix: $<HTMLInputElement>('bnSuffix'),
  bnSeparators: $<HTMLInputElement>('bnSeparators'),
  dataStatus: $<HTMLDivElement>('dataStatus'),
  bgMode: $<HTMLSelectElement>('bgMode'),
  bgFit: $<HTMLSelectElement>('bgFit'),
  bgUploadBtn: $<HTMLButtonElement>('bgUploadBtn'),
  bgUploadInput: $<HTMLInputElement>('bgUploadInput'),
  bgStatus: $<HTMLDivElement>('bgStatus'),
  chartOnly: $<HTMLButtonElement>('chartOnly'),
  showAll: $<HTMLButtonElement>('showAll'),
  visibility: $<HTMLDivElement>('visibility'),
  theme: $<HTMLSelectElement>('theme'),
  dataScheme: $<HTMLSelectElement>('dataScheme'),
  schemeNote: $<HTMLDivElement>('schemeNote'),
  motif: $<HTMLInputElement>('motif'),
  cBackground: $<HTMLInputElement>('cBackground'),
  cPrimary: $<HTMLInputElement>('cPrimary'),
  cAccent: $<HTMLInputElement>('cAccent'),
  cText: $<HTMLInputElement>('cText'),
  duration: $<HTMLInputElement>('duration'),
  easing: $<HTMLSelectElement>('easing'),
  reveal: $<HTMLSelectElement>('reveal'),
  hold: $<HTMLInputElement>('hold'),
  timelineInfo: $<HTMLDivElement>('timelineInfo'),
  resolution: $<HTMLSelectElement>('resolution'),
  format: $<HTMLSelectElement>('format'),
  filename: $<HTMLInputElement>('filename'),
  exportBtn: $<HTMLButtonElement>('export'),
  exportStatus: $<HTMLDivElement>('exportStatus'),
  progressBar: $<HTMLDivElement>('progressBar'),
  formatBadge: $<HTMLSpanElement>('formatBadge'),
  replay: $<HTMLButtonElement>('replay'),
  previewFrame: $<HTMLDivElement>('previewFrame'),
  preview: $<HTMLDivElement>('preview'),
};

/** Parsed data, one slot per schema; only the active template's slot is used. */
let data: DataPoint[] = [];
let seriesTable: SeriesTable | null = null;
let scatterTable: ScatterTable | null = null;
let heatTable: HeatTable | null = null;

let gridColor: string = THEMES[DEFAULT_THEME_ID].grid;
/**
 * Brand tokens that are not directly editable: the secondary surface, the secondary
 * text and the theme's own neutral data ramp. Kept alongside the four editable colours
 * so a manual tweak never discards the rest of the identity.
 */
let themeExtras: Pick<Theme, 'surface' | 'textMuted' | 'series'> = {
  surface: THEMES[DEFAULT_THEME_ID].surface,
  textMuted: THEMES[DEFAULT_THEME_ID].textMuted,
  series: THEMES[DEFAULT_THEME_ID].series,
};
/** Composition survives a change of template, preset or dataset. */
let show: VisibilitySpec = { ...ALL_VISIBLE };
let backgroundImageId: string | null = null;
let chart: echarts.ECharts | null = null;

/* ---------- option lists ---------- */

for (const id of TEMPLATE_IDS) els.template.add(new Option(TEMPLATE_META[id].label, id));
for (const p of PRESETS) els.preset.add(new Option(p.name, p.id));
for (const id of Object.keys(THEMES) as ThemeId[]) els.theme.add(new Option(THEME_LABELS[id], id));
for (const id of Object.keys(RESOLUTIONS) as ResolutionId[]) {
  els.resolution.add(new Option(RESOLUTION_LABELS[id], id));
}
for (const id of Object.keys(EXPORT_FORMAT_LABELS) as ExportFormat[]) {
  els.format.add(new Option(EXPORT_FORMAT_LABELS[id], id));
}
for (const id of DATA_SCHEME_IDS) els.dataScheme.add(new Option(DATA_SCHEMES[id].label, id));

/* ---------- preview ---------- */

function canvas() {
  return RESOLUTIONS[els.resolution.value as ResolutionId];
}

function ensureChart(): echarts.ECharts {
  const { width, height } = canvas();
  if (chart && (chart.getWidth() !== width || chart.getHeight() !== height)) {
    chart.dispose();
    chart = null;
  }
  if (!chart) chart = echarts.init(els.preview, undefined, { renderer: 'canvas', width, height });
  return chart;
}

/** Tallest the preview is allowed to get, so a portrait composition stays on screen. */
const PREVIEW_MAX_HEIGHT = 720;
/** Matches the 1px border on .preview-frame, which sits outside its content box. */
const PREVIEW_BORDER = 1;

/**
 * Scale the composition to fit the column, and size the frame to the result.
 *
 * The frame is sized to the scaled composition rather than left at full column width,
 * so it wraps the chart exactly and there is no leftover strip beside it. The available
 * width is measured from the column, never from the frame: the frame's own width is set
 * here, so reading it back would shrink the preview a little more on every resize.
 */
function fitPreview(): void {
  const { width, height } = canvas();
  els.preview.style.width = `${width}px`;
  els.preview.style.height = `${height}px`;

  const column = els.previewFrame.parentElement;
  const available = Math.max(1, (column?.clientWidth ?? width) - PREVIEW_BORDER * 2);

  // One scale for both axes, so the composition keeps its exact aspect ratio — 16:9 in
  // landscape, 9:16 in portrait — and is never stretched or cropped.
  const scale = Math.min(available / width, PREVIEW_MAX_HEIGHT / height);
  els.preview.style.transform = `scale(${scale})`;
  els.previewFrame.style.width = `${Math.round(width * scale)}px`;
  els.previewFrame.style.height = `${Math.round(height * scale)}px`;
}
window.addEventListener('resize', () => {
  fitPreview();
  draw(1);
});

/* ---------- state ---------- */

const template = (): TemplateId => els.template.value as TemplateId;
const format = (): ExportFormat => els.format.value as ExportFormat;
const transparentMode = (): boolean => els.bgMode.value === 'transparent';

function theme(): Theme {
  const primary = els.cPrimary.value;
  return {
    background: els.cBackground.value,
    primary,
    accent: els.cAccent.value,
    text: els.cText.value,
    grid: gridColor,
    surface: themeExtras.surface,
    textMuted: themeExtras.textMuted,
    // A manual Primary edit takes the head of the ramp, so hand-picked colours still
    // win while the rest of the brand ramp survives.
    series: themeExtras.series ? [primary, ...themeExtras.series.slice(1)] : undefined,
  };
}

const dataScheme = (): DataSchemeId => els.dataScheme.value as DataSchemeId;

function composition(): Composition {
  return {
    background: {
      mode: els.bgMode.value as BackgroundMode,
      imageId: backgroundImageId,
      fit: els.bgFit.value as ImageFit,
    },
    show,
    motif: els.motif.checked,
  };
}

function currentSpec(): ChartSpec {
  const base = {
    title: els.title.value,
    subtitle: els.subtitle.value,
    valueMode: els.valueMode.value as ValueMode,
    theme: theme(),
    dataScheme: dataScheme(),
  };
  const highlight = els.highlight.value || null;

  switch (template()) {
    case 'animated-bar':
      return {
        ...base,
        template: 'animated-bar',
        data,
        highlight,
        orientation: els.orientation.value as Orientation,
        reveal: els.reveal.value as Reveal,
      };
    case 'animated-line':
      return { ...base, template: 'animated-line', data, highlight };
    case 'comparison':
      return { ...base, template: 'comparison', data, highlight, reveal: els.reveal.value as Reveal };
    case 'donut':
      return {
        ...base,
        template: 'donut',
        data,
        highlight,
        innerRadius: clampNumber(els.innerRadius.value, 0, 90, 58),
        display: els.donutDisplay.value as DonutDisplay,
        showTotal: els.showTotal.checked,
        centerLabel: els.centerLabel.value,
      };
    case 'area':
      return {
        ...base,
        template: 'area',
        data,
        highlight,
        areaOpacity: clampNumber(els.areaOpacity.value, 0, 1, 0.28),
        showPoints: els.showPoints.checked,
      };
    case 'stacked-bar':
      return {
        ...base,
        template: 'stacked-bar',
        categories: seriesTable?.categories ?? [],
        series: seriesTable?.series ?? [],
        stackMode: els.stackMode.value as StackMode,
        orientation: els.orientation.value as Orientation,
        reveal: els.reveal.value as Reveal,
        highlight,
      };
    case 'scatter':
      return {
        ...base,
        template: 'scatter',
        points: scatterTable?.points ?? [],
        xTitle: els.xTitle.value,
        yTitle: els.yTitle.value,
        symbolSize: clampNumber(els.symbolSize.value, 4, 200, 34),
        reveal: els.reveal.value as Reveal,
        highlight,
      };
    case 'heatmap':
      return {
        ...base,
        template: 'heatmap',
        xCategories: heatTable?.xCategories ?? [],
        yCategories: heatTable?.yCategories ?? [],
        cells: heatTable?.cells ?? [],
        heatReveal: els.heatReveal.value as HeatmapReveal,
        highlight,
      };
    case 'big-number':
      return {
        ...base,
        template: 'big-number',
        valueMode: 'number',
        value: Number(els.bnValue.value),
        decimals: Math.max(0, Math.min(6, Math.trunc(Number(els.bnDecimals.value) || 0))),
        prefix: els.bnPrefix.value,
        suffix: els.bnSuffix.value,
        separators: els.bnSeparators.checked,
      };
  }
}

function clampNumber(raw: string, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function animationSpec() {
  return {
    durationSeconds: Number(els.duration.value),
    holdSeconds: Number(els.hold.value),
    easing: els.easing.value as Easing,
    fps: FPS,
  };
}

/* ---------- composition controls ---------- */

const VISIBILITY_LABELS: Record<keyof VisibilitySpec, string> = {
  title: 'Title',
  subtitle: 'Subtitle',
  axisLabels: 'Axis labels',
  axes: 'Axes',
  gridlines: 'Gridlines',
  legend: 'Legend',
  valueLabels: 'Value labels',
};

/** Heatmap calls its legend a colour scale, and its value labels cell labels. */
function visibilityLabel(id: TemplateId, key: keyof VisibilitySpec): string {
  if (id === 'heatmap' && key === 'legend') return 'Colour scale';
  if (id === 'heatmap' && key === 'valueLabels') return 'Cell labels';
  if (id === 'donut' && key === 'valueLabels') return 'Segment labels';
  if (id === 'scatter' && key === 'valueLabels') return 'Point labels';
  return VISIBILITY_LABELS[key];
}

/** Only offer toggles for elements the selected template actually draws. */
function renderVisibilityToggles(): void {
  els.visibility.innerHTML = '';
  const id = template();
  for (const key of supportedVisibility(id)) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = show[key];
    input.addEventListener('change', () => {
      show = { ...show, [key]: input.checked };
      draw(1);
    });
    label.append(input, document.createTextNode(visibilityLabel(id, key)));
    els.visibility.append(label);
  }
}

/* ---------- field visibility ---------- */

function applyVisibility(): void {
  const id = template();
  const meta = TEMPLATE_META[id];
  const fields: Record<string, boolean> = {
    valueMode: meta.needsData,
    csv: meta.needsData,
    highlight: meta.needsData && meta.supportsHighlight,
    orientation: meta.supportsOrientation,
    reveal: meta.supportsReveal,
    bigNumber: !meta.needsData,
    variant: id === 'big-number',
    bgImage: els.bgMode.value === 'image',
    donut: id === 'donut',
    stack: id === 'stacked-bar',
    areaOpts: id === 'area',
    scatterOpts: id === 'scatter',
    heatOpts: id === 'heatmap',
  };
  for (const [field, visible] of Object.entries(fields)) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-field="${field}"]`)) {
      el.hidden = !visible;
    }
  }
  els.schemaHint.textContent = SCHEMA_HEADERS[meta.schema];

  const { width, height } = canvas();
  els.formatBadge.textContent = `${meta.label} · ${width}×${height} · ${FPS} fps`;
  els.previewFrame.classList.toggle('checkered', transparentMode());
  els.exportBtn.textContent = format() === 'mp4' ? 'Export MP4' : 'Export PNG';
}

function transparencyConflict(): boolean {
  const conflict = transparentMode() && !supportsTransparency(format());
  if (conflict) {
    els.exportStatus.className = 'status error';
    els.exportStatus.textContent = TRANSPARENT_MP4_MESSAGE;
  } else if (els.exportStatus.textContent === TRANSPARENT_MP4_MESSAGE) {
    els.exportStatus.className = 'status';
    els.exportStatus.textContent = '';
  }
  return conflict;
}

/* ---------- data ---------- */

function fail(errors: string[]): false {
  els.dataStatus.className = 'status error';
  els.dataStatus.textContent = errors.join('\n');
  els.exportBtn.disabled = true;
  return false;
}

function succeed(message: string, highlightOptions: Array<{ value: string; label: string }>): true {
  els.dataStatus.className = 'status ok';
  els.dataStatus.textContent = message;
  els.exportBtn.disabled = false;

  const previous = els.highlight.value;
  els.highlight.innerHTML = '';
  els.highlight.add(new Option('None', ''));
  for (const o of highlightOptions) els.highlight.add(new Option(o.label, o.value));
  els.highlight.value = highlightOptions.some((o) => o.value === previous) ? previous : '';
  return true;
}

/**
 * Parse the CSV with the schema the selected template declares, then apply that
 * template's own extra rules. General parsing and template rules stay separate.
 */
function refreshData(): boolean {
  const id = template();
  const meta = TEMPLATE_META[id];
  const mode = els.valueMode.value as ValueMode;

  if (meta.schema === 'none') {
    const value = Number(els.bnValue.value);
    const ok = els.bnValue.value.trim() !== '' && Number.isFinite(value);
    els.dataStatus.className = ok ? 'status ok' : 'status error';
    els.dataStatus.textContent = ok ? 'Value ready.' : 'Enter a finite numeric value.';
    els.exportBtn.disabled = !ok;
    return ok;
  }

  if (meta.schema === 'category-value') {
    const result = parseCsv(els.csv.value, mode);
    if (!result.ok) return fail(result.errors);
    const count = result.data.length;
    if (count < meta.minCategories || count > meta.maxCategories) {
      return fail([
        `${meta.label} requires between ${meta.minCategories} and ${meta.maxCategories} categories; the CSV has ${count}.`,
      ]);
    }
    if (id === 'donut') {
      const donutErrors = validateDonutData(result.data, mode);
      if (donutErrors.length) return fail(donutErrors);
    }
    data = result.data;
    return succeed(
      `${count} categories parsed in source order.`,
      data.map((d) => ({ value: d.category, label: d.category })),
    );
  }

  if (meta.schema === 'category-series') {
    const result = parseSeriesCsv(els.csv.value, mode);
    if (!result.ok) return fail(result.errors);
    if (els.stackMode.value === 'percent') {
      const stackErrors = validatePercentStack(result.table);
      if (stackErrors.length) return fail(stackErrors);
    }
    seriesTable = result.table;
    return succeed(
      `${result.table.categories.length} categories × ${result.table.series.length} series, in source order.`,
      [
        ...result.table.categories.map((c) => ({ value: c, label: `Category: ${c}` })),
        ...result.table.series.map((s) => ({ value: s.name, label: `Series: ${s.name}` })),
      ],
    );
  }

  if (meta.schema === 'xy-label') {
    const result = parseScatterCsv(els.csv.value);
    if (!result.ok) return fail(result.errors);
    scatterTable = result.table;
    const labelled = result.table.points.filter((p) => p.label !== '');
    return succeed(
      `${result.table.points.length} points parsed${result.table.hasLabels ? ' with labels' : ''}.`,
      labelled.map((p) => ({ value: p.label, label: p.label })),
    );
  }

  const result = parseHeatmapCsv(els.csv.value, mode);
  if (!result.ok) return fail(result.errors);
  heatTable = result.table;
  const grid = result.table.xCategories.length * result.table.yCategories.length;
  const missing = grid - result.table.cells.length;
  return succeed(
    `${result.table.cells.length} cells across ${result.table.xCategories.length} × ${result.table.yCategories.length}` +
      (missing > 0 ? ` — ${missing} combination${missing > 1 ? 's' : ''} left blank, not zero.` : '.'),
    result.table.cells.map((c) => ({ value: cellKey(c.x, c.y), label: `${c.x} / ${c.y}` })),
  );
}

function refreshTimeline(): void {
  try {
    const t = buildTimeline(animationSpec());
    els.timelineInfo.className = 'status';
    els.timelineInfo.textContent =
      format() === 'png'
        ? `PNG captures the final frame only (1 of ${t.totalFrames}).`
        : `${t.animationFrames} animation + ${t.holdFrames} hold = ${t.totalFrames} frames ` +
          `(${t.durationSeconds.toFixed(3)} s at ${t.fps} fps).`;
  } catch (err) {
    els.timelineInfo.className = 'status error';
    els.timelineInfo.textContent = err instanceof Error ? err.message : String(err);
  }
}

function applyPreviewBackground(): void {
  const el = els.preview;
  const mode = els.bgMode.value as BackgroundMode;
  // Longhands only, matching the render host: the shorthand would reset repeat/position.
  el.style.backgroundImage = 'none';
  el.style.backgroundColor = 'transparent';
  el.style.backgroundRepeat = 'no-repeat';
  el.style.backgroundPosition = 'center center';
  if (mode === 'solid') {
    el.style.backgroundColor = els.cBackground.value;
  } else if (mode === 'image' && backgroundImageId) {
    el.style.backgroundColor = els.cBackground.value;
    el.style.backgroundImage = `url("/api/backgrounds/${backgroundImageId}")`;
    el.style.backgroundSize = els.bgFit.value === 'contain' ? 'contain' : 'cover';
  }
}

function hasData(): boolean {
  const schema = TEMPLATE_META[template()].schema;
  if (schema === 'none') return true;
  if (schema === 'category-value') return data.length > 0;
  if (schema === 'category-series') return (seriesTable?.categories.length ?? 0) > 0;
  if (schema === 'xy-label') return (scatterTable?.points.length ?? 0) > 0;
  return (heatTable?.cells.length ?? 0) > 0;
}

function draw(progress = 1): void {
  if (!hasData()) return;
  const instance = ensureChart();
  instance.setOption(buildOption(currentSpec(), progress, canvas(), composition()), {
    notMerge: true,
    lazyUpdate: false,
  });
  applyPreviewBackground();
}

function refreshAll(): void {
  applyVisibility();
  renderVisibilityToggles();
  transparencyConflict();
  const ok = refreshData();
  refreshTimeline();
  fitPreview();
  if (ok) draw(1);
}

/* ---------- preview replay ---------- */

let replayHandle = 0;
function replay(): void {
  cancelAnimationFrame(replayHandle);
  const anim = animationSpec();
  let timeline;
  try {
    timeline = buildTimeline(anim);
  } catch {
    return;
  }
  const start = performance.now();
  const step = (): void => {
    const elapsedFrames = Math.floor(((performance.now() - start) / 1000) * anim.fps);
    const frame = Math.min(timeline.totalFrames - 1, elapsedFrames);
    draw(frameProgress(frame, anim));
    if (frame < timeline.totalFrames - 1) replayHandle = requestAnimationFrame(step);
  };
  replayHandle = requestAnimationFrame(step);
}

/* ---------- export ---------- */

async function runExport(): Promise<void> {
  if (!refreshData()) return;
  if (transparencyConflict()) return;
  els.exportBtn.disabled = true;
  els.progressBar.style.width = '0%';
  els.exportStatus.className = 'status';
  els.exportStatus.textContent = 'Submitting export request...';

  try {
    const { width, height } = canvas();
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chart: currentSpec(),
        animation: animationSpec(),
        composition: composition(),
        format: format(),
        filename: els.filename.value,
        width,
        height,
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error ?? `Export request rejected (HTTP ${res.status}).`);
    await pollJob((body as JobState).id);
  } catch (err) {
    els.exportStatus.className = 'status error';
    els.exportStatus.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    els.exportBtn.disabled = false;
  }
}

async function pollJob(id: string): Promise<void> {
  for (;;) {
    const res = await fetch(`/api/export/${id}`);
    if (!res.ok) throw new Error(`Lost track of export job ${id}.`);
    const job = (await res.json()) as JobState;

    const pct = job.totalFrames > 0 ? Math.round((job.framesDone / job.totalFrames) * 100) : 0;
    els.progressBar.style.width = `${job.status === 'done' || job.status === 'encoding' ? 100 : pct}%`;

    if (job.status === 'done') {
      els.exportStatus.className = 'status ok';
      const what = job.format === 'png-sequence' ? `${job.totalFrames} frames` : `${job.totalFrames} frame(s)`;
      els.exportStatus.textContent = `Done — saved outputs/${job.filename} (${what}).`;
      return;
    }
    if (job.status === 'error') {
      els.progressBar.style.width = '0%';
      throw new Error(job.error ?? 'Export failed.');
    }
    els.exportStatus.className = 'status';
    els.exportStatus.textContent = `${job.status}: ${job.message}`;
    await new Promise((r) => setTimeout(r, 400));
  }
}

/* ---------- themes ---------- */

function applyTheme(id: ThemeId): void {
  const t = THEMES[id];
  els.cBackground.value = t.background;
  els.cPrimary.value = t.primary;
  els.cAccent.value = t.accent;
  els.cText.value = t.text;
  gridColor = t.grid;
  themeExtras = { surface: t.surface, textMuted: t.textMuted, series: t.series };
}

/* ---------- presets ---------- */

function applyVariant(variant: BigNumberVariant): void {
  els.title.value = variant.title;
  els.subtitle.value = variant.subtitle;
  els.bnValue.value = String(variant.value);
  els.bnDecimals.value = String(variant.decimals);
  els.bnPrefix.value = variant.prefix;
  els.bnSuffix.value = variant.suffix;
  els.bnSeparators.checked = variant.separators;
  els.filename.value = variant.filename;
}

/**
 * Load a preset. Template-specific settings are reset to the preset's own values (or to
 * defaults) so nothing incompatible survives a switch. Composition settings are
 * deliberately left alone — background and visibility are not chart data.
 */
function loadPreset(id: string): void {
  const preset = getPreset(id);
  if (!preset) return;

  els.template.value = preset.template;
  els.title.value = preset.title;
  els.subtitle.value = preset.subtitle;
  els.valueMode.value = preset.valueMode;
  els.csv.value = preset.csv ? preset.csv.trim() : '';
  els.orientation.value = preset.orientation ?? 'vertical';
  els.reveal.value = preset.reveal ?? 'simultaneous';
  els.stackMode.value = preset.stackMode ?? 'regular';
  els.innerRadius.value = String(preset.innerRadius ?? 58);
  els.donutDisplay.value = preset.donutDisplay ?? 'percent';
  els.showTotal.checked = preset.showTotal ?? false;
  els.centerLabel.value = preset.centerLabel ?? '';
  els.areaOpacity.value = String(preset.areaOpacity ?? 0.28);
  els.showPoints.checked = preset.showPoints ?? true;
  els.xTitle.value = preset.xTitle ?? '';
  els.yTitle.value = preset.yTitle ?? '';
  els.symbolSize.value = String(preset.symbolSize ?? 34);
  els.heatReveal.value = preset.heatReveal ?? 'simultaneous';
  els.dataScheme.value = preset.dataScheme ?? DEFAULT_DATA_SCHEME;
  els.schemeNote.textContent = DATA_SCHEMES[dataScheme()].description;
  els.filename.value = preset.filename;

  els.variant.innerHTML = '';
  if (preset.variants?.length) {
    for (const v of preset.variants) els.variant.add(new Option(v.label, v.id));
    els.variant.value = preset.variants[0].id;
    applyVariant(preset.variants[0]);
  }

  applyVisibility();
  renderVisibilityToggles();
  refreshData();
  els.highlight.value = preset.highlight ?? '';
  refreshTimeline();
  fitPreview();
  draw(1);
  renderGallery();
}

/**
 * Changing the chart type clears settings the new template does not use. When the new
 * template needs a different CSV shape, its own example is loaded rather than leaving
 * data that cannot parse.
 */
function onTemplateChange(): void {
  const id = template();
  const meta = TEMPLATE_META[id];
  if (!meta.supportsOrientation) els.orientation.value = 'vertical';
  if (!meta.supportsReveal) els.reveal.value = 'simultaneous';
  if (!meta.supportsHighlight) els.highlight.value = '';

  const previousSchema = els.csv.dataset.schema;
  if (meta.needsData && previousSchema && previousSchema !== meta.schema) {
    const preset = presetForTemplate(id);
    if (preset?.csv) {
      els.csv.value = preset.csv.trim();
      els.valueMode.value = preset.valueMode;
      els.xTitle.value = preset.xTitle ?? '';
      els.yTitle.value = preset.yTitle ?? '';
      els.highlight.value = '';
    }
  }
  els.csv.dataset.schema = meta.schema;
  if (!meta.needsData && !els.bnValue.value) {
    const bn = PRESETS.find((p) => p.variants?.length);
    if (bn?.variants) applyVariant(bn.variants[0]);
  }
  refreshAll();
  renderGallery();
}

/* ---------- template gallery ---------- */

const THUMB: { width: number; height: number } = { width: 460, height: 259 };
const thumbCharts: echarts.ECharts[] = [];

/** A miniature of the real composition, built from the same registry. */
function thumbSpec(id: TemplateId): ChartSpec | null {
  const preset = presetForTemplate(id);
  if (!preset) return null;
  const saved = {
    template: els.template.value,
    csv: els.csv.value,
    valueMode: els.valueMode.value,
    title: els.title.value,
    subtitle: els.subtitle.value,
    highlight: els.highlight.value,
    bnValue: els.bnValue.value,
    bnDecimals: els.bnDecimals.value,
    bnSuffix: els.bnSuffix.value,
  };
  els.template.value = id;
  els.csv.value = preset.csv ? preset.csv.trim() : '';
  els.valueMode.value = preset.valueMode;
  els.title.value = '';
  els.subtitle.value = '';
  els.highlight.value = '';
  // A Big Number thumbnail has no CSV to read, so seed it from the preset's first variant.
  if (preset.variants?.length) {
    const v = preset.variants[0];
    els.bnValue.value = String(v.value);
    els.bnDecimals.value = String(v.decimals);
    els.bnSuffix.value = v.suffix;
  }
  const ok = refreshData();
  const spec = ok ? currentSpec() : null;

  els.template.value = saved.template;
  els.csv.value = saved.csv;
  els.valueMode.value = saved.valueMode;
  els.title.value = saved.title;
  els.subtitle.value = saved.subtitle;
  els.bnValue.value = saved.bnValue;
  els.bnDecimals.value = saved.bnDecimals;
  els.bnSuffix.value = saved.bnSuffix;
  refreshData();
  els.highlight.value = saved.highlight;
  return spec;
}

function renderGallery(): void {
  if (els.gallery.hidden) return;
  for (const c of thumbCharts.splice(0)) c.dispose();
  els.galleryBody.innerHTML = '';

  // Titles, tick labels and read-outs are dropped so a thumbnail reads as a silhouette.
  const thumbComposition: Composition = {
    background: { mode: 'solid', imageId: null, fit: 'cover' },
    show: { ...CHART_ONLY, axisLabels: false, valueLabels: false, legend: false },
  };

  // Build the cards first; the thumbnails need real layout widths to scale against,
  // which only exist once the cards are in the document.
  const pending: Array<{ id: TemplateId; thumb: HTMLElement }> = [];

  for (const group of TEMPLATE_GROUPS) {
    const ids = templatesInGroup(group);
    if (ids.length === 0) continue;

    const section = document.createElement('div');
    section.className = 'gallery-group';
    const heading = document.createElement('h3');
    heading.textContent = group;
    const grid = document.createElement('div');
    grid.className = 'gallery-grid';
    section.append(heading, grid);

    for (const id of ids) {
      const meta = TEMPLATE_META[id];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `gallery-card${id === template() ? ' active' : ''}`;
      const thumb = document.createElement('div');
      thumb.className = 'gallery-thumb';
      const name = document.createElement('strong');
      name.textContent = meta.label;
      const desc = document.createElement('span');
      desc.textContent = meta.description;
      card.append(thumb, name, desc);
      card.addEventListener('click', () => selectFromGallery(id));
      grid.append(card);
      pending.push({ id, thumb });
    }
    els.galleryBody.append(section);
  }

  for (const { id, thumb } of pending) {
    const spec = thumbSpec(id);
    if (!spec) continue;
    // Rendered at a readable size, then scaled down as a whole so the miniature keeps
    // its proportions instead of being cropped to the corner.
    const inner = document.createElement('div');
    inner.className = 'gallery-thumb-inner';
    inner.style.width = `${THUMB.width}px`;
    inner.style.height = `${THUMB.height}px`;
    inner.style.transform = `scale(${(thumb.clientWidth || THUMB.width) / THUMB.width})`;
    thumb.append(inner);

    const instance = echarts.init(inner, undefined, {
      renderer: 'canvas',
      width: THUMB.width,
      height: THUMB.height,
    });
    instance.setOption(buildOption(spec, 1, THUMB, thumbComposition), { notMerge: true, lazyUpdate: false });
    thumbCharts.push(instance);
  }
}

function openGallery(): void {
  els.gallery.hidden = false;
  renderGallery();
}

function closeGallery(): void {
  els.gallery.hidden = true;
  for (const c of thumbCharts.splice(0)) c.dispose();
}

/** Selecting from the gallery opens the existing editor on that template's example. */
function selectFromGallery(id: TemplateId): void {
  closeGallery();
  const preset = presetForTemplate(id);
  if (preset) {
    els.preset.value = preset.id;
    loadPreset(preset.id);
  } else {
    els.template.value = id;
    onTemplateChange();
  }
}

/* ---------- wiring ---------- */

els.template.addEventListener('change', onTemplateChange);
els.openGallery.addEventListener('click', openGallery);
els.closeGallery.addEventListener('click', closeGallery);
els.gallery.addEventListener('click', (e) => {
  if (e.target === els.gallery) closeGallery();
});
els.preset.addEventListener('change', () => loadPreset(els.preset.value));
els.variant.addEventListener('change', () => {
  const preset = getPreset(els.preset.value);
  const variant = preset?.variants?.find((v) => v.id === els.variant.value);
  if (variant) {
    applyVariant(variant);
    refreshAll();
  }
});
els.theme.addEventListener('change', () => {
  applyTheme(els.theme.value as ThemeId);
  draw(1);
});
els.dataScheme.addEventListener('change', () => {
  // Changing the data colours touches nothing else: not the data, the title, the
  // timeline, the background or the composition.
  els.schemeNote.textContent = DATA_SCHEMES[dataScheme()].description;
  draw(1);
  renderGallery();
});
els.motif.addEventListener('change', () => draw(1));
els.resolution.addEventListener('change', refreshAll);
els.format.addEventListener('change', refreshAll);
els.bgMode.addEventListener('change', refreshAll);
els.bgFit.addEventListener('change', () => draw(1));
els.chartOnly.addEventListener('click', () => {
  show = { ...CHART_ONLY };
  refreshAll();
});
els.showAll.addEventListener('click', () => {
  show = { ...ALL_VISIBLE };
  refreshAll();
});
els.replay.addEventListener('click', replay);
els.exportBtn.addEventListener('click', runExport);

els.uploadBtn.addEventListener('click', () => els.uploadInput.click());
els.uploadInput.addEventListener('change', async () => {
  const file = els.uploadInput.files?.[0];
  els.uploadInput.value = '';
  if (!file) return;
  // The file is read in the browser and never written back — source CSVs are untouched.
  els.csv.value = (await file.text()).trim();
  refreshAll();
});

els.bgUploadBtn.addEventListener('click', () => els.bgUploadInput.click());
els.bgUploadInput.addEventListener('change', async () => {
  const file = els.bgUploadInput.files?.[0];
  els.bgUploadInput.value = '';
  if (!file) return;
  els.bgStatus.className = 'status';
  els.bgStatus.textContent = `Uploading ${file.name}...`;
  try {
    const res = await fetch('/api/backgrounds', {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: await file.arrayBuffer(),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error ?? `Upload failed (HTTP ${res.status}).`);
    backgroundImageId = body.id as string;
    els.bgMode.value = 'image';
    els.bgStatus.className = 'status ok';
    els.bgStatus.textContent = `${file.name} — ${(body.bytes / 1024).toFixed(0)} KB`;
    refreshAll();
  } catch (err) {
    els.bgStatus.className = 'status error';
    els.bgStatus.textContent = err instanceof Error ? err.message : String(err);
  }
});

for (const el of [els.title, els.subtitle, els.csv] as HTMLElement[]) el.addEventListener('input', refreshAll);
for (const el of [els.valueMode, els.highlight, els.orientation, els.stackMode, els.heatReveal] as HTMLElement[]) {
  el.addEventListener('change', refreshAll);
}
for (const el of [
  els.bnValue,
  els.bnDecimals,
  els.bnPrefix,
  els.bnSuffix,
  els.innerRadius,
  els.donutDisplay,
  els.centerLabel,
  els.areaOpacity,
  els.xTitle,
  els.yTitle,
  els.symbolSize,
] as HTMLElement[]) {
  el.addEventListener('input', refreshAll);
}
for (const el of [els.bnSeparators, els.showTotal, els.showPoints] as HTMLElement[]) {
  el.addEventListener('change', refreshAll);
}
for (const el of [els.cBackground, els.cPrimary, els.cAccent, els.cText] as HTMLElement[]) {
  el.addEventListener('input', () => draw(1));
}
for (const el of [els.duration, els.hold, els.easing] as HTMLElement[]) el.addEventListener('input', refreshTimeline);
els.reveal.addEventListener('change', () => draw(1));

els.bgMode.value = DEFAULT_COMPOSITION.background.mode;
els.bgFit.value = DEFAULT_COMPOSITION.background.fit;
els.motif.checked = DEFAULT_COMPOSITION.motif ?? true;
els.duration.value = String(DEFAULT_ANIMATION.durationSeconds);
els.hold.value = String(DEFAULT_ANIMATION.holdSeconds);
els.easing.value = DEFAULT_ANIMATION.easing;
els.theme.value = DEFAULT_THEME_ID;
els.dataScheme.value = DEFAULT_DATA_SCHEME;
els.schemeNote.textContent = DATA_SCHEMES[DEFAULT_DATA_SCHEME].description;
applyTheme(DEFAULT_THEME_ID);
renderVisibilityToggles();
loadPreset(PRESETS[0].id);
els.csv.dataset.schema = TEMPLATE_META[template()].schema;
fitPreview();
draw(1);
