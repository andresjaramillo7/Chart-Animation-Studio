import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export interface Tool {
  path: string;
  source: 'FFMPEG_PATH' | 'FFPROBE_PATH' | 'PATH' | 'ffmpeg-static';
}

let ffmpegCache: Tool | null = null;

/**
 * Locate ffmpeg. PATH wins so a system install is always preferred; the bundled
 * ffmpeg-static binary is the fallback that makes a fresh clone work out of the box.
 */
export async function resolveFfmpeg(): Promise<Tool> {
  if (ffmpegCache) return ffmpegCache;

  const fromEnv = process.env.FFMPEG_PATH?.trim();
  if (fromEnv && (await canRun(fromEnv))) {
    ffmpegCache = { path: fromEnv, source: 'FFMPEG_PATH' };
    return ffmpegCache;
  }
  if (await canRun('ffmpeg')) {
    ffmpegCache = { path: 'ffmpeg', source: 'PATH' };
    return ffmpegCache;
  }
  const bundled = loadStaticBinary('ffmpeg-static');
  if (bundled && (await canRun(bundled))) {
    ffmpegCache = { path: bundled, source: 'ffmpeg-static' };
    return ffmpegCache;
  }
  throw new Error(
    'FFmpeg was not found. Install it with "winget install Gyan.FFmpeg" (restart PowerShell afterwards), ' +
      'or set FFMPEG_PATH to the full path of ffmpeg.exe.',
  );
}

/** ffprobe is only used for verification, so a miss is reported, not fatal. */
export async function resolveFfprobe(): Promise<Tool | null> {
  const fromEnv = process.env.FFPROBE_PATH?.trim();
  if (fromEnv && (await canRun(fromEnv))) return { path: fromEnv, source: 'FFPROBE_PATH' };
  if (await canRun('ffprobe')) return { path: 'ffprobe', source: 'PATH' };
  const bundled = loadStaticBinary('ffprobe-static');
  if (bundled && (await canRun(bundled))) return { path: bundled, source: 'ffmpeg-static' };
  return null;
}

/**
 * ffmpeg-static exports the path directly; ffprobe-static exports `{ path }`.
 * Both are optional — a missing package is simply not a candidate.
 */
function loadStaticBinary(pkg: 'ffmpeg-static' | 'ffprobe-static'): string | null {
  try {
    const mod = require(pkg);
    const resolved: unknown = mod?.path ?? mod?.default?.path ?? mod?.default ?? mod;
    return typeof resolved === 'string' && resolved.length > 0 ? resolved : null;
  } catch {
    return null;
  }
}

function canRun(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(bin, ['-version'], { stdio: 'ignore', windowsHide: true });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

export interface EncodeOptions {
  framePattern: string;
  frameCount: number;
  fps: number;
  width: number;
  height: number;
  outputPath: string;
}

/**
 * Encode a numbered PNG sequence into an editor-friendly H.264 MP4.
 * `-frames:v` pins the output to exactly the frames we rendered, so the video
 * duration is always frameCount / fps.
 */
export async function encodeMp4(opts: EncodeOptions): Promise<string> {
  const { path: bin } = await resolveFfmpeg();
  const args = [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-framerate', String(opts.fps),
    '-start_number', '0',
    '-i', opts.framePattern,
    '-frames:v', String(opts.frameCount),
    '-an',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '16',
    '-pix_fmt', 'yuv420p',
    '-profile:v', 'high',
    '-level', '4.2',
    '-r', String(opts.fps),
    '-s', `${opts.width}x${opts.height}`,
    '-movflags', '+faststart',
    opts.outputPath,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (c) => {
      stderr += c.toString();
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    child.on('error', (err) => reject(new Error(`Failed to launch FFmpeg (${bin}): ${err.message}`)));
    child.on('close', (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`FFmpeg exited with code ${code}.\n${stderr.slice(-4000)}`));
    });
  });
}
