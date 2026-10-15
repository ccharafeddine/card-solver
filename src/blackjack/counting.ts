/**
 * Hi-Lo card counting and the "Illustrious 18": the eighteen strategy changes
 * by true count that matter most (Hi-Lo indices for a multi-deck, dealer
 * stands on soft 17 game, as published by Don Schlesinger).
 *
 * Hi-Lo: 2 to 6 count +1, 7 to 9 count 0, tens and aces count -1. The running
 * count divided by the decks left is the true count. A high true count means
 * the shoe is rich in tens and aces, which helps the player.
 */
import type { ActionId } from './engine';

export const hiLo = (rank: number) => (rank >= 2 && rank <= 6 ? 1 : rank >= 7 && rank <= 9 ? 0 : -1);

/** True count: running count per deck left, rounded down toward zero by half-deck steps like most players do (here: one decimal). */
export const trueCount = (running: number, cardsLeft: number) => (cardsLeft <= 0 ? 0 : running / (cardsLeft / 52));

/** Rule of thumb: each +1 of true count moves about 0.5% of edge to the player. */
export const edgeWithCount = (baseEV: number, tc: number) => baseEV + 0.005 * tc;

export interface Deviation {
  id: number;
  /** Plain label like "16 vs 10". */
  label: string;
  /** Hard total the rule is about (ignored for pairs and insurance). */
  total?: number;
  /** A pair of this rank (10 for tens). */
  pair?: number;
  up: number;
  index: number;
  /** Action at or above the index. */
  above: ActionId | 'insurance';
  /** Action below the index. */
  below: ActionId | 'no insurance';
}

export const ILLUSTRIOUS_18: Deviation[] = [
  { id: 1, label: 'Insurance vs A', up: 1, index: 3, above: 'insurance', below: 'no insurance' },
  { id: 2, label: '16 vs 10', total: 16, up: 10, index: 0, above: 'stand', below: 'hit' },
  { id: 3, label: '15 vs 10', total: 15, up: 10, index: 4, above: 'stand', below: 'hit' },
  { id: 4, label: '10,10 vs 5', pair: 10, up: 5, index: 5, above: 'split', below: 'stand' },
  { id: 5, label: '10,10 vs 6', pair: 10, up: 6, index: 4, above: 'split', below: 'stand' },
  { id: 6, label: '10 vs 10', total: 10, up: 10, index: 4, above: 'double', below: 'hit' },
  { id: 7, label: '12 vs 3', total: 12, up: 3, index: 2, above: 'stand', below: 'hit' },
  { id: 8, label: '12 vs 2', total: 12, up: 2, index: 3, above: 'stand', below: 'hit' },
  { id: 9, label: '11 vs A', total: 11, up: 1, index: 1, above: 'double', below: 'hit' },
  { id: 10, label: '9 vs 2', total: 9, up: 2, index: 1, above: 'double', below: 'hit' },
  { id: 11, label: '10 vs A', total: 10, up: 1, index: 4, above: 'double', below: 'hit' },
  { id: 12, label: '9 vs 7', total: 9, up: 7, index: 3, above: 'double', below: 'hit' },
  { id: 13, label: '16 vs 9', total: 16, up: 9, index: 5, above: 'stand', below: 'hit' },
  { id: 14, label: '13 vs 2', total: 13, up: 2, index: -1, above: 'stand', below: 'hit' },
  { id: 15, label: '12 vs 4', total: 12, up: 4, index: 0, above: 'stand', below: 'hit' },
  { id: 16, label: '12 vs 5', total: 12, up: 5, index: -2, above: 'stand', below: 'hit' },
  { id: 17, label: '12 vs 6', total: 12, up: 6, index: -1, above: 'stand', below: 'hit' },
  { id: 18, label: '13 vs 3', total: 13, up: 3, index: -2, above: 'stand', below: 'hit' },
];

/** The deviation (if any) for a two-card hand against an upcard. Soft hands never match; pairs match only their own rows. */
export function deviationFor(c1: number, c2: number, up: number): Deviation | null {
  const soft = c1 === 1 || c2 === 1;
  for (const d of ILLUSTRIOUS_18) {
    if (d.up !== up || d.above === 'insurance') continue;
    if (d.pair !== undefined) { if (c1 === d.pair && c2 === d.pair) return d; continue; }
    if (!soft && c1 !== c2 && c1 + c2 === d.total) return d;
  }
  return null;
}

/** The count-adjusted action, or null when the count doesn't change basic strategy here. */
export function countAction(c1: number, c2: number, up: number, tc: number, basic: ActionId, allowed: ActionId[]): ActionId | null {
  const d = deviationFor(c1, c2, up);
  if (!d) return null;
  const a = (tc >= d.index ? d.above : d.below) as ActionId;
  // Surrender is better than hitting a 15 or 16 at low counts: keep it when basic strategy says so.
  if (basic === 'surrender' && a === 'hit') return null;
  if (!allowed.includes(a) || a === basic) return null;
  return a;
}

/** Insurance pays 2:1; it is worth it only when more than a third of the unseen cards are tens (true count about +3 or more). */
export const takeInsurance = (tc: number) => tc >= 3;
