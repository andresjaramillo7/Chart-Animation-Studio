/**
 * Synthetic demonstration data.
 *
 * These numbers exist only to show how a template behaves. They are NOT observations,
 * and none of them comes from the League of Legends study — every preset that uses them
 * says so in its subtitle. The one real dataset reused in this file's neighbours is the
 * Comeback Curve, which the Area preset shares with Animated Bar and Animated Line.
 */

export const ILLUSTRATIVE = 'Illustrative example data, not a study result.';

/** Donut — parts of one whole, totalling 100%. */
export const DONUT_EXAMPLE_CSV = `category,value
Category A,60
Category B,25
Category C,15
`;

/** Stacked Bar — two series across three groups. */
export const STACKED_EXAMPLE_CSV = `category,Series A,Series B
Group 1,30,70
Group 2,45,55
Group 3,60,40
`;

/** Scatter — three labelled x/y pairs. */
export const SCATTER_EXAMPLE_CSV = `x,y,label
1000,45.4,A
2000,37.4,B
3000,30.5,C
`;

/** Heatmap — a two-by-two grid. */
export const HEATMAP_EXAMPLE_CSV = `x,y,value
Group A,Low,25.5
Group A,Medium,29.7
Group B,Low,32.2
Group B,Medium,41.2
`;
