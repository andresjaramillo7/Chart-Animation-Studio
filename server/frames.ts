import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import type { ChartSpec, AnimationSpec } from '../src/shared/types.js';
import { buildTimeline, frameProgress } from '../src/shared/timeline.js';

export interface FrameJob {
  renderUrl: string;
  spec: ChartSpec;
  animation: AnimationSpec;
  width: number;
  height: number;
  frameDir: string;
  onFrame?: (done: number, total: number) => void;
}

export const FRAME_PATTERN = 'frame_%06d.png';
const frameName = (i: number) => `frame_${String(i).padStart(6, '0')}.png`;

/**
 * Render every frame of the timeline with Playwright.
 *
 * Frame timing is computed here from the shared timeline, never from wall-clock time
 * inside the browser, so the sequence is fully deterministic. The page is only asked
 * to draw a given progress value, which keeps this pipeline template-agnostic.
 */
export async function renderFrames(job: FrameJob): Promise<number> {
  const timeline = buildTimeline(job.animation);
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

    await page.evaluate(
      ([spec, w, h]) => window.ChartStudio.init(spec as ChartSpec, w as number, h as number),
      [job.spec, job.width, job.height] as const,
    );

    for (let i = 0; i < timeline.totalFrames; i++) {
      const progress = frameProgress(i, job.animation);
      await page.evaluate((p) => window.ChartStudio.renderFrame(p as number), progress);
      await page.screenshot({
        path: path.join(job.frameDir, frameName(i)),
        type: 'png',
        clip: { x: 0, y: 0, width: job.width, height: job.height },
        animations: 'disabled',
        caret: 'hide',
      });
      job.onFrame?.(i + 1, timeline.totalFrames);
    }

    if (pageErrors.length) {
      throw new Error(`Errors were reported by the render page: ${pageErrors.slice(0, 5).join(' | ')}`);
    }

    return timeline.totalFrames;
  } finally {
    await browser.close().catch(() => undefined);
  }
}
