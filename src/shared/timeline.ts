import type { AnimationSpec, Easing } from './types.js';

/**
 * Deterministic frame timeline. Nothing here touches wall-clock time; a frame index
 * is the only input, so a given ExportRequest always produces byte-identical timing.
 *
 * Frame-count rule (documented in the README):
 *   animationFrames = round(durationSeconds * fps)
 *   holdFrames      = max(1, round(holdSeconds * fps))
 *   totalFrames     = animationFrames + holdFrames
 *   exportedDuration = totalFrames / fps
 *
 * Frame `i` shows the chart state at timestamp `i / fps`, so frame 0 is always the
 * initial state (progress 0) and every frame from `animationFrames` onward is the
 * completed chart (progress 1). The hold is clamped to at least one frame so the
 * final frame is always the finished composition.
 */

export const EASINGS: Record<Easing, (t: number) => number> = {
  linear: (t) => t,
  // cubic ease-out: fast start, gentle settle
  'ease-out': (t) => 1 - Math.pow(1 - t, 3),
};

export function applyEasing(easing: Easing, t: number): number {
  const clamped = clamp01(t);
  return clamp01(EASINGS[easing](clamped));
}

export function clamp01(t: number): number {
  if (Number.isNaN(t)) return 0;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export interface Timeline {
  fps: number;
  animationFrames: number;
  holdFrames: number;
  totalFrames: number;
  durationSeconds: number;
}

export function buildTimeline(anim: AnimationSpec): Timeline {
  const fps = anim.fps;
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('fps must be a positive number');
  if (!Number.isFinite(anim.durationSeconds) || anim.durationSeconds <= 0) {
    throw new Error('Animation duration must be greater than 0 seconds');
  }
  if (!Number.isFinite(anim.holdSeconds) || anim.holdSeconds < 0) {
    throw new Error('Final-frame hold must be 0 seconds or more');
  }
  const animationFrames = Math.round(anim.durationSeconds * fps);
  const holdFrames = Math.max(1, Math.round(anim.holdSeconds * fps));
  const totalFrames = animationFrames + holdFrames;
  return {
    fps,
    animationFrames,
    holdFrames,
    totalFrames,
    durationSeconds: totalFrames / fps,
  };
}

/** Wall-clock timestamp, in seconds, of a frame index. */
export function frameTimestamp(frameIndex: number, fps: number): number {
  return frameIndex / fps;
}

/** Normalized (un-eased) animation progress of a frame index. */
export function rawProgress(frameIndex: number, anim: AnimationSpec): number {
  return clamp01(frameTimestamp(frameIndex, anim.fps) / anim.durationSeconds);
}

/** Eased progress of a frame index — what templates actually consume. */
export function frameProgress(frameIndex: number, anim: AnimationSpec): number {
  return applyEasing(anim.easing, rawProgress(frameIndex, anim));
}

/**
 * Fraction of the global timeline each item occupies when a template reveals its
 * categories one after another. Lower means more overlap between neighbours.
 */
export const SEQUENTIAL_STAGGER = 0.35;

/**
 * Per-item progress for a sequential reveal, derived purely from the global timeline.
 *
 * Item `index` animates over the window `[index * stagger * w, index * stagger * w + w]`
 * where `w = 1 / (1 + (count - 1) * stagger)`. That makes the last item finish exactly
 * when global progress reaches 1, so every item is at 0 on the first frame and at 1 on
 * the final frame. No wall-clock delays are involved.
 */
export function staggeredProgress(
  index: number,
  count: number,
  progress: number,
  stagger: number = SEQUENTIAL_STAGGER,
): number {
  const p = clamp01(progress);
  if (count <= 1 || stagger <= 0) return p;
  const window = 1 / (1 + (count - 1) * stagger);
  const start = index * stagger * window;
  return clamp01((p - start) / window);
}

/**
 * Progress for item `index` under the chosen reveal mode. `simultaneous` gives every
 * item the global progress; `sequential` staggers them across the same timeline.
 */
export function itemProgress(
  index: number,
  count: number,
  progress: number,
  reveal: 'simultaneous' | 'sequential',
): number {
  return reveal === 'sequential' ? staggeredProgress(index, count, progress) : clamp01(progress);
}
