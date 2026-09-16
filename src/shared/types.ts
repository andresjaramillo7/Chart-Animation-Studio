/** Core data + configuration contracts shared by the UI, templates, and export backend. */

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
  primary: string;
  accent: string;
  text: string;
  /** Subtle gridline color. Kept explicit so each theme controls its own contrast. */
  grid: string;
}

export type ThemeId = 'dark-minimal' | 'dark-blue' | 'light-minimal';

export const THEMES: Record<ThemeId, Theme> = {
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
  'dark-minimal': 'Dark Minimal',
  'dark-blue': 'Dark Blue',
  'light-minimal': 'Light Minimal',
};

/** The default theme. */
export const DARK_MINIMAL: Theme = THEMES['dark-minimal'];

export type TemplateId = 'animated-bar' | 'animated-line' | 'comparison' | 'big-number';

/** Bar direction. Vertical is the default and matches the original composition. */
export type Orientation = 'vertical' | 'horizontal';

/** Whether every category animates together or one after another. */
export type Reveal = 'simultaneous' | 'sequential';

interface SpecBase {
  title: string;
  subtitle: string;
  valueMode: ValueMode;
  theme: Theme;
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

/** Everything a template needs to draw a frame. Templates never hardcode a dataset. */
export type ChartSpec = BarSpec | LineSpec | ComparisonSpec | BigNumberSpec;

/** Specs that carry a category/value dataset. */
export type DataChartSpec = BarSpec | LineSpec | ComparisonSpec;

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
  totalFrames: number;
  message: string;
  filename?: string;
  error?: string;
}
