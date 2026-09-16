import type { EChartsOption } from 'echarts';
import {
  DEFAULT_COMPOSITION,
  type ChartSpec,
  type Composition,
  type TemplateId,
  type VisibilitySpec,
} from '../shared/types.js';
import { LANDSCAPE, type Canvas } from '../shared/layout.js';
import { buildAnimatedBarOption } from './animatedBar.js';
import { buildAnimatedLineOption } from './animatedLine.js';
import {
  buildComparisonOption,
  COMPARISON_MAX_CATEGORIES,
  COMPARISON_MIN_CATEGORIES,
} from './comparison.js';
import { buildBigNumberOption } from './bigNumber.js';

export interface TemplateMeta {
  label: string;
  /** Whether the template is driven by a category/value dataset. */
  needsData: boolean;
  minCategories: number;
  maxCategories: number;
  supportsOrientation: boolean;
  supportsReveal: boolean;
  supportsHighlight: boolean;
  /**
   * Which composition elements this template actually draws. The editor only shows a
   * visibility control when the selected template supports it.
   */
  visibility: VisibilitySpec;
}

const PLOTTED_VISIBILITY: VisibilitySpec = {
  title: true,
  subtitle: true,
  axisLabels: true,
  axes: true,
  gridlines: true,
  // None of the four templates draws more than one series, so no legend applies yet.
  legend: false,
  valueLabels: true,
};

/** Drives both the editor's field visibility and the backend's request validation. */
export const TEMPLATE_META: Record<TemplateId, TemplateMeta> = {
  'animated-bar': {
    label: 'Animated Bar',
    needsData: true,
    minCategories: 1,
    maxCategories: 40,
    supportsOrientation: true,
    supportsReveal: true,
    supportsHighlight: true,
    visibility: PLOTTED_VISIBILITY,
  },
  'animated-line': {
    label: 'Animated Line',
    needsData: true,
    minCategories: 2,
    maxCategories: 60,
    supportsOrientation: false,
    supportsReveal: false,
    supportsHighlight: true,
    visibility: PLOTTED_VISIBILITY,
  },
  comparison: {
    label: 'Comparison Chart',
    needsData: true,
    minCategories: COMPARISON_MIN_CATEGORIES,
    maxCategories: COMPARISON_MAX_CATEGORIES,
    supportsOrientation: false,
    supportsReveal: true,
    supportsHighlight: true,
    visibility: PLOTTED_VISIBILITY,
  },
  'big-number': {
    label: 'Big Number',
    needsData: false,
    minCategories: 0,
    maxCategories: 0,
    supportsOrientation: false,
    supportsReveal: false,
    supportsHighlight: false,
    // The number is the visualization; it has no axes, gridlines or separate read-out.
    visibility: {
      title: true,
      subtitle: true,
      axisLabels: false,
      axes: false,
      gridlines: false,
      legend: false,
      valueLabels: false,
    },
  },
};

export const TEMPLATE_IDS = Object.keys(TEMPLATE_META) as TemplateId[];

export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === 'string' && value in TEMPLATE_META;
}

/** The visibility keys a given template actually responds to. */
export function supportedVisibility(id: TemplateId): Array<keyof VisibilitySpec> {
  const meta = TEMPLATE_META[id].visibility;
  return (Object.keys(meta) as Array<keyof VisibilitySpec>).filter((k) => meta[k]);
}

/**
 * Turn a spec, an eased progress value and a composition into a complete ECharts option.
 *
 * This is the only entry point the render host and the preview use, so the export
 * pipeline stays entirely template-agnostic and the same composition settings apply
 * to every template.
 */
export function buildOption(
  spec: ChartSpec,
  progress: number,
  canvas: Canvas = LANDSCAPE,
  composition: Composition = DEFAULT_COMPOSITION,
): EChartsOption {
  switch (spec.template) {
    case 'animated-bar':
      return buildAnimatedBarOption(spec, progress, canvas, composition);
    case 'animated-line':
      return buildAnimatedLineOption(spec, progress, canvas, composition);
    case 'comparison':
      return buildComparisonOption(spec, progress, canvas, composition);
    case 'big-number':
      return buildBigNumberOption(spec, progress, canvas, composition);
    default: {
      const unknown = spec as { template: string };
      throw new Error(`Unknown template: ${unknown.template}`);
    }
  }
}

export {
  buildAnimatedBarOption,
  buildAnimatedLineOption,
  buildComparisonOption,
  buildBigNumberOption,
  COMPARISON_MIN_CATEGORIES,
  COMPARISON_MAX_CATEGORIES,
};
