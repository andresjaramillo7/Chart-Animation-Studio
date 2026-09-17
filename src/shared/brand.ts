/**
 * SLAYRR visual identity.
 *
 * Two deliberately separate concepts live here:
 *
 *   BRAND tokens  — the surface, ink, grid and signature accent. These say "SLAYRR".
 *   DATA colours  — what the bars, lines, slices and cells are painted with.
 *
 * They are kept apart because the signature red is an editorial accent, not a data
 * colour. A chart may contain no red at all and still be unmistakably SLAYRR: the
 * identity comes from the surface, the typography, the spacing and the restraint.
 */

/* ------------------------------------------------------------------ tokens ---- */

export const BRAND = {
  /** Page surface. */
  obsidian: '#0D0F14',
  /** Secondary surface, for anything that must sit above the page. */
  carbon: '#171A22',
  /** Primary text. */
  ivory: '#F2F3F5',
  /** Secondary text. */
  ash: '#A8AFBC',
  /** Gridlines and dividers. */
  divider: '#272D38',
  /** Signature accent. Used for emphasis, never as a default data colour. */
  red: '#D7263D',

  /** Neutral data colours, lightest first. */
  neutral1: '#7C8595',
  neutral2: '#5D6675',
  neutral3: '#3F4653',

  /** Semantic data colours. */
  gold: '#C6A45D',
  emerald: '#4DAA91',
  steel: '#669BC7',
} as const;

/* ----------------------------------------------------------- data schemes ---- */

export type DataSchemeId = 'neutral-red' | 'gold' | 'diverging' | 'categorical';

export interface DataScheme {
  label: string;
  description: string;
  /** Colours assigned to data in order. Index N always gets colour N. */
  series: string[];
  /** Colour for an intentionally emphasized datum. */
  highlight: string;
  /** Low-to-high ramp for continuous scales such as the heatmap. */
  sequential: string[];
}

export const DATA_SCHEMES: Record<DataSchemeId, DataScheme> = {
  'neutral-red': {
    label: 'Neutral + Red',
    description: 'Neutral data with red reserved for intentional emphasis.',
    series: [BRAND.neutral1, BRAND.neutral2, BRAND.neutral3],
    highlight: BRAND.red,
    // Dark to red: quantitative, single-direction, no implied good/bad at the low end.
    // The stops climb in roughly even steps of lightness rather than clustering near the
    // surface, so values in the lower part of a fixed 0-100 scale stay tellable apart.
    sequential: ['#1C222C', '#39435A', '#5C6880', '#8A94A8', '#C2536B', BRAND.red],
  },
  gold: {
    label: 'Gold',
    description: 'Gold as the data accent, for resources and economy.',
    series: [BRAND.gold, BRAND.neutral2, BRAND.neutral3],
    highlight: BRAND.red,
    sequential: ['#1C222C', '#39404E', '#5F6060', '#8E8058', BRAND.gold],
  },
  diverging: {
    label: 'Diverging',
    description: 'Red / neutral / emerald, mapped by position — never inferred.',
    // The mapping is positional and explicit: nothing here reads category names.
    series: [BRAND.red, BRAND.neutral1, BRAND.emerald],
    highlight: BRAND.red,
    sequential: [BRAND.red, BRAND.neutral2, BRAND.neutral1, BRAND.emerald],
  },
  categorical: {
    label: 'Categorical',
    description: 'A restrained multicolour set when categories must be told apart.',
    // Ordered for maximum separation between neighbours, not for brand emphasis.
    series: [BRAND.steel, BRAND.gold, BRAND.emerald, BRAND.neutral1, BRAND.red, BRAND.neutral3],
    highlight: BRAND.red,
    sequential: ['#1C222C', '#33465C', '#4E7396', BRAND.steel, '#A9C3DA'],
  },
};

export const DATA_SCHEME_IDS = Object.keys(DATA_SCHEMES) as DataSchemeId[];

export const DEFAULT_DATA_SCHEME: DataSchemeId = 'neutral-red';

export function isDataSchemeId(value: unknown): value is DataSchemeId {
  return typeof value === 'string' && value in DATA_SCHEMES;
}
