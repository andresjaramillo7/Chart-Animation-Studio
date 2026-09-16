import type { Orientation, Reveal, TemplateId, ValueMode } from '../shared/types.js';
import { COMEBACK_CURVE_CSV } from './comebackCurve.js';
import { SCALING_COMPARISON_CSV, SCALING_COMPARISON_0_3K_CSV } from './scalingComparison.js';
import { BIG_NUMBER_VARIANTS, type BigNumberVariant } from './bigNumbers.js';

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
  orientation?: Orientation;
  reveal?: Reveal;
  /** Individually selectable Big Number variants. */
  variants?: BigNumberVariant[];
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
];

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

export { COMEBACK_CURVE_CSV, SCALING_COMPARISON_CSV, SCALING_COMPARISON_0_3K_CSV, BIG_NUMBER_VARIANTS };
export type { BigNumberVariant };
