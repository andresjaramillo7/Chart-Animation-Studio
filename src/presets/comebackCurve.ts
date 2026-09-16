import type { Orientation, Reveal, TemplateId, ValueMode } from '../shared/types.js';

/**
 * Example preset. The numbers below are observed results and must not be
 * normalized, rescaled, reordered or rounded.
 */
export const COMEBACK_CURVE_CSV = `category,value
0-999,45.4
1000-1999,37.4
2000-2999,30.5
3000-3999,21.1
4000-4999,16.3
5000-5999,12.4
6000+,6.6
`;

export const COMEBACK_CURVE: {
  template: TemplateId;
  title: string;
  subtitle: string;
  valueMode: ValueMode;
  highlight: string | null;
  orientation: Orientation;
  reveal: Reveal;
  csv: string;
} = {
  template: 'animated-bar',
  title: 'Comeback Rate by Gold Deficit',
  subtitle: 'Observed comeback rates among games continuing past 20 minutes.',
  valueMode: 'percent',
  highlight: '6000+',
  orientation: 'vertical',
  reveal: 'simultaneous',
  csv: COMEBACK_CURVE_CSV,
};
