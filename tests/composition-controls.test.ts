import { describe, it, expect } from 'vitest';
import { buildOption, supportedVisibility, TEMPLATE_IDS, TEMPLATE_META } from '../src/templates/index.js';
import {
  ALL_VISIBLE,
  CHART_ONLY,
  DEFAULT_COMPOSITION,
  THEMES,
  type ChartSpec,
  type Composition,
  type VisibilitySpec,
} from '../src/shared/types.js';
import { parseCsv } from '../src/shared/csv.js';
import { COMEBACK_CURVE_CSV } from '../src/presets/comebackCurve.js';
import { SCALING_COMPARISON_CSV } from '../src/presets/scalingComparison.js';
import { getLayout, LANDSCAPE } from '../src/shared/layout.js';

const THEME = THEMES['dark-minimal'];

function data(csv: string) {
  const parsed = parseCsv(csv, 'percent');
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.data;
}

/** One spec per template, so composition rules can be asserted for all four. */
function allSpecs(): ChartSpec[] {
  const base = { title: 'Comeback Rate by Gold Deficit', subtitle: 'A subtitle.', theme: THEME } as const;
  return [
    { ...base, template: 'animated-bar', valueMode: 'percent', data: data(COMEBACK_CURVE_CSV), highlight: '6000+' },
    { ...base, template: 'animated-line', valueMode: 'percent', data: data(COMEBACK_CURVE_CSV), highlight: null },
    { ...base, template: 'comparison', valueMode: 'percent', data: data(SCALING_COMPARISON_CSV), highlight: null },
    {
      ...base,
      template: 'big-number',
      valueMode: 'number',
      value: 11149,
      decimals: 0,
      prefix: '',
      suffix: '',
      separators: true,
    },
  ];
}

const comp = (over: Partial<VisibilitySpec> = {}, background = DEFAULT_COMPOSITION.background): Composition => ({
  background,
  show: { ...ALL_VISIBLE, ...over },
});

type Opt = {
  backgroundColor: string;
  title: { show?: boolean; text?: string; subtext?: string };
  graphic: Array<Record<string, unknown>>;
  grid?: { top: number };
  xAxis: { axisLine?: { show?: boolean }; axisLabel?: { show?: boolean }; splitLine?: { show?: boolean } };
  yAxis: { axisLine?: { show?: boolean }; axisLabel?: { show?: boolean }; splitLine?: { show?: boolean } };
  series: Array<{ label?: { show?: boolean } }>;
};

const bar = (c: Composition, progress = 1): Opt => buildOption(allSpecs()[0], progress, LANDSCAPE, c) as unknown as Opt;
const line = (c: Composition): Opt => buildOption(allSpecs()[1], 1, LANDSCAPE, c) as unknown as Opt;
const big = (c: Composition): Opt => buildOption(allSpecs()[3], 1, LANDSCAPE, c) as unknown as Opt;

describe('background modes', () => {
  it('paints the canvas only in solid mode', () => {
    expect(bar(comp({}, { mode: 'solid', imageId: null, fit: 'cover' })).backgroundColor).toBe(THEME.background);
  });

  it('leaves the canvas transparent for image and transparent modes', () => {
    // An opaque canvas would hide the image behind it and destroy the alpha channel.
    expect(bar(comp({}, { mode: 'image', imageId: 'x.png', fit: 'cover' })).backgroundColor).toBe('transparent');
    expect(bar(comp({}, { mode: 'transparent', imageId: null, fit: 'cover' })).backgroundColor).toBe('transparent');
  });

  it('applies the same rule to every template', () => {
    const transparent = comp({}, { mode: 'transparent', imageId: null, fit: 'cover' });
    for (const spec of allSpecs()) {
      const option = buildOption(spec, 1, LANDSCAPE, transparent) as unknown as Opt;
      expect(option.backgroundColor, spec.template).toBe('transparent');
    }
  });

  it('defaults to a solid background when no composition is supplied', () => {
    expect((buildOption(allSpecs()[0], 1) as unknown as Opt).backgroundColor).toBe(THEME.background);
    expect(DEFAULT_COMPOSITION.background.mode).toBe('solid');
  });

  it('does not change the plotted data when the background changes', () => {
    const values = (c: Composition) =>
      (buildOption(allSpecs()[0], 1, LANDSCAPE, c) as unknown as { series: Array<{ data: Array<{ value: number }> }> })
        .series[0].data.map((d) => d.value);
    const solid = values(comp({}, { mode: 'solid', imageId: null, fit: 'cover' }));
    expect(values(comp({}, { mode: 'transparent', imageId: null, fit: 'cover' }))).toEqual(solid);
    expect(values(comp({}, { mode: 'image', imageId: 'x.png', fit: 'contain' }))).toEqual(solid);
    expect(solid).toEqual([45.4, 37.4, 30.5, 21.1, 16.3, 12.4, 6.6]);
  });
});

describe('visibility controls', () => {
  it('hides the title and its accent rule independently of the subtitle', () => {
    const noTitle = bar(comp({ title: false }));
    expect(noTitle.title.text).toBe('');
    expect(noTitle.title.subtext).toBe('A subtitle.');

    const noSubtitle = bar(comp({ subtitle: false }));
    expect(noSubtitle.title.text).toBe('Comeback Rate by Gold Deficit');
    expect(noSubtitle.title.subtext).toBe('');
  });

  it('drops the header entirely when both are hidden', () => {
    const none = bar(comp({ title: false, subtitle: false }));
    expect(none.title.show).toBe(false);
    expect(none.graphic).toEqual([]);
  });

  it('redistributes the freed space instead of cropping', () => {
    const withHeader = bar(comp()).grid!.top;
    const withoutHeader = bar(comp({ title: false, subtitle: false })).grid!.top;
    expect(withoutHeader).toBeLessThan(withHeader);
    // The plot starts at a plain top margin, not off-frame.
    expect(withoutHeader).toBe(getLayout(LANDSCAPE).pad);
    expect(withoutHeader).toBeGreaterThan(0);
  });

  it('toggles gridlines, axes, axis labels and value labels independently', () => {
    expect(bar(comp({ gridlines: false })).yAxis.splitLine?.show).toBe(false);
    expect(bar(comp({ gridlines: true })).yAxis.splitLine?.show).toBe(true);

    expect(bar(comp({ axes: false })).xAxis.axisLine?.show).toBe(false);
    expect(bar(comp({ axes: true })).xAxis.axisLine?.show).toBe(true);

    expect(bar(comp({ axisLabels: false })).xAxis.axisLabel?.show).toBe(false);
    expect(bar(comp({ axisLabels: false })).yAxis.axisLabel?.show).toBe(false);

    expect(bar(comp({ valueLabels: false })).series[0].label?.show).toBe(false);
    expect(bar(comp({ valueLabels: true })).series[0].label?.show).toBe(true);
  });

  it('applies the same toggles to the line template', () => {
    expect(line(comp({ axisLabels: false })).xAxis.axisLabel?.show).toBe(false);
    expect(line(comp({ axes: false })).xAxis.axisLine?.show).toBe(false);
    expect(line(comp({ gridlines: false })).yAxis.splitLine?.show).toBe(false);
    expect(line(comp({ valueLabels: false })).series[0].label?.show).toBe(false);
  });

  it('hides the Big Number title without disturbing the read-out', () => {
    const hidden = big(comp({ title: false, subtitle: false }));
    expect(hidden.title.show).toBe(false);
    const text = hidden.graphic.find((g) => g.type === 'text') as { style?: { text?: string } } | undefined;
    expect(text?.style?.text).toBe('11,149');
    // The accent rule goes with the header; only the number is left.
    expect(hidden.graphic).toHaveLength(1);
  });
});

describe('Chart Only preset', () => {
  it('drops titling and decoration but keeps the data visualization', () => {
    expect(CHART_ONLY.title).toBe(false);
    expect(CHART_ONLY.subtitle).toBe(false);
    expect(CHART_ONLY.gridlines).toBe(false);
    expect(CHART_ONLY.legend).toBe(false);
    expect(CHART_ONLY.axes).toBe(true);
    expect(CHART_ONLY.axisLabels).toBe(true);
    expect(CHART_ONLY.valueLabels).toBe(true);
  });

  it('still renders every original value', () => {
    const option = buildOption(allSpecs()[0], 1, LANDSCAPE, {
      background: { mode: 'transparent', imageId: null, fit: 'cover' },
      show: CHART_ONLY,
    }) as unknown as { series: Array<{ data: Array<{ value: number }> }>; backgroundColor: string };
    expect(option.series[0].data.map((d) => d.value)).toEqual([45.4, 37.4, 30.5, 21.1, 16.3, 12.4, 6.6]);
    // Chart Only and transparency compose.
    expect(option.backgroundColor).toBe('transparent');
  });

  it('animates from zero exactly as a full composition does', () => {
    const chartOnly: Composition = { background: DEFAULT_COMPOSITION.background, show: CHART_ONLY };
    const values = (c: Composition, p: number) =>
      (buildOption(allSpecs()[0], p, LANDSCAPE, c) as unknown as { series: Array<{ data: Array<{ value: number }> }> })
        .series[0].data.map((d) => d.value);
    expect(values(chartOnly, 0)).toEqual(values(comp(), 0));
    expect(values(chartOnly, 1)).toEqual(values(comp(), 1));
  });
});

describe('per-template control support', () => {
  it('offers axis and value-label controls only for the plotted templates', () => {
    for (const id of ['animated-bar', 'animated-line', 'comparison'] as const) {
      expect(supportedVisibility(id)).toEqual(['title', 'subtitle', 'axisLabels', 'axes', 'gridlines', 'valueLabels']);
    }
  });

  it('offers only titling controls for Big Number', () => {
    expect(supportedVisibility('big-number')).toEqual(['title', 'subtitle']);
  });

  it('declares no legend, because no current template draws one', () => {
    for (const id of TEMPLATE_IDS) {
      expect(TEMPLATE_META[id].visibility.legend, id).toBe(false);
      expect(supportedVisibility(id)).not.toContain('legend');
    }
  });
});
