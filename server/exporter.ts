import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  supportsTransparency,
  TRANSPARENT_MP4_MESSAGE,
  type ExportFormat,
  type ExportRequest,
  type JobState,
} from '../src/shared/types.js';
import { buildTimeline } from '../src/shared/timeline.js';
import { sanitizeFilename, uniqueFilename } from '../src/shared/filename.js';
import { OUTPUT_DIR, FAILED_DIR, WORK_DIR, resolveOutputPath, ensureDirs } from './paths.js';
import { renderFrames, frameName, FRAME_PATTERN } from './frames.js';
import { encodeMp4, resolveFfmpeg } from './ffmpeg.js';
import { backgroundExists } from './backgrounds.js';

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

/** How many frames a format actually captures. PNG needs only the final one. */
function captureCount(format: ExportFormat, timelineFrames: number): number {
  return format === 'png' ? 1 : timelineFrames;
}

export function startExport(req: ExportRequest, renderUrl: string): JobState {
  ensureDirs();
  const timeline = buildTimeline(req.animation);
  const id = randomUUID();
  const job: JobState = {
    id,
    status: 'queued',
    framesDone: 0,
    totalFrames: captureCount(req.format, timeline.totalFrames),
    timelineFrames: timeline.totalFrames,
    format: req.format,
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
    const transparent = req.composition.background.mode === 'transparent';
    if (transparent && !supportsTransparency(req.format)) throw new Error(TRANSPARENT_MP4_MESSAGE);

    if (req.composition.background.mode === 'image') {
      const id = req.composition.background.imageId;
      if (!id || !(await backgroundExists(id))) {
        throw new Error('The selected background image is no longer available. Upload it again.');
      }
    }
    // Fail before rendering a whole timeline if the encoder is missing.
    if (req.format === 'mp4') await resolveFfmpeg();

    // PNG captures only the last frame of the timeline — the completed composition.
    const frameIndices =
      req.format === 'png'
        ? [job.timelineFrames - 1]
        : Array.from({ length: job.timelineFrames }, (_, i) => i);

    job.status = 'rendering';
    job.message = `Rendering 0 / ${job.totalFrames} frames`;

    const rendered = await renderFrames({
      renderUrl,
      spec: req.chart,
      animation: req.animation,
      composition: req.composition,
      width: req.width,
      height: req.height,
      frameDir,
      frameIndices,
      onFrame: (done, total) => {
        job.framesDone = done;
        job.message = `Rendering ${done} / ${total} frames`;
      },
    });

    await verifyFrames(frameDir, job.totalFrames, rendered);

    const finalName = await deliver(req, job, workDir, frameDir);

    // Only the scratch directory is removed; anything already moved into outputs/ stays.
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

/** Verify the sequence on disk rather than trusting the loop counter. */
async function verifyFrames(frameDir: string, expected: number, rendered: number): Promise<void> {
  const written = (await fsp.readdir(frameDir)).filter((f) => /^frame_\d{6}\.png$/.test(f));
  if (written.length !== expected || rendered !== expected) {
    throw new Error(`Expected ${expected} frames but found ${written.length} on disk.`);
  }
  for (let i = 0; i < expected; i++) {
    const stat = await fsp.stat(path.join(frameDir, frameName(i))).catch(() => null);
    if (!stat || stat.size === 0) throw new Error(`Frame ${i} is missing or empty.`);
  }
}

/**
 * Move the finished artifact into outputs/ under a sanitized, non-colliding name.
 * Nothing reaches outputs/ until it is complete, so a failed job never leaves a
 * half-written file that looks like a successful export.
 */
async function deliver(
  req: ExportRequest,
  job: JobState,
  workDir: string,
  frameDir: string,
): Promise<string> {
  const existing = fs.readdirSync(OUTPUT_DIR);

  if (req.format === 'mp4') {
    job.status = 'encoding';
    job.message = `Encoding ${job.totalFrames} frames to MP4`;

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

    const name = uniqueFilename(sanitizeFilename(req.filename, 'chart-animation', '.mp4'), existing);
    await move(tempMp4, resolveOutputPath(name));
    return name;
  }

  if (req.format === 'png') {
    const name = uniqueFilename(sanitizeFilename(req.filename, 'chart-frame', '.png'), existing);
    await move(path.join(frameDir, frameName(0)), resolveOutputPath(name));
    return name;
  }

  // PNG sequence: the whole numbered directory becomes the deliverable.
  job.message = `Collecting ${job.totalFrames} frames`;
  const base = sanitizeFilename(req.filename, 'chart-sequence', '');
  const name = uniqueFilename(`${base}-frames`, existing);
  await move(frameDir, resolveOutputPath(name));
  return name;
}

/** rename, falling back to a copy when the work dir is on a different volume. */
async function move(from: string, to: string): Promise<void> {
  try {
    await fsp.rename(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
    await fsp.cp(from, to, { recursive: true });
    await fsp.rm(from, { recursive: true, force: true });
  }
}
