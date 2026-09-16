import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import type { AnimationSpec, ChartSpec, Composition } from '../src/shared/types.js';
import { buildTimeline, frameProgress } from '../src/shared/timeline.js';

export interface FrameJob {
  renderUrl: string;
  spec: ChartSpec;
  animation: AnimationSpec;
  composition: Composition;
  width: number;
  height: number;
  frameDir: string;
  /**
   * Timeline frame indices to capture, in order. Defaults to the whole timeline;
   * a single-PNG export passes just the final index.
   */
  frameIndices?: number[];
  onFrame?: (done: number, total: number) => void;
}

export const FRAME_PATTERN = 'frame_%06d.png';
export const frameName = (i: number): string => `frame_${String(i).padStart(6, '0')}.png`;

/**
 * Render frames with Playwright.
 *
 * Frame timing is computed here from the shared timeline, never from wall-clock time
 * inside the browser, so the sequence is fully deterministic. The page is only asked
 * to draw a given progress value, which keeps this pipeline template-agnostic.
 *
 * Captured files are always named by their position in the output sequence, so a
 * single-frame PNG export lands on frame_000000.png regardless of which timeline frame
 * it came from.
 */
export async function renderFrames(job: FrameJob): Promise<number> {
  const timeline = buildTimeline(job.animation);
  const indices = job.frameIndices ?? Array.from({ length: timeline.totalFrames }, (_, i) => i);
  const transparent = job.composition.background.mode === 'transparent';
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--disable-lcd-text'] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/Executable doesn't exist|browserType.launch/i.test(msg)) {
      throw new Error(
        'The Playwright Chromium browser is not installed. Run "npx playwright install chromium" and try again.\n' +
          msg.split('\n').slice(0, 3).join('\n'),
      );
    }
    throw err;
  }

  try {
    const context = await browser.newContext({
      viewport: { width: job.width, height: job.height },
      deviceScaleFactor: 1,
      // Keep rendering identical across machines with different OS scaling/motion settings.
      reducedMotion: 'reduce',
      colorScheme: 'dark',
    });
    const page = await context.newPage();

    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') pageErrors.push(m.text());
    });

    const response = await page.goto(job.renderUrl, { waitUntil: 'load', timeout: 30_000 });
    if (!response || !response.ok()) {
      throw new Error(`Render host page did not load (${job.renderUrl}, status ${response?.status() ?? 'no response'}).`);
    }

    try {
      await page.waitForFunction(() => window.ChartStudio?.ready === true, undefined, { timeout: 30_000 });
    } catch {
      throw new Error(
        `The render host page never became ready.${pageErrors.length ? ` Page errors: ${pageErrors.join(' | ')}` : ''}`,
      );
    }

    // init resolves only once fonts are ready and any background image has decoded.
    await page.evaluate(
      ([spec, w, h, comp]) =>
        window.ChartStudio.init(spec as ChartSpec, w as number, h as number, comp as Composition),
      [job.spec, job.width, job.height, job.composition] as const,
    );

    for (let out = 0; out < indices.length; out++) {
      const progress = frameProgress(indices[out], job.animation);
      await page.evaluate((p) => window.ChartStudio.renderFrame(p as number), progress);
      await page.screenshot({
        path: path.join(job.frameDir, frameName(out)),
        type: 'png',
        clip: { x: 0, y: 0, width: job.width, height: job.height },
        // The only thing that keeps the alpha channel: without it Chromium composites
        // the page onto opaque white before the capture.
        omitBackground: transparent,
        animations: 'disabled',
        caret: 'hide',
      });
      job.onFrame?.(out + 1, indices.length);
    }

    if (pageErrors.length) {
      throw new Error(`Errors were reported by the render page: ${pageErrors.slice(0, 5).join(' | ')}`);
    }

    return indices.length;
  } finally {
    await browser.close().catch(() => undefined);
  }
}
