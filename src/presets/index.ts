import type {
  DataSchemeId,
  DonutDisplay,
  HeatmapReveal,
  Orientation,
  Reveal,
  StackMode,
  TemplateId,
  ValueMode,
} from '../shared/types.js';
import { COMEBACK_CURVE_CSV } from './comebackCurve.js';
import { SCALING_COMPARISON_CSV, SCALING_COMPARISON_0_3K_CSV } from './scalingComparison.js';
import { BIG_NUMBER_VARIANTS, type BigNumberVariant } from './bigNumbers.js';
import {
  DONUT_EXAMPLE_CSV,
  HEATMAP_EXAMPLE_CSV,
  ILLUSTRATIVE,
  SCATTER_EXAMPLE_CSV,
  STACKED_EXAMPLE_CSV,
} from './examples.js';

/**
 * Presets carry data and copy only. Templates stay completely generic — nothing here
 * is referenced from a template, and loading a preset only populates editor fields.
 */
export interface Preset {
  id: string;
  name: string;
  /** Template selected when the preset is loaded. */
  template: TemplateId;
  title: string;
  subtitle: string;
  valueMode: ValueMode;
  filename: string;
  csv?: string;
  highlight?: string | null;
  /** Data colours. Omitted means the theme's own neutral ramp with accent emphasis. */
  dataScheme?: DataSchemeId;
  orientation?: Orientation;
  reveal?: Reveal;
  /** Individually selectable Big Number variants. */
  variants?: BigNumberVariant[];
  /* Template-specific options a preset may set. */
  innerRadius?: number;
  donutDisplay?: DonutDisplay;
  showTotal?: boolean;
  centerLabel?: string;
  stackMode?: StackMode;
  areaOpacity?: number;
  showPoints?: boolean;
  xTitle?: string;
  yTitle?: string;
  symbolSize?: number;
  heatReveal?: HeatmapReveal;
}

export const PRESETS: Preset[] = [
  {
    id: 'comeback-curve',
    name: 'Comeback Curve',
    template: 'animated-bar',
    title: 'Comeback Rate by Gold Deficit',
    subtitle: 'Observed comeback rates among games continuing past 20 minutes.',
    valueMode: 'percent',
    csv: COMEBACK_CURVE_CSV,
    highlight: '6000+',
    orientation: 'vertical',
    reveal: 'simultaneous',
    filename: 'comeback-curve',
  },
  {
    id: 'comeback-curve-gold',
    name: 'Comeback Curve — Gold',
    template: 'animated-bar',
    title: 'Comeback Rate by Gold Deficit',
    subtitle: 'Observed comeback rates among games continuing past 20 minutes.',
    valueMode: 'percent',
    csv: COMEBACK_CURVE_CSV,
    highlight: '6000+',
    orientation: 'vertical',
    reveal: 'simultaneous',
    // The categories are gold-deficit buckets, so the gold scheme is a deliberate
    // semantic mapping made here by the preset — never inferred from the word "gold".
    dataScheme: 'gold',
    filename: 'comeback-curve-gold',
  },
  {
    id: 'comeback-curve-line',
    name: 'Comeback Curve — Line',
    template: 'animated-line',
    title: 'Comeback Rate by Gold Deficit',
    subtitle: 'Observed comeback rates among games continuing past 20 minutes.',
    valueMode: 'percent',
    csv: COMEBACK_CURVE_CSV,
    highlight: '6000+',
    filename: 'comeback-curve-line',
  },
  {
    id: 'comeback-curve-area',
    name: 'Comeback Curve — Area',
    template: 'area',
    title: 'Comeback Rate by Gold Deficit',
    subtitle: 'Observed comeback rates among games continuing past 20 minutes.',
    valueMode: 'percent',
    csv: COMEBACK_CURVE_CSV,
    highlight: '6000+',
    areaOpacity: 0.28,
    showPoints: true,
    filename: 'comeback-curve-area',
  },
  {
    id: 'scaling-comparison',
    name: 'Scaling Comparison',
    template: 'comparison',
    title: 'Comeback Rate by Champion Scaling',
    subtitle: '',
    valueMode: 'percent',
    csv: SCALING_COMPARISON_CSV,
    highlight: null,
    reveal: 'simultaneous',
    filename: 'scaling-comparison',
  },
  {
    id: 'scaling-comparison-0-3k',
    name: 'Scaling Comparison — 0–3k',
    template: 'comparison',
    title: 'Comeback Rate by Champion Scaling',
    subtitle: '0–3,000 gold deficit',
    valueMode: 'percent',
    csv: SCALING_COMPARISON_0_3K_CSV,
    highlight: null,
    reveal: 'simultaneous',
    filename: 'scaling-comparison-0-3k',
  },
  {
    id: 'big-numbers',
    name: 'Big Numbers',
    template: 'big-number',
    title: BIG_NUMBER_VARIANTS[0].title,
    subtitle: '',
    valueMode: 'number',
    variants: BIG_NUMBER_VARIANTS,
    filename: 'big-number',
  },
  {
    id: 'donut-example',
    name: 'Donut — Example Split',
    template: 'donut',
    title: 'Example Share of Total',
    subtitle: ILLUSTRATIVE,
    valueMode: 'percent',
    csv: DONUT_EXAMPLE_CSV,
    highlight: null,
    innerRadius: 58,
    donutDisplay: 'percent',
    dataScheme: 'categorical',
    showTotal: false,
    centerLabel: '',
    filename: 'donut-example',
  },
  {
    id: 'stacked-example',
    name: 'Stacked Bar — Example Groups',
    template: 'stacked-bar',
    title: 'Example Composition by Group',
    subtitle: ILLUSTRATIVE,
    valueMode: 'number',
    csv: STACKED_EXAMPLE_CSV,
    highlight: null,
    orientation: 'vertical',
    reveal: 'simultaneous',
    stackMode: 'regular',
    dataScheme: 'categorical',
    filename: 'stacked-example',
  },
  {
    id: 'scatter-example',
    name: 'Scatter — Example Pairs',
    template: 'scatter',
    title: 'Example Relationship',
    subtitle: ILLUSTRATIVE,
    valueMode: 'number',
    csv: SCATTER_EXAMPLE_CSV,
    highlight: null,
    xTitle: 'X value',
    yTitle: 'Y value',
    symbolSize: 34,
    reveal: 'sequential',
    filename: 'scatter-example',
  },
  {
    id: 'heatmap-example',
    name: 'Heatmap — Example Grid',
    template: 'heatmap',
    title: 'Example Grid',
    subtitle: ILLUSTRATIVE,
    valueMode: 'percent',
    csv: HEATMAP_EXAMPLE_CSV,
    highlight: null,
    heatReveal: 'row',
    filename: 'heatmap-example',
  },
];

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/** The first preset that uses a given template, used when the gallery selects one. */
export function presetForTemplate(template: TemplateId): Preset | undefined {
  return PRESETS.find((p) => p.template === template);
}

export {
  COMEBACK_CURVE_CSV,
  SCALING_COMPARISON_CSV,
  SCALING_COMPARISON_0_3K_CSV,
  BIG_NUMBER_VARIANTS,
  DONUT_EXAMPLE_CSV,
  STACKED_EXAMPLE_CSV,
  SCATTER_EXAMPLE_CSV,
  HEATMAP_EXAMPLE_CSV,
  ILLUSTRATIVE,
};
export type { BigNumberVariant };
