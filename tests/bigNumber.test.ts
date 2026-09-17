import { describe, it, expect } from 'vitest';
import { bigNumberText, buildBigNumberOption } from '../src/templates/bigNumber.js';
import { formatNumber } from '../src/shared/format.js';
import { BIG_NUMBER_VARIANTS } from '../src/presets/bigNumbers.js';
import { DARK_MINIMAL, type BigNumberSpec } from '../src/shared/types.js';
import { PORTRAIT, estimateTextWidth, getLayout } from '../src/shared/layout.js';

function specOf(variantId: string): BigNumberSpec {
  const v = BIG_NUMBER_VARIANTS.find((x) => x.id === variantId);
  if (!v) throw new Error(`no variant ${variantId}`);
  return {
    template: 'big-number',
    title: v.title,
    subtitle: v.subtitle,
    valueMode: 'number',
    theme: DARK_MINIMAL,
    value: v.value,
    decimals: v.decimals,
    prefix: v.prefix,
    suffix: v.suffix,
    separators: v.separators,
  };
}

function graphicText(option: unknown): string {
  const graphic = (option as { graphic: Array<{ type: string; style?: { text?: string } }> }).graphic;
  const text = graphic.find((g) => g.type === 'text');
  return text?.style?.text ?? '';
}

describe('formatNumber', () => {
  it('groups thousands and honours the requested precision', () => {
    expect(formatNumber(11149, 0)).toBe('11,149');
    expect(formatNumber(5968.5, 1)).toBe('5,968.5');
    expect(formatNumber(5.6, 1)).toBe('5.6');
    expect(formatNumber(1234567.89, 2)).toBe('1,234,567.89');
  });

  it('can omit separators', () => {
    expect(formatNumber(11149, 0, false)).toBe('11149');
  });

  it('applies prefix and suffix', () => {
    expect(formatNumber(5.6, 1, true, '', '%')).toBe('5.6%');
    expect(formatNumber(1200, 0, true, '$', '')).toBe('$1,200');
  });

  it('keeps the sign outside the prefix', () => {
    expect(formatNumber(-42.5, 1, true, '$', '')).toBe('-$42.5');
  });

  it('pads to the requested decimals rather than dropping them', () => {
    expect(formatNumber(5, 1)).toBe('5.0');
    expect(formatNumber(5, 0)).toBe('5');
  });
});

describe('big number count-up', () => {
  it('starts at zero on the first frame for every variant', () => {
    expect(bigNumberText(specOf('a'), 0)).toBe('0');
    expect(bigNumberText(specOf('b'), 0)).toBe('0.0%');
    expect(bigNumberText(specOf('c'), 0)).toBe('0.0');
  });

  it('ends on exactly the supplied value and formatting for every variant', () => {
    expect(bigNumberText(specOf('a'), 1)).toBe('11,149');
    expect(bigNumberText(specOf('b'), 1)).toBe('5.6%');
    expect(bigNumberText(specOf('c'), 1)).toBe('5,968.5');
  });

  it('shows an intermediate value part-way through', () => {
    expect(bigNumberText(specOf('a'), 0.5)).toBe('5,575');
    expect(bigNumberText(specOf('c'), 0.5)).toBe('2,984.3');
  });

  it('computes frame N directly from progress, not from the previous frame', () => {
    const spec = specOf('a');
    // Calling out of order must not change any result.
    const ordered = [0, 0.25, 0.5, 0.75, 1].map((p) => bigNumberText(spec, p));
    const shuffled = [1, 0.5, 0, 0.75, 0.25].map((p) => bigNumberText(spec, p));
    expect(shuffled).toEqual([ordered[4], ordered[2], ordered[0], ordered[3], ordered[1]]);
  });

  it('never runs backwards as progress increases', () => {
    const spec = specOf('a');
    let previous = -1;
    for (let step = 0; step <= 30; step++) {
      const n = Number(bigNumberText(spec, step / 30).replace(/,/g, ''));
      expect(n).toBeGreaterThanOrEqual(previous);
      previous = n;
    }
  });
});

describe('big number composition', () => {
  it('renders the value as a centred graphic text with the title from the spec', () => {
    const option = buildBigNumberOption(specOf('a'), 1) as unknown as {
      title: { text: string };
      graphic: Array<{ type: string; style?: { text?: string; x?: number; textAlign?: string; textVerticalAlign?: string } }>;
      series: unknown[];
    };
    expect(option.title.text).toBe('Ranked Games Analyzed');
    expect(graphicText(option)).toBe('11,149');
    const value = option.graphic.find((g) => g.type === 'text');
    // Anchored on the horizontal centre of the frame, centred on that point.
    expect(value?.style?.x).toBe(960);
    expect(value?.style?.textAlign).toBe('center');
    expect(value?.style?.textVerticalAlign).toBe('middle');
    expect(option.series).toEqual([]);
  });

  it('carries the exact final value into portrait as well as landscape', () => {
    expect(graphicText(buildBigNumberOption(specOf('c'), 1))).toBe('5,968.5');
    expect(graphicText(buildBigNumberOption(specOf('c'), 1, PORTRAIT))).toBe('5,968.5');
  });

  it('shrinks the value so a wide read-out is never clipped', () => {
    const wide: BigNumberSpec = { ...specOf('a'), value: 123456789012, decimals: 2 };
    const option = buildBigNumberOption(wide, 1, PORTRAIT) as unknown as {
      graphic: Array<{ type: string; style?: { font?: string } }>;
    };
    const font = option.graphic.find((g) => g.type === 'text')?.style?.font ?? '';
    const size = Number(/(\d+)px/.exec(font)?.[1]);
    expect(size).toBeGreaterThan(0);
    // The read-out must fit inside the portrait frame minus its side margins.
    const layout = getLayout(PORTRAIT);
    expect(estimateTextWidth('123,456,789,012.00', size, true)).toBeLessThanOrEqual(
      layout.width - layout.pad * 2 + 1,
    );
  });

  it('carries the three demo variants exactly as specified', () => {
    expect(BIG_NUMBER_VARIANTS.map((v) => [v.value, bigNumberText(specOf(v.id), 1), v.title])).toEqual([
      [11149, '11,149', 'Ranked Games Analyzed'],
      [5.6, '5.6%', 'Early Surrender Rate'],
      [5968.5, '5,968.5', 'Median Gold Deficit at Early Surrender'],
    ]);
    // No subtitles are invented for the demo variants.
    expect(BIG_NUMBER_VARIANTS.every((v) => v.subtitle === '')).toBe(true);
  });
});
