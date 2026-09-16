import type { EChartsOption } from 'echarts';
import { DEFAULT_COMPOSITION, type AreaSpec, type Composition, type LineSpec } from '../shared/types.js';
import { LANDSCAPE, type Canvas } from '../shared/layout.js';
import { buildLineFamilyOption } from './animatedLine.js';

/**
 * Area Chart — the Animated Line engine with a fill under the drawn polyline.
 *
 * There is deliberately no second line-animation implementation here: the fill is an
 * `areaStyle` on the same series, bounded by the same points, so the area always ends
 * exactly where the line's interpolated head is. The source observations are used as
 * supplied; interpolation happens only to draw the segment currently in progress.
 */
export function buildAreaOption(
  spec: AreaSpec,
  progress: number,
  canvas: Canvas = LANDSCAPE,
  composition: Composition = DEFAULT_COMPOSITION,
): EChartsOption {
  const asLine: LineSpec = {
    template: 'animated-line',
    title: spec.title,
    subtitle: spec.subtitle,
    valueMode: spec.valueMode,
    theme: spec.theme,
    data: spec.data,
    highlight: spec.highlight,
  };
  return buildLineFamilyOption(asLine, progress, canvas, composition, {
    areaOpacity: spec.areaOpacity,
    showPoints: spec.showPoints,
  });
}
