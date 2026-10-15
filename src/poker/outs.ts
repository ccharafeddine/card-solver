/**
 * Outs: unseen cards that improve your hand to a better kind of hand (say a
 * pair to three of a kind, or four to a flush into a flush), counted only
 * when your own cards make the improvement, so a card that pairs the board
 * for everyone is not an out. A simple, honest count: it does not know what
 * the opponent holds, so the equity number is still the one to trust.
 */
import { categoryOf, evaluate, CATEGORY_NAMES } from './eval';

export interface OutGroup { category: number; name: string; cards: number[] }
export interface Outs { current: number; groups: OutGroup[]; total: number; ruleOf: number | null; exactNext: number | null }

export function findOuts(hero: number[], board: number[], dead: number[]): Outs | null {
  if (hero.length !== 2 || board.length < 3 || board.length > 4) return null;
  const cur = categoryOf(evaluate([...hero, ...board]));
  const used = new Set([...hero, ...board, ...dead]);
  const byCat = new Map<number, number[]>();
  for (let c = 0; c < 52; c++) {
    if (used.has(c)) continue;
    const mine = categoryOf(evaluate([...hero, ...board, c]));
    const boardOnly = categoryOf(evaluate([...board, c]));
    // The improvement has to come from your cards, not from the board alone.
    if (mine > cur && mine > boardOnly) byCat.set(mine, [...(byCat.get(mine) ?? []), c]);
  }
  const groups = [...byCat.entries()].sort((a, b) => b[0] - a[0]).map(([category, cards]) => ({ category, name: CATEGORY_NAMES[category], cards }));
  const total = groups.reduce((n, g) => n + g.cards.length, 0);
  const unseen = 52 - used.size;
  // Rule of 4 and 2: outs x 4 on the flop (two cards to come), x 2 on the turn.
  const ruleOf = board.length === 3 ? Math.min(100, total * 4) : total * 2;
  const exactNext = board.length === 3
    ? 100 * (1 - ((unseen - total) / unseen) * ((unseen - 1 - total) / (unseen - 1)))
    : (100 * total) / unseen;
  return { current: cur, groups, total, ruleOf, exactNext };
}
