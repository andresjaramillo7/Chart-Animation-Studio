import * as echarts from 'echarts';
import type { ChartSpec } from '../shared/types.js';
import { buildOption } from '../templates/index.js';

/**
 * Headless render host driven by Playwright.
 *
 * The export pipeline only ever calls `init` then `renderFrame(progress)` — it knows
 * nothing about which template is in play, so adding the remaining three templates
 * requires no change to the export pipeline.
 */

let chart: echarts.ECharts | null = null;
let currentSpec: ChartSpec | null = null;
let currentCanvas = { width: 1920, height: 1080 };

async function init(spec: ChartSpec, width: number, height: number): Promise<void> {
  const stage = document.getElementById('stage');
  if (!stage) throw new Error('#stage element is missing from the render host page');

  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  stage.style.background = spec.theme.background;
  document.body.style.background = spec.theme.background;

  if (chart) chart.dispose();
  chart = echarts.init(stage, undefined, {
    renderer: 'canvas',
    width,
    height,
    // 1:1 with the Playwright viewport so the screenshot is exactly width x height.
    devicePixelRatio: 1,
  });
  currentSpec = spec;
  currentCanvas = { width, height };

  // Text metrics depend on loaded fonts; measuring before they are ready would
  // shift labels between frames.
  if (document.fonts?.ready) await document.fonts.ready;
}

async function renderFrame(progress: number): Promise<void> {
  if (!chart || !currentSpec) throw new Error('renderFrame called before init');
  const option = buildOption(currentSpec, progress, currentCanvas);

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
