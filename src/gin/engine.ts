/**
 * Gin rummy: deadwood, the best way to lay down melds, and discard and knock
 * advice.
 *
 * A meld is a set (3 or 4 cards of one rank) or a run (3 or more in a row in
 * one suit, ace low). Deadwood is the points of the cards left over: aces 1,
 * number cards their number, picture cards 10. The best melds (the lowest
 * deadwood) are found exactly by trying every way to split the hand.
 * Discard and knock advice adds rules of thumb on top, and says so.
 * Cards use the poker encoding (rank*4+suit, rank 0..12 for 2..A).
 */
import { rankOf, suitOf } from '../poker/cards';

/** Gin rank: ace 0, two 1 … king 12. */
export const ginRank = (c: number) => (rankOf(c) + 1) % 13;
export const points = (c: number) => Math.min(10, ginRank(c) + 1);

export interface Melds { melds: number[][]; deadwood: number[]; points: number }

/** Every set and run (and every 3-card part of a bigger one) these cards contain. */
export function allMelds(cards: number[]): number[][] {
  const out: number[][] = [];
  const byRank = new Map<number, number[]>();
  for (const c of cards) byRank.set(ginRank(c), [...(byRank.get(ginRank(c)) ?? []), c]);
  for (const g of byRank.values()) {
    if (g.length >= 3) {
      if (g.length === 4) out.push(g.slice());
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) for (let k = j + 1; k < g.length; k++) out.push([g[i], g[j], g[k]]);
    }
  }
  for (let s = 0; s < 4; s++) {
    const has = new Map<number, number>();
    for (const c of cards) if (suitOf(c) === s) has.set(ginRank(c), c);
    for (let start = 0; start < 13; start++) {
      const run: number[] = [];
      for (let r = start; r < 13 && has.has(r); r++) { run.push(has.get(r)!); if (run.length >= 3) out.push(run.slice()); }
    }
  }
  return out;
}

/** The lowest deadwood for these cards and the melds that give it (exact search). */
export function bestMelds(cards: number[]): Melds {
  const melds = allMelds(cards);
  const n = cards.length;
  const idx = new Map(cards.map((c, i) => [c, i]));
  const masks = melds.map((m) => m.reduce((a, c) => a | (1 << idx.get(c)!), 0));
  const pts = cards.map(points);
  const memo = new Map<number, number>();
  // f(used) = lowest deadwood of the cards not in `used`.
  const f = (used: number): number => {
    if (used === (1 << n) - 1) return 0;
    const hit = memo.get(used);
    if (hit !== undefined) return hit;
    let i = 0;
    while (used & (1 << i)) i++;
    let best = pts[i] + f(used | (1 << i));
    for (const m of masks) if (m & (1 << i) && !(m & used)) best = Math.min(best, f(used | m));
    memo.set(used, best);
    return best;
  };
  const total = f(0);
  // Walk the choices back to list the melds.
  const chosen: number[][] = [];
  const dead: number[] = [];
  let used = 0;
  while (used !== (1 << n) - 1) {
    let i = 0;
    while (used & (1 << i)) i++;
    const want = f(used);
    const k = masks.findIndex((m) => m & (1 << i) && !(m & used) && f(used | m) === want);
    if (k >= 0) { chosen.push(melds[k]); used |= masks[k]; } else { dead.push(cards[i]); used |= 1 << i; }
  }
  return { melds: chosen, deadwood: dead, points: total };
}

export interface DiscardOption { card: number; deadwood: number; /** Unseen cards that would lower the deadwood if you drew them next. */ helpers: number; melds: Melds }

/**
 * With 11 cards (after drawing), every discard ranked: lowest deadwood
 * first, then the one that leaves the most cards that would help (a rule of
 * thumb for "keep your options open"), then the higher-point card.
 * `seen` lists cards known to be gone (the discard pile), which can't help.
 */
export function discardOptions(hand: number[], seen: number[] = []): DiscardOption[] {
  if (hand.length !== 11) throw new Error('Pick 11 cards: your 10 plus the one you drew.');
  const unseen: number[] = [];
  for (let c = 0; c < 52; c++) if (!hand.includes(c) && !seen.includes(c)) unseen.push(c);
  const opts = hand.map((card) => {
    const keep = hand.filter((c) => c !== card);
    const melds = bestMelds(keep);
    let helpers = 0;
    for (const u of unseen) {
      const with11 = [...keep, u];
      const after = Math.min(...with11.map((d) => bestMelds(with11.filter((c) => c !== d)).points));
      if (after < melds.points) helpers++;
    }
    return { card, deadwood: melds.points, helpers, melds };
  });
  return opts.sort((a, b) => a.deadwood - b.deadwood || b.helpers - a.helpers || points(b.card) - points(a.card));
}

export interface KnockAdvice { canKnock: boolean; gin: boolean; advice: 'gin' | 'knock' | 'wait' | 'cannot'; why: string }

/**
 * Knock or keep playing? A rule of thumb, not a solved answer: knock as soon
 * as you can early in the hand; later, only with low deadwood, because the
 * other player has had time to build melds and could undercut you.
 */
export function knockAdvice(deadwood: number, turn: number): KnockAdvice {
  if (deadwood === 0) return { canKnock: true, gin: true, advice: 'gin', why: 'Zero deadwood: go gin! You score a 25-point bonus and the other player can\'t lay off cards on your melds.' };
  if (deadwood > 10) return { canKnock: false, gin: false, advice: 'cannot', why: `You need 10 or less to knock. You have ${deadwood}, so keep playing.` };
  const limit = turn <= 5 ? 10 : turn <= 10 ? 6 : 3;
  if (deadwood <= limit) return { canKnock: true, gin: false, advice: 'knock', why: turn <= 5 ? 'Early in the hand the other player usually has lots of deadwood, so knocking now usually wins.' : `It's turn ${turn}, but ${deadwood} is low enough that you'll usually still have less than the other player.` };
  return { canKnock: true, gin: false, advice: 'wait', why: `You may knock, but by turn ${turn} the other player has probably built melds. With ${deadwood} you risk an undercut (they score 25 extra), so try to get it lower first.` };
}

/** Take the face-up card or draw from the pile? Take it if it goes straight into a meld and lowers your deadwood. */
export function takeUpcard(hand10: number[], up: number): { take: boolean; before: number; after: number; discard: number | null } {
  const before = bestMelds(hand10).points;
  const opts = discardOptions([...hand10, up]).filter((o) => o.card !== up);
  const best = opts[0];
  const inMeld = best.melds.melds.some((m) => m.includes(up));
  return { take: inMeld && best.deadwood < before, before, after: best.deadwood, discard: best.card };
}
