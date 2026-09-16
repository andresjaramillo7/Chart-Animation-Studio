import type { EChartsOption } from 'echarts';
import type { ChartSpec, TemplateId } from '../shared/types.js';
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
}

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
  },
  'animated-line': {
    label: 'Animated Line',
    needsData: true,
    minCategories: 2,
    maxCategories: 60,
    supportsOrientation: false,
    supportsReveal: false,
    supportsHighlight: true,
  },
  comparison: {
    label: 'Comparison Chart',
    needsData: true,
    minCategories: COMPARISON_MIN_CATEGORIES,
    maxCategories: COMPARISON_MAX_CATEGORIES,
    supportsOrientation: false,
    supportsReveal: true,
    supportsHighlight: true,
  },
  'big-number': {
    label: 'Big Number',
    needsData: false,
    minCategories: 0,
    maxCategories: 0,
    supportsOrientation: false,
    supportsReveal: false,
    supportsHighlight: false,
  },
};

export const TEMPLATE_IDS = Object.keys(TEMPLATE_META) as TemplateId[];

export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === 'string' && value in TEMPLATE_META;
}

/**
 * Turn a spec and an eased progress value into a complete ECharts option.
 *
 * This is the only entry point the render host and the preview use, so the export
 * pipeline stays entirely template-agnostic.
 */
export function buildOption(
  spec: ChartSpec,
  progress: number,
  canvas: Canvas = LANDSCAPE,
): EChartsOption {
  switch (spec.template) {
    case 'animated-bar':
      return buildAnimatedBarOption(spec, progress, canvas);
    case 'animated-line':
      return buildAnimatedLineOption(spec, progress, canvas);
    case 'comparison':
      return buildComparisonOption(spec, progress, canvas);
    case 'big-number':
      return buildBigNumberOption(spec, progress, canvas);
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
