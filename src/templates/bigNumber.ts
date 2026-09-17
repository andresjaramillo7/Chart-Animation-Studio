import type { EChartsOption } from 'echarts';
import { DEFAULT_COMPOSITION, type BigNumberSpec, type Composition } from '../shared/types.js';
import { clamp01 } from '../shared/timeline.js';
import { formatNumber } from '../shared/format.js';
import { LANDSCAPE, estimateTextWidth, getLayout, type Canvas } from '../shared/layout.js';
import { FONT_STACK, baseOption, buildHeader, wantsMotif } from './common.js';

/**
 * The displayed value at a given progress.
 *
 * Computed straight from the timeline — never from the previous frame — so frame N is
 * reproducible in isolation, the first frame reads zero, and the final frame is exactly
 * the supplied value with the supplied formatting.
 */
export function bigNumberText(spec: BigNumberSpec, progress: number): string {
  const t = clamp01(progress);
  return formatNumber(spec.value * t, spec.decimals, spec.separators, spec.prefix, spec.suffix);
}

/**
 * Big Number — a single large count-up value, drawn as an ECharts graphic element
 * inside the same composition as the other templates (same header, same theme).
 */
export function buildBigNumberOption(
  spec: BigNumberSpec,
  progress: number,
  canvas: Canvas = LANDSCAPE,
  composition: Composition = DEFAULT_COMPOSITION,
): EChartsOption {
  const { theme } = spec;
  const layout = getLayout(canvas);
  const header = buildHeader(spec.title, spec.subtitle, layout, theme, composition.show, wantsMotif(composition));

  const text = bigNumberText(spec, progress);
  // The final value is the widest the read-out ever gets; size against that so the
  // number never reflows or clips part-way through the count-up.
  const widest = formatNumber(spec.value, spec.decimals, spec.separators, spec.prefix, spec.suffix);
  const available = layout.width - layout.pad * 2;
  let fontSize = layout.bigValueSize;
  const estimated = estimateTextWidth(widest, fontSize, true);
  if (estimated > available) fontSize = Math.floor(fontSize * (available / estimated));

  // Centre the value in the space left below the header.
  const centreY = header.contentTop + (layout.height - header.contentTop - layout.gridBottom) / 2;

  return {
    ...baseOption(theme, composition),
    title: header.title,
    graphic: [
      ...header.graphic,
      {
        type: 'text',
        silent: true,
        style: {
          // Anchored through style.x/y so textAlign/textVerticalAlign actually centre the
          // text on this point; `left`/`top` would place the box corner instead.
          x: Math.round(layout.width / 2),
          y: Math.round(centreY),
          text,
          // The figure is the protagonist, so it carries the primary text colour. The
          // only red in this composition is the small motif rule above the title.
          fill: theme.text,
          font: `700 ${fontSize}px ${FONT_STACK}`,
          textAlign: 'center',
          textVerticalAlign: 'middle',
        },
      },
    ],
    // No axes or series: the composition is the header plus the read-out.
    xAxis: { show: false },
    yAxis: { show: false },
    series: [],
  } as EChartsOption;
}
