/** Core data + configuration contracts shared by the UI, templates, and export backend. */

import { BRAND, type DataSchemeId } from './brand.js';

export * from './brand.js';

/** A single parsed data point. Category order in an array is always significant. */
export interface DataPoint {
  category: string;
  value: number;
}

/**
 * How the numbers should be interpreted.
 * - `percent`: 0-100 scale, axis pinned to 0-100, "%" suffix on labels.
 * - `number`:  arbitrary numeric data, axis max derived from the data.
 * Templates using `number` never inherit percentage restrictions.
 */
export type ValueMode = 'percent' | 'number';

export interface Theme {
  background: string;
  /** Default data color, and the first entry of the theme's own neutral ramp. */
  primary: string;
  /** Emphasis color. Reserved for intentional highlights, never a default. */
  accent: string;
  text: string;
  /** Subtle gridline color. Kept explicit so each theme controls its own contrast. */
  grid: string;
  /** Secondary surface, above the page. Falls back to a blend of background and text. */
  surface?: string;
  /** Secondary text. Falls back to a dimmed `text`. */
  textMuted?: string;
  /**
   * The theme's own neutral data ramp, used by the default data scheme. A theme that
   * does not declare one derives a ramp from `primary`.
   */
  series?: string[];
}

export type ThemeId = 'slayrr-dark' | 'dark-minimal' | 'dark-blue' | 'light-minimal';

export const THEMES: Record<ThemeId, Theme> = {
  /**
   * SLAYRR Dark — the channel identity. Dark editorial surface, ivory ink, a restrained
   * neutral data ramp, and the signature red held back for emphasis only.
   */
  'slayrr-dark': {
    background: BRAND.obsidian,
    primary: BRAND.neutral1,
    accent: BRAND.red,
    text: BRAND.ivory,
    grid: BRAND.divider,
    surface: BRAND.carbon,
    textMuted: BRAND.ash,
    series: [BRAND.neutral1, BRAND.neutral2, BRAND.neutral3],
  },
  'dark-minimal': {
    background: '#0E1116',
    primary: '#3E7CB1',
    accent: '#E8B84B',
    text: '#F2F4F7',
    grid: '#232A34',
  },
  'dark-blue': {
    background: '#0B1A2B',
    primary: '#4FA3D1',
    accent: '#F2A65A',
    text: '#EAF2F8',
    grid: '#16304A',
  },
  'light-minimal': {
    background: '#F7F8FA',
    primary: '#2E6F9E',
    accent: '#C8892B',
    text: '#161A20',
    grid: '#DDE1E7',
  },
};

export const THEME_LABELS: Record<ThemeId, string> = {
  'slayrr-dark': 'Slayrr Dark',
  'dark-minimal': 'Dark Minimal',
  'dark-blue': 'Dark Blue',
  'light-minimal': 'Light Minimal',
};

/** The channel identity, and the theme every new chart and preset opens with. */
export const DEFAULT_THEME_ID: ThemeId = 'slayrr-dark';
export const SLAYRR_DARK: Theme = THEMES['slayrr-dark'];

/** Retained for the earlier presets and tests that name this theme directly. */
export const DARK_MINIMAL: Theme = THEMES['dark-minimal'];

export type TemplateId =
  | 'animated-bar'
  | 'animated-line'
  | 'comparison'
  | 'big-number'
  | 'donut'
  | 'stacked-bar'
  | 'area'
  | 'scatter'
  | 'heatmap';

/** Bar direction. Vertical is the default and matches the original composition. */
export type Orientation = 'vertical' | 'horizontal';

/** Whether every category animates together or one after another. */
export type Reveal = 'simultaneous' | 'sequential';

interface SpecBase {
  title: string;
  subtitle: string;
  valueMode: ValueMode;
  theme: Theme;
  /**
   * Which colours the data is painted with. Separate from the theme, so changing the
   * scheme never touches the brand surface, and changing the theme never reassigns
   * data meaning. Defaults to the theme's own neutral ramp with accent emphasis.
   */
  dataScheme?: DataSchemeId;
}

export interface BarSpec extends SpecBase {
  template: 'animated-bar';
  data: DataPoint[];
  /** Category rendered with the accent color, or null for none. */
  highlight: string | null;
  /** Defaults to 'vertical'. */
  orientation?: Orientation;
  /** Defaults to 'simultaneous'. */
  reveal?: Reveal;
}

export interface LineSpec extends SpecBase {
  template: 'animated-line';
  data: DataPoint[];
  /** Data point emphasized with the accent color, or null for none. */
  highlight: string | null;
}

export interface ComparisonSpec extends SpecBase {
  template: 'comparison';
  /** Two or three categories. */
  data: DataPoint[];
  highlight: string | null;
  /** Defaults to 'simultaneous'. */
  reveal?: Reveal;
}

export interface BigNumberSpec extends SpecBase {
  template: 'big-number';
  value: number;
  /** Decimal places in the displayed value. */
  decimals: number;
  prefix: string;
  suffix: string;
  /** Group the integer part with thousands separators. */
  separators: boolean;
}

/** Whether a donut shows its raw values or the proportions derived from them. */
export type DonutDisplay = 'percent' | 'value';

export interface DonutSpec extends SpecBase {
  template: 'donut';
  /** Parts of one whole, in source order. */
  data: DataPoint[];
  highlight: string | null;
  /** Inner radius as a percentage of the outer radius, 0-90. */
  innerRadius: number;
  display: DonutDisplay;
  /** Shows the animated total in the middle of the ring. */
  showTotal: boolean;
  /** Caption under the centre read-out, or under nothing when the total is hidden. */
  centerLabel: string;
}

/** Raw stacked values, or each category normalized to 100%. */
export type StackMode = 'regular' | 'percent';

export interface StackedBarSpec extends SpecBase {
  template: 'stacked-bar';
  categories: string[];
  /** Series in source order; colors follow this order so a series keeps its color. */
  series: Array<{ name: string; values: number[] }>;
  stackMode: StackMode;
  orientation?: Orientation;
  reveal?: Reveal;
  /** A category name or a series name; either can be emphasized. */
  highlight: string | null;
}

export interface AreaSpec extends SpecBase {
  template: 'area';
  data: DataPoint[];
  highlight: string | null;
  /** Fill opacity under the line, 0-1. */
  areaOpacity: number;
  showPoints: boolean;
}

export interface ScatterSpec extends SpecBase {
  template: 'scatter';
  points: Array<{ x: number; y: number; label: string }>;
  xTitle: string;
  yTitle: string;
  symbolSize: number;
  reveal?: Reveal;
  /** Matched against a point's label. */
  highlight: string | null;
}

/** Cells appear all at once, or one row of the Y axis at a time. */
export type HeatmapReveal = 'simultaneous' | 'row';

export interface HeatmapSpec extends SpecBase {
  template: 'heatmap';
  xCategories: string[];
  yCategories: string[];
  cells: Array<{ x: string; y: string; value: number }>;
  heatReveal?: HeatmapReveal;
  /** Emphasized cell, as its x and y joined by the cell-key separator, or null. */
  highlight: string | null;
}

/** Everything a template needs to draw a frame. Templates never hardcode a dataset. */
export type ChartSpec =
  | BarSpec
  | LineSpec
  | ComparisonSpec
  | BigNumberSpec
  | DonutSpec
  | StackedBarSpec
  | AreaSpec
  | ScatterSpec
  | HeatmapSpec;

/** Specs that carry a simple category/value dataset. */
export type DataChartSpec = BarSpec | LineSpec | ComparisonSpec | DonutSpec | AreaSpec;

export type Easing = 'linear' | 'ease-out';

export interface AnimationSpec {
  /** Seconds of animation, before the hold. */
  durationSeconds: number;
  /** Seconds the completed chart is held at the end. Clamped to >= 1 frame. */
  holdSeconds: number;
  easing: Easing;
  fps: number;
}

export interface ExportRequest {
  chart: ChartSpec;
  animation: AnimationSpec;
  composition: Composition;
  format: ExportFormat;
  filename: string;
  width: number;
  height: number;
}

export type JobStatus = 'queued' | 'rendering' | 'encoding' | 'done' | 'error';

export interface JobState {
  id: string;
  status: JobStatus;
  /** Frames captured so far. */
  framesDone: number;
  /** Frames this job will capture, which is 1 for a single-PNG export. */
  totalFrames: number;
  /** Frames in the animation timeline, regardless of how many are captured. */
  timelineFrames: number;
  format: ExportFormat;
  message: string;
  /** Final name inside outputs/ — a file, or a directory for a PNG sequence. */
  filename?: string;
  error?: string;
}

/* ---------------------------------------------------------------------------
 * Composition — how the chart is framed and what is drawn around it.
 *
 * Deliberately separate from ChartSpec: composition settings survive a change of
 * template or dataset, and the same settings apply to all four templates.
 * ------------------------------------------------------------------------- */

export type BackgroundMode = 'solid' | 'image' | 'transparent';
export type ImageFit = 'cover' | 'contain';

export interface BackgroundSpec {
  mode: BackgroundMode;
  /** Id of an image uploaded to the local backend; only used when mode is 'image'. */
  imageId: string | null;
  fit: ImageFit;
}

/** Independently toggleable composition elements. */
export interface VisibilitySpec {
  title: boolean;
  subtitle: boolean;
  /** Category and value tick labels. */
  axisLabels: boolean;
  /** Axis lines themselves. */
  axes: boolean;
  gridlines: boolean;
  legend: boolean;
  /** The per-datum read-outs drawn on the bars/points. */
  valueLabels: boolean;
}

export interface Composition {
  background: BackgroundSpec;
  show: VisibilitySpec;
  /**
   * The small red rule above the title. Optional, never inside the plot area, and
   * absent whenever the titling is hidden. Defaults to on.
   */
  motif?: boolean;
}

export const ALL_VISIBLE: VisibilitySpec = {
  title: true,
  subtitle: true,
  axisLabels: true,
  axes: true,
  gridlines: true,
  legend: true,
  valueLabels: true,
};

/**
 * Chart Only: drops the titling and the decoration, keeps the data visualization
 * itself — axes, tick labels and value read-outs all stay.
 */
export const CHART_ONLY: VisibilitySpec = {
  title: false,
  subtitle: false,
  axisLabels: true,
  axes: true,
  gridlines: false,
  legend: false,
  valueLabels: true,
};

export const DEFAULT_COMPOSITION: Composition = {
  background: { mode: 'solid', imageId: null, fit: 'cover' },
  show: ALL_VISIBLE,
  motif: true,
};

/**
 * SLAYRR motion: deliberate and controlled, with no bounce, overshoot or elastic
 * settle. At 30 fps these defaults produce round(1.8 × 30) = 54 animation frames plus
 * max(1, round(1.0 × 30)) = 30 hold frames — 84 frames, a 2.800 s clip.
 */
export const DEFAULT_ANIMATION: AnimationSpec = {
  durationSeconds: 1.8,
  holdSeconds: 1.0,
  easing: 'ease-out',
  fps: 30,
};

/** MP4 stays H.264/yuv420p; the PNG formats are the transparency-capable ones. */
export type ExportFormat = 'mp4' | 'png' | 'png-sequence';

export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  mp4: 'MP4 video (H.264, opaque)',
  png: 'PNG — final frame',
  'png-sequence': 'PNG sequence — every frame',
};

/** Formats that can carry an alpha channel. */
export const TRANSPARENCY_CAPABLE: ExportFormat[] = ['png', 'png-sequence'];

export function supportsTransparency(format: ExportFormat): boolean {
  return TRANSPARENCY_CAPABLE.includes(format);
}

export const TRANSPARENT_MP4_MESSAGE =
  'MP4 is encoded as H.264 with yuv420p, which has no alpha channel, so a transparent ' +
  'composition cannot be exported as MP4. Choose PNG or PNG sequence to keep transparency, ' +
  'or switch the background to a solid color or an image.';
