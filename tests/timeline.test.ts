import { describe, it, expect } from 'vitest';
import { buildTimeline, frameProgress, rawProgress, applyEasing, frameTimestamp } from '../src/shared/timeline.js';
import type { AnimationSpec } from '../src/shared/types.js';

const anim = (over: Partial<AnimationSpec> = {}): AnimationSpec => ({
  durationSeconds: 3,
  holdSeconds: 1,
  easing: 'linear',
  fps: 30,
  ...over,
});

describe('frame count', () => {
  it('turns 3s animation + 1s hold at 30fps into exactly 120 frames and a 4.000s video', () => {
    const t = buildTimeline(anim());
    expect(t.animationFrames).toBe(90);
    expect(t.holdFrames).toBe(30);
    expect(t.totalFrames).toBe(120);
    expect(t.durationSeconds).toBeCloseTo(4, 6);
  });

  it('rounds fractional durations to the nearest frame', () => {
    // 2.51s * 30 = 75.3 -> 75 frames; 0.52s * 30 = 15.6 -> 16 frames
    const t = buildTimeline(anim({ durationSeconds: 2.51, holdSeconds: 0.52 }));
    expect(t.animationFrames).toBe(75);
    expect(t.holdFrames).toBe(16);
    expect(t.totalFrames).toBe(91);
    expect(t.durationSeconds).toBeCloseTo(91 / 30, 6);
  });

  it('clamps the hold to at least one frame so the final frame is the completed chart', () => {
    const t = buildTimeline(anim({ holdSeconds: 0 }));
    expect(t.holdFrames).toBe(1);
    expect(t.totalFrames).toBe(91);
    expect(frameProgress(t.totalFrames - 1, anim({ holdSeconds: 0 }))).toBe(1);
  });

  it('rejects a non-positive duration', () => {
    expect(() => buildTimeline(anim({ durationSeconds: 0 }))).toThrow(/greater than 0/);
    expect(() => buildTimeline(anim({ durationSeconds: -1 }))).toThrow();
  });

  it('rejects a negative hold', () => {
    expect(() => buildTimeline(anim({ holdSeconds: -1 }))).toThrow(/0 seconds or more/);
  });
});

describe('frame timestamps and progress', () => {
  it('derives the timestamp from frame index and fps', () => {
    expect(frameTimestamp(0, 30)).toBe(0);
    expect(frameTimestamp(45, 30)).toBe(1.5);
    expect(frameTimestamp(120, 30)).toBe(4);
  });

  it('starts at 0, is halfway at the midpoint, and reaches 1 at the end (linear)', () => {
    const a = anim();
    expect(frameProgress(0, a)).toBe(0);
    expect(frameProgress(45, a)).toBeCloseTo(0.5, 6); // 1.5s of a 3s animation
    expect(frameProgress(90, a)).toBe(1); // first hold frame
    expect(frameProgress(119, a)).toBe(1); // final frame
  });

  it('holds progress at 1 for every frame after the animation ends', () => {
    const a = anim();
    const t = buildTimeline(a);
    for (let i = t.animationFrames; i < t.totalFrames; i++) {
      expect(frameProgress(i, a)).toBe(1);
    }
  });

  it('never exceeds 1 or drops below 0', () => {
    const a = anim();
    for (let i = 0; i < 200; i++) {
      const p = rawProgress(i, a);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('produces a strictly increasing value during the animation', () => {
    const a = anim({ easing: 'ease-out' });
    let previous = -1;
    for (let i = 0; i <= 90; i++) {
      const p = frameProgress(i, a);
      expect(p).toBeGreaterThan(previous);
      previous = p;
    }
  });
});

describe('easing', () => {
  it('linear is the identity on [0,1]', () => {
    expect(applyEasing('linear', 0)).toBe(0);
    expect(applyEasing('linear', 0.25)).toBe(0.25);
    expect(applyEasing('linear', 1)).toBe(1);
  });

  it('ease-out pins the endpoints and runs ahead of linear in between', () => {
    expect(applyEasing('ease-out', 0)).toBe(0);
    expect(applyEasing('ease-out', 1)).toBe(1);
    expect(applyEasing('ease-out', 0.5)).toBeCloseTo(0.875, 6); // 1 - (1-0.5)^3
    expect(applyEasing('ease-out', 0.5)).toBeGreaterThan(applyEasing('linear', 0.5));
  });

  it('clamps out-of-range input', () => {
    expect(applyEasing('ease-out', -2)).toBe(0);
    expect(applyEasing('linear', 5)).toBe(1);
  });

  it('linear and ease-out agree only at the endpoints for the exported timeline', () => {
    const linear = anim({ easing: 'linear' });
    const eased = anim({ easing: 'ease-out' });
    expect(frameProgress(0, linear)).toBe(frameProgress(0, eased));
    expect(frameProgress(119, linear)).toBe(frameProgress(119, eased));
    expect(frameProgress(45, linear)).not.toBe(frameProgress(45, eased));
  });
});
