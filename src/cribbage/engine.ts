/**
 * Cribbage: score any hand, and find the best two cards to throw in the crib.
 *
 * Scoring (4 cards plus the cut card, the "starter"):
 *  - fifteens: every group of cards adding to 15 scores 2 (aces 1, pictures 10)
 *  - pairs: every pair of the same rank scores 2
 *  - runs: three or more ranks in a row score 1 per card (each way to make one counts)
 *  - flush: 4 cards of one suit in the hand score 4 (5 with the starter);
 *    in the crib only a 5-card flush counts
 *  - nobs: the jack of the starter's suit in your hand scores 1
 * Cards use the poker encoding (rank*4+suit, rank 0..12 for 2..A).
 */
import { rankOf, suitOf } from '../poker/cards';

/** Cribbage rank: ace 1, two 2 … king 13. */
export const cribRank = (c: number) => ((rankOf(c) + 1) % 13) + 1;
export const cribValue = (c: number) => Math.min(10, cribRank(c));

export interface Score { fifteens: number; pairs: number; runs: number; flush: number; nobs: number; total: number }

export function score(hand: number[], starter: number, crib = false): Score {
  const all = [...hand, starter];
  const v = all.map(cribValue);
  let fifteens = 0;
  for (let m = 1; m < 32; m++) {
    let s = 0;
    for (let i = 0; i < 5; i++) if (m & (1 << i)) s += v[i];
    if (s === 15) fifteens += 2;
  }
  let pairs = 0;
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) if (cribRank(all[i]) === cribRank(all[j])) pairs += 2;
  const cnt = new Array<number>(15).fill(0);
  for (const c of all) cnt[cribRank(c)]++;
  let runs = 0;
  for (let r = 1; r <= 13; r++) {
    if (!cnt[r] || cnt[r - 1]) continue;
    let len = 0, ways = 1;
    while (cnt[r + len]) { ways *= cnt[r + len]; len++; }
    if (len >= 3) runs += len * ways;
  }
  const s0 = suitOf(hand[0]);
  let flush = 0;
  if (hand.every((c) => suitOf(c) === s0)) {
    if (suitOf(starter) === s0) flush = 5;
    else if (!crib) flush = 4;
  }
  const nobs = hand.some((c) => cribRank(c) === 11 && suitOf(c) === suitOf(starter)) ? 1 : 0;
  return { fifteens, pairs, runs, flush, nobs, total: fifteens + pairs + runs + flush + nobs };
}

export interface DiscardResult { throw: [number, number]; keep: number[]; hand: number; crib: number; net: number; min: number; max: number }

/**
 * Every way to throw 2 of your 6 cards, with exact averages over every cut
 * card (46 of them) for your hand, and over every 2 cards the other player
 * could throw and every cut for the crib. The crib average assumes the other
 * player's two cards are random, a simplification (real players throw
 * differently). As dealer the crib is yours (added); otherwise it is theirs
 * (taken away).
 */
export function bestDiscards(six: number[], dealer: boolean, withCrib = true): DiscardResult[] {
  if (six.length !== 6 || new Set(six).size !== 6) throw new Error('Pick exactly six different cards.');
  const rest: number[] = [];
  for (let c = 0; c < 52; c++) if (!six.includes(c)) rest.push(c);
  const out: DiscardResult[] = [];
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
    const keep = six.filter((_, k) => k !== i && k !== j);
    const thrown: [number, number] = [six[i], six[j]];
    let sum = 0, min = 99, max = 0;
    for (const s of rest) { const t = score(keep, s).total; sum += t; min = Math.min(min, t); max = Math.max(max, t); }
    const hand = sum / rest.length;
    let crib = 0;
    if (withCrib) {
      let cs = 0, n = 0;
      for (let a = 0; a < rest.length; a++) for (let b = a + 1; b < rest.length; b++) {
        const cribHand = [thrown[0], thrown[1], rest[a], rest[b]];
        for (let k = 0; k < rest.length; k++) {
          if (k === a || k === b) continue;
          cs += score(cribHand, rest[k], true).total; n++;
        }
      }
      crib = cs / n;
    }
    out.push({ throw: thrown, keep, hand, crib, net: hand + (dealer ? crib : -crib), min, max });
  }
  return out.sort((a, b) => b.net - a.net);
}
