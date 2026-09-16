import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ExportRequest, JobState } from '../src/shared/types.js';
import { buildTimeline } from '../src/shared/timeline.js';
import { sanitizeFilename, uniqueFilename } from '../src/shared/filename.js';
import { OUTPUT_DIR, FAILED_DIR, WORK_DIR, resolveOutputPath, ensureDirs } from './paths.js';
import { renderFrames, FRAME_PATTERN } from './frames.js';
import { encodeMp4, resolveFfmpeg } from './ffmpeg.js';

const jobs = new Map<string, JobState>();

/**
 * Exports are serialized. Each job still gets its own working directory, but running
 * one browser + encoder at a time keeps memory bounded and makes progress reporting
 * meaningful; concurrent requests queue instead of interfering.
 */
let queue: Promise<unknown> = Promise.resolve();

export function getJob(id: string): JobState | undefined {
  return jobs.get(id);
}

export function startExport(req: ExportRequest, renderUrl: string): JobState {
  ensureDirs();
  const timeline = buildTimeline(req.animation);
  const id = randomUUID();
  const job: JobState = {
    id,
    status: 'queued',
    framesDone: 0,
    totalFrames: timeline.totalFrames,
    message: 'Queued',
  };
  jobs.set(id, job);

  queue = queue.then(() => runExport(req, renderUrl, job)).catch(() => undefined);
  return job;
}

async function runExport(req: ExportRequest, renderUrl: string, job: JobState): Promise<void> {
  const workDir = path.join(WORK_DIR, job.id);
  const frameDir = path.join(workDir, 'frames');
  await fsp.mkdir(frameDir, { recursive: true });

  try {
    // Fail before rendering 120 frames if the encoder is missing.
    await resolveFfmpeg();

    job.status = 'rendering';
    job.message = `Rendering 0 / ${job.totalFrames} frames`;

    const rendered = await renderFrames({
      renderUrl,
      spec: req.chart,
      animation: req.animation,
      width: req.width,
      height: req.height,
      frameDir,
      onFrame: (done, total) => {
        job.framesDone = done;
        job.message = `Rendering ${done} / ${total} frames`;
      },
    });

    // Verify the sequence on disk rather than trusting the loop counter.
    const written = (await fsp.readdir(frameDir)).filter((f) => /^frame_\d{6}\.png$/.test(f));
    if (written.length !== job.totalFrames || rendered !== job.totalFrames) {
      throw new Error(`Expected ${job.totalFrames} frames but found ${written.length} on disk.`);
    }
    for (let i = 0; i < job.totalFrames; i++) {
      const p = path.join(frameDir, `frame_${String(i).padStart(6, '0')}.png`);
      const stat = await fsp.stat(p).catch(() => null);
      if (!stat || stat.size === 0) throw new Error(`Frame ${i} is missing or empty.`);
    }

    job.status = 'encoding';
    job.message = `Encoding ${job.totalFrames} frames to MP4`;

    // Encode into the work directory first; outputs/ only ever receives finished files.
    const tempMp4 = path.join(workDir, 'output.mp4');
    await encodeMp4({
      framePattern: path.join(frameDir, FRAME_PATTERN),
      frameCount: job.totalFrames,
      fps: req.animation.fps,
      width: req.width,
      height: req.height,
      outputPath: tempMp4,
    });

    const encoded = await fsp.stat(tempMp4).catch(() => null);
    if (!encoded || encoded.size === 0) throw new Error('FFmpeg reported success but produced no video file.');

    const safe = sanitizeFilename(req.filename);
    const finalName = uniqueFilename(safe, fs.readdirSync(OUTPUT_DIR));
    const finalPath = resolveOutputPath(finalName);
    await fsp.rename(tempMp4, finalPath).catch(async (err) => {
      // rename fails across volumes; fall back to a copy.
      if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
        await fsp.copyFile(tempMp4, finalPath);
        await fsp.unlink(tempMp4);
      } else throw err;
    });

    await fsp.rm(workDir, { recursive: true, force: true });

    job.status = 'done';
    job.filename = finalName;
    job.message = `Saved outputs/${finalName}`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    job.status = 'error';
    job.error = message;
    job.message = 'Export failed';
    // Keep the partial frames for debugging, well away from outputs/.
    await fsp
      .rename(workDir, path.join(FAILED_DIR, job.id))
      .catch(() => fsp.rm(workDir, { recursive: true, force: true }).catch(() => undefined));
  }
}
