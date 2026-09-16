import * as echarts from 'echarts';
import {
  THEMES,
  THEME_LABELS,
  type ChartSpec,
  type DataPoint,
  type Easing,
  type JobState,
  type Orientation,
  type Reveal,
  type TemplateId,
  type Theme,
  type ThemeId,
  type ValueMode,
} from '../shared/types.js';
import { parseCsv } from '../shared/csv.js';
import { buildTimeline, frameProgress } from '../shared/timeline.js';
import { RESOLUTIONS, RESOLUTION_LABELS, type ResolutionId } from '../shared/layout.js';
import { buildOption, TEMPLATE_IDS, TEMPLATE_META } from '../templates/index.js';
import { PRESETS, getPreset } from '../presets/index.js';
import type { BigNumberVariant } from '../presets/bigNumbers.js';

const FPS = 30;

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

const els = {
  template: $<HTMLSelectElement>('template'),
  preset: $<HTMLSelectElement>('preset'),
  variant: $<HTMLSelectElement>('variant'),
  title: $<HTMLInputElement>('title'),
  subtitle: $<HTMLInputElement>('subtitle'),
  valueMode: $<HTMLSelectElement>('valueMode'),
  csv: $<HTMLTextAreaElement>('csv'),
  uploadBtn: $<HTMLButtonElement>('uploadBtn'),
  uploadInput: $<HTMLInputElement>('uploadInput'),
  highlight: $<HTMLSelectElement>('highlight'),
  orientation: $<HTMLSelectElement>('orientation'),
  bnValue: $<HTMLInputElement>('bnValue'),
  bnDecimals: $<HTMLInputElement>('bnDecimals'),
  bnPrefix: $<HTMLInputElement>('bnPrefix'),
  bnSuffix: $<HTMLInputElement>('bnSuffix'),
  bnSeparators: $<HTMLInputElement>('bnSeparators'),
  dataStatus: $<HTMLDivElement>('dataStatus'),
  theme: $<HTMLSelectElement>('theme'),
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
  filename: $<HTMLInputElement>('filename'),
  exportBtn: $<HTMLButtonElement>('export'),
  exportStatus: $<HTMLDivElement>('exportStatus'),
  progressBar: $<HTMLDivElement>('progressBar'),
  formatBadge: $<HTMLSpanElement>('formatBadge'),
  replay: $<HTMLButtonElement>('replay'),
  previewFrame: $<HTMLDivElement>('previewFrame'),
  preview: $<HTMLDivElement>('preview'),
};

let data: DataPoint[] = [];
/** Gridline color comes from the selected theme; only the four named colors are editable. */
let gridColor: string = THEMES['dark-minimal'].grid;
let chart: echarts.ECharts | null = null;

/* ---------- option lists ---------- */

for (const id of TEMPLATE_IDS) els.template.add(new Option(TEMPLATE_META[id].label, id));
for (const p of PRESETS) els.preset.add(new Option(p.name, p.id));
for (const id of Object.keys(THEMES) as ThemeId[]) els.theme.add(new Option(THEME_LABELS[id], id));
for (const id of Object.keys(RESOLUTIONS) as ResolutionId[]) {
  els.resolution.add(new Option(RESOLUTION_LABELS[id], id));
}

/* ---------- preview: the real composition, scaled down ---------- */

function canvas() {
  return RESOLUTIONS[els.resolution.value as ResolutionId];
}

function ensureChart(): echarts.ECharts {
  const { width, height } = canvas();
  if (chart && (chart.getWidth() !== width || chart.getHeight() !== height)) {
    chart.dispose();
    chart = null;
  }
  if (!chart) {
    chart = echarts.init(els.preview, undefined, { renderer: 'canvas', width, height });
  }
  return chart;
}

function fitPreview(): void {
  const { width, height } = canvas();
  els.preview.style.width = `${width}px`;
  els.preview.style.height = `${height}px`;
  const scale = Math.min(els.previewFrame.clientWidth / width, 720 / height);
  els.preview.style.transform = `scale(${scale})`;
  els.previewFrame.style.height = `${Math.round(height * scale)}px`;
}
window.addEventListener('resize', () => {
  fitPreview();
  draw(1);
});

/* ---------- state ---------- */

function template(): TemplateId {
  return els.template.value as TemplateId;
}

function theme(): Theme {
  return {
    background: els.cBackground.value,
    primary: els.cPrimary.value,
    accent: els.cAccent.value,
    text: els.cText.value,
    grid: gridColor,
  };
}

function currentSpec(): ChartSpec {
  const base = {
    title: els.title.value,
    subtitle: els.subtitle.value,
    valueMode: els.valueMode.value as ValueMode,
    theme: theme(),
  };
  const id = template();
  switch (id) {
    case 'animated-bar':
      return {
        ...base,
        template: 'animated-bar',
        data,
        highlight: els.highlight.value || null,
        orientation: els.orientation.value as Orientation,
        reveal: els.reveal.value as Reveal,
      };
    case 'animated-line':
      return { ...base, template: 'animated-line', data, highlight: els.highlight.value || null };
    case 'comparison':
      return {
        ...base,
        template: 'comparison',
        data,
        highlight: els.highlight.value || null,
        reveal: els.reveal.value as Reveal,
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

function animationSpec() {
  return {
    durationSeconds: Number(els.duration.value),
    holdSeconds: Number(els.hold.value),
    easing: els.easing.value as Easing,
    fps: FPS,
  };
}

/* ---------- field visibility: only show what the template uses ---------- */

function applyVisibility(): void {
  const meta = TEMPLATE_META[template()];
  const show: Record<string, boolean> = {
    valueMode: meta.needsData,
    csv: meta.needsData,
    highlight: meta.needsData && meta.supportsHighlight,
    orientation: meta.supportsOrientation,
    reveal: meta.supportsReveal,
    bigNumber: !meta.needsData,
    variant: template() === 'big-number',
  };
  for (const [field, visible] of Object.entries(show)) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-field="${field}"]`)) {
      el.hidden = !visible;
    }
  }
  const { width, height } = canvas();
  els.formatBadge.textContent = `${TEMPLATE_META[template()].label} · ${width}×${height} · ${FPS} fps`;
}

/* ---------- data ---------- */

function refreshData(): boolean {
  const meta = TEMPLATE_META[template()];
  if (!meta.needsData) {
    const value = Number(els.bnValue.value);
    const ok = els.bnValue.value.trim() !== '' && Number.isFinite(value);
    els.dataStatus.className = ok ? 'status ok' : 'status error';
    els.dataStatus.textContent = ok ? 'Value ready.' : 'Enter a finite numeric value.';
    els.exportBtn.disabled = !ok;
    return ok;
  }

  const result = parseCsv(els.csv.value, els.valueMode.value as ValueMode);
  if (!result.ok) {
    els.dataStatus.className = 'status error';
    els.dataStatus.textContent = result.errors.join('\n');
    els.exportBtn.disabled = true;
    return false;
  }

  const count = result.data.length;
  if (count < meta.minCategories || count > meta.maxCategories) {
    els.dataStatus.className = 'status error';
    els.dataStatus.textContent =
      meta.minCategories === meta.maxCategories
        ? `${meta.label} requires exactly ${meta.minCategories} categories; the CSV has ${count}.`
        : `${meta.label} requires between ${meta.minCategories} and ${meta.maxCategories} categories; the CSV has ${count}.`;
    els.exportBtn.disabled = true;
    return false;
  }

  data = result.data;
  els.dataStatus.className = 'status ok';
  els.dataStatus.textContent = `${count} categories parsed in source order.`;
  els.exportBtn.disabled = false;

  const previous = els.highlight.value;
  els.highlight.innerHTML = '';
  els.highlight.add(new Option('None', ''));
  for (const d of data) els.highlight.add(new Option(d.category, d.category));
  els.highlight.value = data.some((d) => d.category === previous) ? previous : '';
  return true;
}

function refreshTimeline(): void {
  try {
    const t = buildTimeline(animationSpec());
    els.timelineInfo.className = 'status';
    els.timelineInfo.textContent =
      `${t.animationFrames} animation + ${t.holdFrames} hold = ${t.totalFrames} frames ` +
      `(${t.durationSeconds.toFixed(3)} s at ${t.fps} fps).`;
  } catch (err) {
    els.timelineInfo.className = 'status error';
    els.timelineInfo.textContent = err instanceof Error ? err.message : String(err);
  }
}

function draw(progress = 1): void {
  const meta = TEMPLATE_META[template()];
  if (meta.needsData && data.length === 0) return;
  const instance = ensureChart();
  instance.setOption(buildOption(currentSpec(), progress, canvas()), {
    notMerge: true,
    lazyUpdate: false,
  });
}

function refreshAll(): void {
  applyVisibility();
  const ok = refreshData();
  refreshTimeline();
  fitPreview();
  if (ok) draw(1);
}

/* ---------- preview replay, driven by the same deterministic timeline ---------- */

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
      els.exportStatus.textContent = `Done — saved outputs/${job.filename} (${job.totalFrames} frames).`;
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
 * Load a preset. Template-specific settings are reset to the preset's own values (or
 * to defaults) so nothing incompatible survives a switch between presets.
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
  els.filename.value = preset.filename;

  els.variant.innerHTML = '';
  if (preset.variants?.length) {
    for (const v of preset.variants) els.variant.add(new Option(v.label, v.id));
    els.variant.value = preset.variants[0].id;
    applyVariant(preset.variants[0]);
  }

  applyVisibility();
  refreshData();
  els.highlight.value = preset.highlight ?? '';
  refreshTimeline();
  fitPreview();
  draw(1);
}

/**
 * Changing the chart type keeps the dataset when it is still compatible and clears
 * settings the new template does not use.
 */
function onTemplateChange(): void {
  const meta = TEMPLATE_META[template()];
  if (!meta.supportsOrientation) els.orientation.value = 'vertical';
  if (!meta.supportsReveal) els.reveal.value = 'simultaneous';
  if (!meta.supportsHighlight) els.highlight.value = '';
  if (!meta.needsData && !els.bnValue.value) applyVariant(PRESETS[3].variants![0]);
  refreshAll();
}

/* ---------- wiring ---------- */

els.template.addEventListener('change', onTemplateChange);
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
els.resolution.addEventListener('change', refreshAll);
els.replay.addEventListener('click', replay);
els.exportBtn.addEventListener('click', runExport);

els.uploadBtn.addEventListener('click', () => els.uploadInput.click());
els.uploadInput.addEventListener('change', async () => {
  const file = els.uploadInput.files?.[0];
  if (!file) return;
  // The file is read in the browser and never written back — source CSVs are untouched.
  els.csv.value = (await file.text()).trim();
  els.uploadInput.value = '';
  refreshAll();
});

for (const el of [els.title, els.subtitle, els.csv] as HTMLElement[]) el.addEventListener('input', refreshAll);
for (const el of [els.valueMode, els.highlight, els.orientation] as HTMLElement[]) {
  el.addEventListener('change', refreshAll);
}
for (const el of [els.bnValue, els.bnDecimals, els.bnPrefix, els.bnSuffix] as HTMLElement[]) {
  el.addEventListener('input', refreshAll);
}
els.bnSeparators.addEventListener('change', refreshAll);
for (const el of [els.cBackground, els.cPrimary, els.cAccent, els.cText] as HTMLElement[]) {
  el.addEventListener('input', () => draw(1));
}
for (const el of [els.duration, els.hold, els.easing] as HTMLElement[]) el.addEventListener('input', refreshTimeline);
els.reveal.addEventListener('change', () => draw(1));

applyTheme('dark-minimal');
loadPreset(PRESETS[0].id);
fitPreview();
draw(1);
