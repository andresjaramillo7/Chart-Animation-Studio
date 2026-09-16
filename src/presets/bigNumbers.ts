/**
 * Big Numbers demo. Three individually selectable variants of the one generic
 * Big Number template. No subtitles and no extra statistics are invented here.
 */
export interface BigNumberVariant {
  id: string;
  label: string;
  title: string;
  subtitle: string;
  value: number;
  decimals: number;
  prefix: string;
  suffix: string;
  separators: boolean;
  filename: string;
}

export const BIG_NUMBER_VARIANTS: BigNumberVariant[] = [
  {
    id: 'a',
    label: 'A — Ranked Games Analyzed',
    title: 'Ranked Games Analyzed',
    subtitle: '',
    value: 11149,
    decimals: 0,
    prefix: '',
    suffix: '',
    separators: true,
    filename: 'big-number-games-analyzed',
  },
  {
    id: 'b',
    label: 'B — Early Surrender Rate',
    title: 'Early Surrender Rate',
    subtitle: '',
    value: 5.6,
    decimals: 1,
    prefix: '',
    suffix: '%',
    separators: true,
    filename: 'big-number-early-surrender-rate',
  },
  {
    id: 'c',
    label: 'C — Median Gold Deficit at Early Surrender',
    title: 'Median Gold Deficit at Early Surrender',
    subtitle: '',
    value: 5968.5,
    decimals: 1,
    prefix: '',
    suffix: '',
    separators: true,
    filename: 'big-number-median-gold-deficit',
  },
];

export function getVariant(id: string): BigNumberVariant | undefined {
  return BIG_NUMBER_VARIANTS.find((v) => v.id === id);
}
