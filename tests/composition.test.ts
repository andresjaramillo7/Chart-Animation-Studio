import { describe, it, expect } from 'vitest';
import { buildOption, TEMPLATE_IDS, TEMPLATE_META } from '../src/templates/index.js';
import { getLayout, wrapText, fitCategoryLabels, LANDSCAPE, PORTRAIT, RESOLUTIONS } from '../src/shared/layout.js';
import { THEMES, type ChartSpec, type ThemeId, type Theme } from '../src/shared/types.js';
import { parseCsv } from '../src/shared/csv.js';
import { parseHeatmapCsv, parseScatterCsv, parseSeriesCsv } from '../src/shared/schemas.js';
import { COMEBACK_CURVE_CSV } from '../src/presets/comebackCurve.js';
import { SCALING_COMPARISON_CSV } from '../src/presets/scalingComparison.js';
import {
  DONUT_EXAMPLE_CSV,
  HEATMAP_EXAMPLE_CSV,
  SCATTER_EXAMPLE_CSV,
  STACKED_EXAMPLE_CSV,
} from '../src/presets/examples.js';

function data(csv: string) {
  const parsed = parseCsv(csv, 'percent');
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.data;
}

function seriesTable(csv: string) {
  const parsed = parseSeriesCsv(csv, 'number');
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.table;
}
function scatterPoints(csv: string) {
  const parsed = parseScatterCsv(csv);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.table.points;
}
function heatTable(csv: string) {
  const parsed = parseHeatmapCsv(csv, 'percent');
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.table;
}

/** One spec per template, so cross-cutting rules can be asserted for all nine. */
function allSpecs(theme: Theme): ChartSpec[] {
  const base = { title: 'Comeback Rate by Gold Deficit', subtitle: 'A subtitle.', theme } as const;
  const stack = seriesTable(STACKED_EXAMPLE_CSV);
  const heat = heatTable(HEATMAP_EXAMPLE_CSV);
  return [
    { ...base, template: 'animated-bar', valueMode: 'percent', data: data(COMEBACK_CURVE_CSV), highlight: '6000+' },
    { ...base, template: 'animated-line', valueMode: 'percent', data: data(COMEBACK_CURVE_CSV), highlight: null },
    { ...base, template: 'comparison', valueMode: 'percent', data: data(SCALING_COMPARISON_CSV), highlight: null },
    {
      ...base,
      template: 'donut',
      valueMode: 'percent',
      data: data(DONUT_EXAMPLE_CSV),
      highlight: null,
      innerRadius: 58,
      display: 'percent',
      showTotal: false,
      centerLabel: '',
    },
    {
      ...base,
      template: 'stacked-bar',
      valueMode: 'number',
      categories: stack.categories,
      series: stack.series,
      stackMode: 'regular',
      highlight: null,
    },
    {
      ...base,
      template: 'area',
      valueMode: 'percent',
      data: data(COMEBACK_CURVE_CSV),
      highlight: null,
      areaOpacity: 0.28,
      showPoints: true,
    },
    {
      ...base,
      template: 'scatter',
      valueMode: 'number',
      points: scatterPoints(SCATTER_EXAMPLE_CSV),
      xTitle: 'X',
      yTitle: 'Y',
      symbolSize: 34,
      highlight: null,
    },
    {
      ...base,
      template: 'heatmap',
      valueMode: 'percent',
      xCategories: heat.xCategories,
      yCategories: heat.yCategories,
      cells: heat.cells,
      highlight: null,
    },
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

describe('resolution configuration', () => {
  it('offers exactly landscape 1920x1080 and portrait 1080x1920', () => {
    expect(RESOLUTIONS.landscape).toEqual({ width: 1920, height: 1080 });
    expect(RESOLUTIONS.portrait).toEqual({ width: 1080, height: 1920 });
  });

  it('classifies orientation from the aspect ratio', () => {
    expect(getLayout(LANDSCAPE).portrait).toBe(false);
    expect(getLayout(PORTRAIT).portrait).toBe(true);
  });

  it('recomposes rather than crops: portrait uses larger type and tighter side margins', () => {
    const landscape = getLayout(LANDSCAPE);
    const portrait = getLayout(PORTRAIT);
    expect(portrait.titleSize).toBeGreaterThan(landscape.titleSize);
    expect(portrait.valueLabelSize).toBeGreaterThan(landscape.valueLabelSize);
    expect(portrait.pad).toBeLessThan(landscape.pad);
    // More vertical room is given back to the plot in portrait.
    expect(portrait.gridBottom).toBeGreaterThan(landscape.gridBottom);
  });

  it('scales proportionally for a non-standard canvas', () => {
    const half = getLayout({ width: 960, height: 540 });
    expect(half.titleSize).toBe(Math.round(getLayout(LANDSCAPE).titleSize / 2));
  });

  it('renders every template in both resolutions', () => {
    for (const spec of allSpecs(THEMES['dark-minimal'])) {
      for (const canvas of [LANDSCAPE, PORTRAIT]) {
        const option = buildOption(spec, 1, canvas) as unknown as { backgroundColor: string };
        expect(option.backgroundColor).toBe(THEMES['dark-minimal'].background);
      }
    }
  });
});

describe('theme consistency', () => {
  const themeIds = Object.keys(THEMES) as ThemeId[];

  it('defines all five colors for each of the three themes', () => {
    expect(themeIds).toEqual(['dark-minimal', 'dark-blue', 'light-minimal']);
    for (const id of themeIds) {
      for (const key of ['background', 'primary', 'accent', 'text', 'grid'] as const) {
        expect(THEMES[id][key]).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('applies the selected theme identically across all four templates', () => {
    for (const id of themeIds) {
      const theme = THEMES[id];
      for (const spec of allSpecs(theme)) {
        const option = buildOption(spec, 1) as unknown as {
          backgroundColor: string;
          title: { textStyle: { color: string } };
          graphic: Array<{ style?: { fill?: string } }>;
        };
        expect(option.backgroundColor).toBe(theme.background);
        expect(option.title.textStyle.color).toBe(theme.text);
        // Every template opens with the same accent rule beside the title.
        expect(option.graphic[0].style?.fill).toBe(theme.accent);
      }
    }
  });

  it('routes the gridline color into the value axis of the plotted templates', () => {
    for (const id of themeIds) {
      const theme = THEMES[id];
      const plotted = allSpecs(theme).filter((s) => TEMPLATE_META[s.template].visibility.gridlines);
      for (const spec of plotted) {
        const option = buildOption(spec, 1) as unknown as {
          xAxis: { splitLine?: { lineStyle?: { color?: string } } };
          yAxis: { splitLine?: { lineStyle?: { color?: string } } };
        };
        const gridColor = option.yAxis.splitLine?.lineStyle?.color ?? option.xAxis.splitLine?.lineStyle?.color;
        expect(gridColor).toBe(theme.grid);
      }
    }
  });

  it('disables native animation for every template', () => {
    for (const spec of allSpecs(THEMES['dark-blue'])) {
      const option = buildOption(spec, 0.4) as unknown as { animation: boolean };
      expect(option.animation).toBe(false);
    }
  });

  it('gives every template the same title and subtitle placement', () => {
    const options = allSpecs(THEMES['dark-minimal']).map(
      (s) => buildOption(s, 1) as unknown as { title: { left: number; top: number; text: string; subtext: string } },
    );
    const first = options[0].title;
    for (const o of options) {
      expect(o.title.left).toBe(first.left);
      expect(o.title.top).toBe(first.top);
      expect(o.title.text).toBe('Comeback Rate by Gold Deficit');
      expect(o.title.subtext).toBe('A subtitle.');
    }
  });

  it('covers every registered template', () => {
    expect(allSpecs(THEMES['dark-minimal']).map((s) => s.template).sort()).toEqual([...TEMPLATE_IDS].sort());
  });
});

describe('text fitting keeps content inside the frame', () => {
  it('wraps a long title onto multiple lines', () => {
    const wrapped = wrapText('Comeback Rate by Champion Scaling in Ranked Solo Queue', 600, 58, true);
    expect(wrapped.split('\n').length).toBeGreaterThan(1);
    // Wrapping only inserts newlines; no words are lost.
    expect(wrapped.replace(/\n/g, ' ')).toBe('Comeback Rate by Champion Scaling in Ranked Solo Queue');
  });

  it('leaves a short title on one line', () => {
    expect(wrapText('Early Surrender Rate', 900, 58, true)).toBe('Early Surrender Rate');
  });

  it('shrinks category labels when they would collide, then rotates', () => {
    const roomy = fitCategoryLabels(['0-999', '1000-1999'], 400, 30);
    expect(roomy).toEqual({ fontSize: 30, rotate: 0 });

    const tight = fitCategoryLabels(['1000-1999', '2000-2999'], 120, 30);
    expect(tight.fontSize).toBeLessThan(30);

    const verySmall = fitCategoryLabels(['a-very-long-category-label'], 40, 30);
    expect(verySmall.rotate).toBe(30);
  });
});
