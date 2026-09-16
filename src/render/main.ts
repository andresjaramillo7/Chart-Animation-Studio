import * as echarts from 'echarts';
import { DEFAULT_COMPOSITION, type ChartSpec, type Composition } from '../shared/types.js';
import { buildOption } from '../templates/index.js';

/**
 * Headless render host driven by Playwright.
 *
 * The export pipeline only ever calls `init` then `renderFrame(progress)` — it knows
 * nothing about which template is in play, so all four templates and every composition
 * setting go through the same pipeline.
 *
 * Background layering, from back to front:
 *   page (always transparent) -> #stage (solid color, image, or nothing) -> ECharts canvas.
 * The canvas is only painted in solid mode, so an image shows through and a transparent
 * composition really has no pixels behind the chart.
 */

let chart: echarts.ECharts | null = null;
let currentSpec: ChartSpec | null = null;
let currentComposition: Composition = DEFAULT_COMPOSITION;
let currentCanvas = { width: 1920, height: 1080 };

async function init(
  spec: ChartSpec,
  width: number,
  height: number,
  composition: Composition = DEFAULT_COMPOSITION,
): Promise<void> {
  const stage = document.getElementById('stage');
  const host = document.getElementById('chart');
  if (!stage || !host) throw new Error('#stage / #chart elements are missing from the render host page');

  for (const el of [stage, host]) {
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
  }

  await applyBackground(stage, spec, composition);

  if (chart) chart.dispose();
  chart = echarts.init(host, undefined, {
    renderer: 'canvas',
    width,
    height,
    // 1:1 with the Playwright viewport so the screenshot is exactly width x height.
    devicePixelRatio: 1,
  });
  currentSpec = spec;
  currentComposition = composition;
  currentCanvas = { width, height };

  // Text metrics depend on loaded fonts; measuring before they are ready would
  // shift labels between frames.
  if (document.fonts?.ready) await document.fonts.ready;
}

/** Paint the layer behind the chart, waiting for any image to finish decoding. */
async function applyBackground(stage: HTMLElement, spec: ChartSpec, composition: Composition): Promise<void> {
  const { mode, imageId, fit } = composition.background;

  // Reset with longhands only: the `background` shorthand would also reset repeat and
  // position back to their initial values, which tiles the image instead of fitting it.
  stage.style.backgroundColor = 'transparent';
  stage.style.backgroundImage = 'none';
  stage.style.backgroundRepeat = 'no-repeat';
  stage.style.backgroundPosition = 'center center';

  if (mode === 'solid') {
    stage.style.backgroundColor = spec.theme.background;
    return;
  }
  if (mode === 'transparent') return;

  if (!imageId) throw new Error('Background mode is "image" but no image was uploaded.');
  const url = `/api/backgrounds/${encodeURIComponent(imageId)}`;

  // Decode before the first capture, otherwise early frames would be blank.
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    throw new Error(`The background image could not be decoded (${imageId}).`);
  }

  // Contain leaves letterbox bars; fill them with the theme background so the frame has
  // a defined color rather than whatever the browser happens to paint.
  stage.style.backgroundColor = spec.theme.background;
  stage.style.backgroundImage = `url("${url}")`;
  // Cover fills the frame and crops the overflow; contain fits the whole image inside.
  // Neither distorts the image — "100% 100%" is deliberately not offered.
  stage.style.backgroundSize = fit === 'contain' ? 'contain' : 'cover';
}

async function renderFrame(progress: number): Promise<void> {
  if (!chart || !currentSpec) throw new Error('renderFrame called before init');
  const option = buildOption(currentSpec, progress, currentCanvas, currentComposition);

  // notMerge keeps every frame a pure function of `progress` — no state carried over.
  chart.setOption(option, { notMerge: true, lazyUpdate: false, silent: true });

  await zrenderFinished(chart);
  await nextPaint();
}

/** Resolve once ECharts reports the canvas render pass complete. */
function zrenderFinished(instance: echarts.ECharts): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      instance.off('finished', done);
      resolve();
    };
    instance.on('finished', done);
    const zr = instance.getZr() as { flush?: () => void };
    // Force the pending render pass to run now instead of on the next animation frame.
    zr.flush?.();
    // 'finished' fires synchronously inside flush() for a non-animated chart; this is
    // the safety net for renderers that defer it, not a timing sleep.
    requestAnimationFrame(() => requestAnimationFrame(done));
  });
}

/** Resolve after the browser has actually composited a frame. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

declare global {
  interface Window {
    ChartStudio: { init: typeof init; renderFrame: typeof renderFrame; ready: true };
  }
}

window.ChartStudio = { init, renderFrame, ready: true };
