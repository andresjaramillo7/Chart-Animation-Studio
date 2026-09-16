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
import { buildDonutOption } from './donut.js';
import { buildStackedBarOption } from './stackedBar.js';
import { buildAreaOption } from './area.js';
import { buildScatterOption } from './scatter.js';
import { buildHeatmapOption } from './heatmap.js';

/** The CSV shape a template expects. Drives the editor hint and the parser chosen. */
export type DataSchema = 'category-value' | 'category-series' | 'xy-label' | 'xy-value' | 'none';

export const SCHEMA_HEADERS: Record<DataSchema, string> = {
  'category-value': 'category,value',
  'category-series': 'category,Series A,Series B',
  'xy-label': 'x,y,label',
  'xy-value': 'x,y,value',
  none: '',
};

/** Gallery grouping, in display order. */
export type TemplateGroup = 'Comparison' | 'Trends' | 'Distribution' | 'Relationships' | 'Statistics';

export const TEMPLATE_GROUPS: TemplateGroup[] = [
  'Comparison',
  'Trends',
  'Distribution',
  'Relationships',
  'Statistics',
];

export interface TemplateMeta {
  label: string;
  group: TemplateGroup;
  description: string;
  schema: DataSchema;
  /** Whether the template is driven by a dataset at all. */
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

const PLOTTED: VisibilitySpec = {
  title: true,
  subtitle: true,
  axisLabels: true,
  axes: true,
  gridlines: true,
  legend: false,
  valueLabels: true,
};

/** Drives the editor's field visibility, the gallery, and the backend's validation. */
export const TEMPLATE_META: Record<TemplateId, TemplateMeta> = {
  'animated-bar': {
    label: 'Animated Bar',
    group: 'Comparison',
    description: 'Bars growing from zero, vertical or horizontal.',
    schema: 'category-value',
    needsData: true,
    minCategories: 1,
    maxCategories: 40,
    supportsOrientation: true,
    supportsReveal: true,
    supportsHighlight: true,
    visibility: PLOTTED,
  },
  comparison: {
    label: 'Comparison Chart',
    group: 'Comparison',
    description: 'Two or three values side by side with outsized read-outs.',
    schema: 'category-value',
    needsData: true,
    minCategories: COMPARISON_MIN_CATEGORIES,
    maxCategories: COMPARISON_MAX_CATEGORIES,
    supportsOrientation: false,
    supportsReveal: true,
    supportsHighlight: true,
    visibility: PLOTTED,
  },
  'stacked-bar': {
    label: 'Stacked Bar',
    group: 'Comparison',
    description: 'Several series stacked per category, raw or normalized to 100%.',
    schema: 'category-series',
    needsData: true,
    minCategories: 1,
    maxCategories: 30,
    supportsOrientation: true,
    supportsReveal: true,
    supportsHighlight: true,
    visibility: { ...PLOTTED, legend: true },
  },
  'animated-line': {
    label: 'Animated Line',
    group: 'Trends',
    description: 'A line drawn progressively across ordered categories.',
    schema: 'category-value',
    needsData: true,
    minCategories: 2,
    maxCategories: 60,
    supportsOrientation: false,
    supportsReveal: false,
    supportsHighlight: true,
    visibility: PLOTTED,
  },
  area: {
    label: 'Area',
    group: 'Trends',
    description: 'The same progressive line with a filled area beneath it.',
    schema: 'category-value',
    needsData: true,
    minCategories: 2,
    maxCategories: 60,
    supportsOrientation: false,
    supportsReveal: false,
    supportsHighlight: true,
    visibility: PLOTTED,
  },
  donut: {
    label: 'Donut',
    group: 'Distribution',
    description: 'Parts of one whole, swept open clockwise.',
    schema: 'category-value',
    needsData: true,
    minCategories: 2,
    maxCategories: 12,
    supportsOrientation: false,
    supportsReveal: false,
    supportsHighlight: true,
    // A donut has no axes or gridlines; it does have a legend and segment labels.
    visibility: {
      title: true,
      subtitle: true,
      axisLabels: false,
      axes: false,
      gridlines: false,
      legend: true,
      valueLabels: true,
    },
  },
  scatter: {
    label: 'Scatter',
    group: 'Relationships',
    description: 'Two numeric variables plotted as individual points.',
    schema: 'xy-label',
    needsData: true,
    minCategories: 1,
    maxCategories: 2000,
    supportsOrientation: false,
    supportsReveal: true,
    supportsHighlight: true,
    visibility: PLOTTED,
  },
  heatmap: {
    label: 'Heatmap',
    group: 'Relationships',
    description: 'Values on a grid of two categorical axes, shaded by intensity.',
    schema: 'xy-value',
    needsData: true,
    minCategories: 1,
    maxCategories: 2000,
    supportsOrientation: false,
    supportsReveal: false,
    supportsHighlight: true,
    // The colour scale is this template's legend; gridlines do not apply.
    visibility: {
      title: true,
      subtitle: true,
      axisLabels: true,
      axes: true,
      gridlines: false,
      legend: true,
      valueLabels: true,
    },
  },
  'big-number': {
    label: 'Big Number',
    group: 'Statistics',
    description: 'One large figure counting up to its final value.',
    schema: 'none',
    needsData: false,
    minCategories: 0,
    maxCategories: 0,
    supportsOrientation: false,
    supportsReveal: false,
    supportsHighlight: false,
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

export function templatesInGroup(group: TemplateGroup): TemplateId[] {
  return TEMPLATE_IDS.filter((id) => TEMPLATE_META[id].group === group);
}

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
    case 'donut':
      return buildDonutOption(spec, progress, canvas, composition);
    case 'stacked-bar':
      return buildStackedBarOption(spec, progress, canvas, composition);
    case 'area':
      return buildAreaOption(spec, progress, canvas, composition);
    case 'scatter':
      return buildScatterOption(spec, progress, canvas, composition);
    case 'heatmap':
      return buildHeatmapOption(spec, progress, canvas, composition);
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
  buildDonutOption,
  buildStackedBarOption,
  buildAreaOption,
  buildScatterOption,
  buildHeatmapOption,
  COMPARISON_MIN_CATEGORIES,
  COMPARISON_MAX_CATEGORIES,
};
