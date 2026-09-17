import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  BRAND,
  DATA_SCHEMES,
  DATA_SCHEME_IDS,
  DEFAULT_ANIMATION,
  DEFAULT_COMPOSITION,
  DEFAULT_DATA_SCHEME,
  DEFAULT_THEME_ID,
  SLAYRR_DARK,
  THEMES,
  THEME_LABELS,
  type ChartSpec,
  type Composition,
  type DataSchemeId,
  type Theme,
} from '../src/shared/types.js';
import { dataColors, mutedText, specColors } from '../src/shared/palette.js';
import { buildTimeline } from '../src/shared/timeline.js';
import { buildOption, TEMPLATE_IDS } from '../src/templates/index.js';
import { FONT_STACK, MONO_STACK, REQUIRED_FACES, LANDSCAPE, PORTRAIT, getLayout } from '../src/shared/layout.js';
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

/* ------------------------------------------------------------------ tokens ---- */

describe('brand tokens', () => {
  it('carries the exact published palette', () => {
    expect(BRAND.obsidian).toBe('#0D0F14');
    expect(BRAND.carbon).toBe('#171A22');
    expect(BRAND.ivory).toBe('#F2F3F5');
    expect(BRAND.ash).toBe('#A8AFBC');
    expect(BRAND.divider).toBe('#272D38');
    expect(BRAND.red).toBe('#D7263D');
    expect(BRAND.neutral1).toBe('#7C8595');
    expect(BRAND.neutral2).toBe('#5D6675');
    expect(BRAND.neutral3).toBe('#3F4653');
    expect(BRAND.gold).toBe('#C6A45D');
    expect(BRAND.emerald).toBe('#4DAA91');
    expect(BRAND.steel).toBe('#669BC7');
  });

  it('builds Slayrr Dark from those tokens and nothing else', () => {
    expect(SLAYRR_DARK).toEqual({
      background: BRAND.obsidian,
      primary: BRAND.neutral1,
      accent: BRAND.red,
      text: BRAND.ivory,
      grid: BRAND.divider,
      surface: BRAND.carbon,
      textMuted: BRAND.ash,
      series: [BRAND.neutral1, BRAND.neutral2, BRAND.neutral3],
    });
  });
});

/* ----------------------------------------------------------------- default ---- */

describe('Slayrr Dark is the default identity', () => {
  it('is the declared default theme and is listed first', () => {
    expect(DEFAULT_THEME_ID).toBe('slayrr-dark');
    expect(Object.keys(THEMES)[0]).toBe('slayrr-dark');
    expect(THEME_LABELS['slayrr-dark']).toBe('Slayrr Dark');
  });

  it('keeps the earlier themes available', () => {
    for (const id of ['dark-minimal', 'dark-blue', 'light-minimal'] as const) {
      expect(THEMES[id]).toBeDefined();
    }
  });

  it('opens the editor on Slayrr Dark and the neutral scheme', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'src/ui/main.ts'), 'utf8');
    expect(html).toContain('applyTheme(DEFAULT_THEME_ID)');
    expect(html).toContain('els.dataScheme.value = DEFAULT_DATA_SCHEME');
  });

  it('does not paint an ordinary chart red', () => {
    const colors = dataColors(SLAYRR_DARK, undefined, 3);
    expect(colors.series).toEqual([BRAND.neutral1, BRAND.neutral2, BRAND.neutral3]);
    expect(colors.series).not.toContain(BRAND.red);
    // Red is available, but only as emphasis.
    expect(colors.highlight).toBe(BRAND.red);
  });
});

/* ----------------------------------------------------------------- schemes ---- */

describe('data color schemes', () => {
  it('offers exactly the four documented schemes', () => {
    expect(DATA_SCHEME_IDS).toEqual(['neutral-red', 'gold', 'diverging', 'categorical']);
    expect(DEFAULT_DATA_SCHEME).toBe('neutral-red');
  });

  it('uses gold as the data accent in the gold scheme', () => {
    expect(dataColors(SLAYRR_DARK, 'gold', 2).series[0]).toBe(BRAND.gold);
  });

  it('maps diverging colours positionally, never by category name', () => {
    const colors = dataColors(SLAYRR_DARK, 'diverging', 3);
    expect(colors.series).toEqual([BRAND.red, BRAND.neutral1, BRAND.emerald]);
    // The scheme is a fixed list; nothing inspects the data to pick a direction.
    expect(dataColors(SLAYRR_DARK, 'diverging', 3).series).toEqual(colors.series);
  });

  it('prioritises distinguishability in the categorical scheme', () => {
    const colors = dataColors(SLAYRR_DARK, 'categorical', 6);
    expect(new Set(colors.series).size).toBe(6);
    expect(colors.series[0]).toBe(BRAND.steel);
  });

  it('never repeats a colour when more series are asked for', () => {
    const colors = dataColors(SLAYRR_DARK, 'categorical', 12);
    expect(new Set(colors.series).size).toBe(12);
  });

  it('keeps a series on the same colour as the dataset grows', () => {
    const three = dataColors(SLAYRR_DARK, 'categorical', 3).series;
    const six = dataColors(SLAYRR_DARK, 'categorical', 6).series;
    expect(six.slice(0, 3)).toEqual(three);
  });

  it('is deterministic — the same inputs always give the same colours', () => {
    for (const id of DATA_SCHEME_IDS) {
      expect(dataColors(SLAYRR_DARK, id, 5)).toEqual(dataColors(SLAYRR_DARK, id, 5));
    }
  });

  it('gives every scheme a single-direction sequential ramp', () => {
    for (const id of DATA_SCHEME_IDS) {
      expect(DATA_SCHEMES[id].sequential.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('theme and scheme are independent', () => {
  it('changing the scheme leaves the brand surface untouched', () => {
    const surfaces = DATA_SCHEME_IDS.map((id) => {
      const spec = barSpec({ dataScheme: id });
      const option = buildOption(spec, 1) as unknown as { backgroundColor: string };
      return option.backgroundColor;
    });
    expect(new Set(surfaces).size).toBe(1);
    expect(surfaces[0]).toBe(BRAND.obsidian);
  });

  it('changing the scheme leaves the data untouched', () => {
    const values = (id: DataSchemeId) =>
      (buildOption(barSpec({ dataScheme: id }), 1) as unknown as {
        series: Array<{ data: Array<{ value: number }> }>;
      }).series[0].data.map((d) => d.value);
    const first = values('neutral-red');
    for (const id of DATA_SCHEME_IDS) expect(values(id)).toEqual(first);
    expect(first).toEqual([45.4, 37.4, 30.5, 21.1, 16.3, 12.4, 6.6]);
  });

  it('changing the theme restyles the data without changing the scheme', () => {
    const slayrr = dataColors(THEMES['slayrr-dark'], 'neutral-red', 1).series[0];
    const light = dataColors(THEMES['light-minimal'], 'neutral-red', 1).series[0];
    expect(slayrr).not.toBe(light);
    // A semantic scheme carries its own colours, whatever the theme.
    expect(dataColors(THEMES['light-minimal'], 'gold', 1).series[0]).toBe(BRAND.gold);
  });

  it('lets a manual primary colour win while keeping the rest of the ramp', () => {
    const custom: Theme = { ...SLAYRR_DARK, primary: '#112233', series: ['#112233', BRAND.neutral2, BRAND.neutral3] };
    expect(dataColors(custom, undefined, 3).series).toEqual(['#112233', BRAND.neutral2, BRAND.neutral3]);
  });
});

/* --------------------------------------------------------------- red usage ---- */

describe('red is reserved for emphasis', () => {
  it('paints an unhighlighted bar chart with no red at all', () => {
    const option = buildOption(barSpec({ highlight: null }), 1) as unknown as {
      series: Array<{ data: Array<{ itemStyle: { color: string } }> }>;
    };
    const colors = option.series[0].data.map((d) => d.itemStyle.color);
    expect(colors.every((c) => c !== BRAND.red)).toBe(true);
  });

  it('paints exactly the highlighted category red', () => {
    const option = buildOption(barSpec({ highlight: '6000+' }), 1) as unknown as {
      series: Array<{ data: Array<{ itemStyle: { color: string } }> }>;
    };
    const colors = option.series[0].data.map((d) => d.itemStyle.color);
    expect(colors.filter((c) => c === BRAND.red)).toHaveLength(1);
    expect(colors[colors.length - 1]).toBe(BRAND.red);
  });

  it('never makes the gridlines or the axis red', () => {
    const option = buildOption(barSpec(), 1) as unknown as {
      xAxis: { axisLine: { lineStyle: { color: string } } };
      yAxis: { splitLine: { lineStyle: { color: string } } };
    };
    expect(option.yAxis.splitLine.lineStyle.color).toBe(BRAND.divider);
    expect(option.xAxis.axisLine.lineStyle.color).toBe(BRAND.divider);
  });

  it('keeps the Big Number figure in ivory, not red', () => {
    const option = buildOption(bigNumberSpec(), 1) as unknown as {
      graphic: Array<{ type: string; style?: { text?: string; fill?: string } }>;
    };
    const value = option.graphic.find((g) => g.type === 'text' && g.style?.text === '11,149');
    expect(value?.style?.fill).toBe(BRAND.ivory);
  });
});

/* ------------------------------------------------------------- brand motif ---- */

describe('brand motif', () => {
  const motifOf = (composition: Composition) =>
    (buildOption(barSpec(), 1, LANDSCAPE, composition) as unknown as {
      graphic: Array<{ type: string; shape?: { width: number; height: number }; style?: { fill: string } }>;
    }).graphic;

  it('is on by default, and is a short thin rule in the accent colour', () => {
    expect(DEFAULT_COMPOSITION.motif).toBe(true);
    const graphic = motifOf(DEFAULT_COMPOSITION);
    expect(graphic).toHaveLength(1);
    expect(graphic[0].style?.fill).toBe(BRAND.red);
    const layout = getLayout(LANDSCAPE);
    expect(graphic[0].shape).toEqual({ width: layout.motifLength, height: layout.accentWidth, r: layout.accentWidth / 2 });
    // Short and thin: a rule, not a band.
    expect(graphic[0].shape!.height).toBeLessThan(graphic[0].shape!.width / 8);
  });

  it('can be switched off without touching anything else', () => {
    const off = { ...DEFAULT_COMPOSITION, motif: false };
    expect(motifOf(off)).toEqual([]);
    const values = (c: Composition) =>
      (buildOption(barSpec(), 1, LANDSCAPE, c) as unknown as {
        series: Array<{ data: Array<{ value: number }> }>;
      }).series[0].data.map((d) => d.value);
    expect(values(off)).toEqual(values(DEFAULT_COMPOSITION));
  });

  it('disappears with the titling, so Chart Only stays clean', () => {
    const chartOnly: Composition = {
      ...DEFAULT_COMPOSITION,
      show: { ...DEFAULT_COMPOSITION.show, title: false, subtitle: false },
    };
    expect(motifOf(chartOnly)).toEqual([]);
  });

  it('sits above the title and never inside the plot area', () => {
    const option = buildOption(barSpec(), 1) as unknown as {
      graphic: Array<{ top: number; left: number }>;
      grid: { top: number };
      title: { top: number; left: number };
    };
    const layout = getLayout(LANDSCAPE);
    expect(option.graphic[0].top).toBe(layout.titleTop);
    expect(option.graphic[0].top).toBeLessThan(option.title.top);
    expect(option.graphic[0].top).toBeLessThan(option.grid.top);
    // Aligned to the same left margin as the title.
    expect(option.graphic[0].left).toBe(option.title.left);
  });
});

/* ----------------------------------------------------------------- motion ---- */

describe('motion defaults', () => {
  it('uses 1.8 s, a 1.0 s hold and ease-out', () => {
    expect(DEFAULT_ANIMATION).toEqual({
      durationSeconds: 1.8,
      holdSeconds: 1.0,
      easing: 'ease-out',
      fps: 30,
    });
  });

  it('produces exactly 84 frames and a 2.800 s clip', () => {
    const t = buildTimeline(DEFAULT_ANIMATION);
    expect(t.animationFrames).toBe(54);
    expect(t.holdFrames).toBe(30);
    expect(t.totalFrames).toBe(84);
    expect(t.durationSeconds).toBeCloseTo(2.8, 6);
  });

  it('is the editor starting point', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain('id="duration" type="number" min="0.1" max="60" step="0.1" value="1.8"');
    expect(html).toContain('id="hold" type="number" min="0" max="60" step="0.1" value="1.0"');
  });
});

/* ------------------------------------------------------------------ fonts ---- */

describe('typography', () => {
  it('puts Inter first and IBM Plex Mono in the technical stack', () => {
    expect(FONT_STACK.startsWith('Inter')).toBe(true);
    expect(MONO_STACK.startsWith('"IBM Plex Mono"')).toBe(true);
  });

  it('bundles the faces locally, with no font CDN anywhere in src', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src/shared/fonts.css'), 'utf8');
    expect(css).toContain('@fontsource/inter/400.css');
    expect(css).toContain('@fontsource/inter/700.css');
    expect(css).toContain('@fontsource/ibm-plex-mono/400.css');

    for (const file of ['src/shared/fonts.css', 'index.html', 'render.html']) {
      const text = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(text, file).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\./);
    }
  });

  it('ships the actual font binaries', () => {
    for (const file of [
      'node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2',
      'node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2',
      'node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2',
    ]) {
      expect(fs.existsSync(path.join(process.cwd(), file)), file).toBe(true);
    }
  });

  it('records the font licenses', () => {
    const notices = fs.readFileSync(path.join(process.cwd(), 'THIRD-PARTY-LICENSES.md'), 'utf8');
    expect(notices).toMatch(/SIL Open Font License/);
    expect(notices).toMatch(/Inter/);
    expect(notices).toMatch(/IBM Plex Mono/);
  });

  it('makes both entry points load the same file, and blocks a silent fallback', () => {
    const render = fs.readFileSync(path.join(process.cwd(), 'src/render/main.ts'), 'utf8');
    const editor = fs.readFileSync(path.join(process.cwd(), 'src/ui/main.ts'), 'utf8');
    expect(render).toContain("import '../shared/fonts.css'");
    expect(editor).toContain("import '../shared/fonts.css'");
    // The renderer refuses to capture frames in a system font.
    expect(render).toContain('Brand fonts did not load');
    expect(REQUIRED_FACES.length).toBeGreaterThanOrEqual(3);
  });
});

/* ------------------------------------------------------- system coherence ---- */

describe('all nine templates share one system', () => {
  const specs = allSpecs();

  it('still registers every template', () => {
    expect(specs.map((s) => s.template).sort()).toEqual([...TEMPLATE_IDS].sort());
    expect(TEMPLATE_IDS).toHaveLength(9);
  });

  it('paints every one on the brand surface with brand ink', () => {
    for (const spec of specs) {
      const option = buildOption(spec, 1) as unknown as {
        backgroundColor: string;
        textStyle: { fontFamily: string };
        title: { textStyle: { color: string }; subtextStyle: { color: string } };
      };
      expect(option.backgroundColor, spec.template).toBe(BRAND.obsidian);
      expect(option.textStyle.fontFamily, spec.template).toBe(FONT_STACK);
      expect(option.title.textStyle.color, spec.template).toBe(BRAND.ivory);
      expect(option.title.subtextStyle.color, spec.template).toBe(BRAND.ash);
    }
  });

  it('gives every one the same title placement and the same motif', () => {
    const options = specs.map(
      (s) =>
        buildOption(s, 1) as unknown as {
          title: { left: number; top: number };
          graphic: Array<{ style?: { fill: string } }>;
        },
    );
    const layout = getLayout(LANDSCAPE);
    for (const o of options) {
      expect(o.title.left).toBe(layout.pad);
      expect(o.graphic[0].style?.fill).toBe(BRAND.red);
    }
  });

  it('keeps every one transparent-capable with no opaque panel', () => {
    const transparent: Composition = {
      ...DEFAULT_COMPOSITION,
      background: { mode: 'transparent', imageId: null, fit: 'cover' },
    };
    for (const spec of specs) {
      const option = buildOption(spec, 1, LANDSCAPE, transparent) as unknown as { backgroundColor: string };
      expect(option.backgroundColor, spec.template).toBe('transparent');
    }
  });

  it('composes in portrait as well as landscape', () => {
    for (const spec of specs) {
      for (const canvas of [LANDSCAPE, PORTRAIT]) {
        const option = buildOption(spec, 1, canvas) as unknown as { title: { left: number } };
        expect(option.title.left, `${spec.template} ${canvas.width}`).toBe(getLayout(canvas).pad);
      }
    }
  });

  it('respects the selected data scheme in every template that draws data', () => {
    for (const spec of specs) {
      if (spec.template === 'big-number') continue;
      const gold = specColors({ ...spec, dataScheme: 'gold' } as ChartSpec, 1);
      expect(gold.series[0], spec.template).toBe(BRAND.gold);
    }
  });

  it('uses the secondary text token for muted copy', () => {
    expect(mutedText(SLAYRR_DARK)).toBe(BRAND.ash);
  });
});

/* ------------------------------------------------------------------ setup ---- */

function comebackData() {
  const parsed = parseCsv(COMEBACK_CURVE_CSV, 'percent');
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.data;
}

function barSpec(over: Record<string, unknown> = {}): ChartSpec {
  return {
    template: 'animated-bar',
    title: 'Comeback Rate by Gold Deficit',
    subtitle: 'Observed comeback rates among games continuing past 20 minutes.',
    valueMode: 'percent',
    theme: SLAYRR_DARK,
    data: comebackData(),
    highlight: '6000+',
    ...over,
  } as ChartSpec;
}

function bigNumberSpec(): ChartSpec {
  return {
    template: 'big-number',
    title: 'Ranked Games Analyzed',
    subtitle: '',
    valueMode: 'number',
    theme: SLAYRR_DARK,
    value: 11149,
    decimals: 0,
    prefix: '',
    suffix: '',
    separators: true,
  };
}

function allSpecs(): ChartSpec[] {
  const base = { title: 'Comeback Rate by Gold Deficit', subtitle: 'A subtitle.', theme: SLAYRR_DARK } as const;
  const stack = parseSeriesCsv(STACKED_EXAMPLE_CSV, 'number');
  const scatter = parseScatterCsv(SCATTER_EXAMPLE_CSV);
  const heat = parseHeatmapCsv(HEATMAP_EXAMPLE_CSV, 'percent');
  const donut = parseCsv(DONUT_EXAMPLE_CSV, 'percent');
  const scaling = parseCsv(SCALING_COMPARISON_CSV, 'percent');
  if (!stack.ok || !scatter.ok || !heat.ok || !donut.ok || !scaling.ok) throw new Error('fixture failed to parse');

  return [
    barSpec(),
    { ...base, template: 'animated-line', valueMode: 'percent', data: comebackData(), highlight: null },
    { ...base, template: 'comparison', valueMode: 'percent', data: scaling.data, highlight: null },
    {
      ...base,
      template: 'donut',
      valueMode: 'percent',
      data: donut.data,
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
      categories: stack.table.categories,
      series: stack.table.series,
      stackMode: 'regular',
      highlight: null,
    },
    {
      ...base,
      template: 'area',
      valueMode: 'percent',
      data: comebackData(),
      highlight: null,
      areaOpacity: 0.28,
      showPoints: true,
    },
    {
      ...base,
      template: 'scatter',
      valueMode: 'number',
      points: scatter.table.points,
      xTitle: 'X',
      yTitle: 'Y',
      symbolSize: 34,
      highlight: null,
    },
    {
      ...base,
      template: 'heatmap',
      valueMode: 'percent',
      xCategories: heat.table.xCategories,
      yCategories: heat.table.yCategories,
      cells: heat.table.cells,
      highlight: null,
    },
    bigNumberSpec(),
  ];
}
