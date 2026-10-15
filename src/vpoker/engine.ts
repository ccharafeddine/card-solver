/**
 * Video poker, Jacks or Better: the exact best hold for any five cards.
 *
 * You keep (hold) any of your five cards and draw new ones from the 47 left.
 * For each of the 32 ways to hold, every possible draw is counted (up to
 * 1,533,939 when you throw all five away), so the expected value of each
 * hold is exact, not a simulation. Cards use the poker encoding: rank*4+suit,
 * rank 0..12 for 2..A.
 */
export const VP_HANDS = ['Royal flush', 'Straight flush', 'Four of a kind', 'Full house', 'Flush', 'Straight', 'Three of a kind', 'Two pair', 'Jacks or better', 'Nothing'] as const;
export type VpHand = (typeof VP_HANDS)[number];

export interface PayTable { id: string; name: string; pays: number[]; /** Published long-run return with perfect play, or null for a custom table. */ ret: number | null }
// Pays per coin, in VP_HANDS order (royal at 800 per coin is the 4,000-coin max-bet jackpot).
// Returns: full-game analyses published by the Wizard of Odds for perfect play.
export const PAY_TABLES: PayTable[] = [
  { id: '9-6', name: '9/6 ("full pay")', pays: [800, 50, 25, 9, 6, 4, 3, 2, 1, 0], ret: 0.995439 },
  { id: '8-6', name: '8/6', pays: [800, 50, 25, 8, 6, 4, 3, 2, 1, 0], ret: 0.983927 },
  { id: '8-5', name: '8/5', pays: [800, 50, 25, 8, 5, 4, 3, 2, 1, 0], ret: 0.972984 },
  { id: '7-5', name: '7/5', pays: [800, 50, 25, 7, 5, 4, 3, 2, 1, 0], ret: 0.961472 },
  { id: '6-5', name: '6/5', pays: [800, 50, 25, 6, 5, 4, 3, 2, 1, 0], ret: 0.950015 },
];

/** Which paying hand five cards make (an index into VP_HANDS). */
export function classify(a: number, b: number, c: number, d: number, e: number): number {
  const r0 = a >> 2, r1 = b >> 2, r2 = c >> 2, r3 = d >> 2, r4 = e >> 2;
  const flush = (a & 3) === (b & 3) && (a & 3) === (c & 3) && (a & 3) === (d & 3) && (a & 3) === (e & 3);
  const mask = (1 << r0) | (1 << r1) | (1 << r2) | (1 << r3) | (1 << r4);
  let distinct = 0;
  for (let m = mask; m; m &= m - 1) distinct++;
  if (distinct === 5) {
    let straight = false, royal = false;
    const lo = 31 - Math.clz32(mask & -mask), hi = 31 - Math.clz32(mask);
    if (hi - lo === 4) { straight = true; royal = lo === 8; }
    else if (mask === 0b1000000001111) straight = true; // A-2-3-4-5
    if (straight && flush) return royal ? 0 : 1;
    if (flush) return 4;
    if (straight) return 5;
    return 9;
  }
  if (flush) return 4; // can't happen with a pair, kept for safety
  // Count ranks for pairs, trips and quads.
  const cnt = new Uint8Array(13);
  cnt[r0]++; cnt[r1]++; cnt[r2]++; cnt[r3]++; cnt[r4]++;
  let pairs = 0, trips = 0, quads = 0, highPair = false;
  for (let r = 0; r < 13; r++) {
    const n = cnt[r];
    if (n === 4) quads++; else if (n === 3) trips++; else if (n === 2) { pairs++; if (r >= 9) highPair = true; }
  }
  if (quads) return 2;
  if (trips && pairs) return 3;
  if (trips) return 6;
  if (pairs === 2) return 7;
  if (pairs === 1 && highPair) return 8;
  return 9;
}

export interface Hold { mask: number; held: number[]; ev: number; counts: number[]; draws: number }

/** Every hold, best first, with its exact EV per coin and how often each hand comes. */
export function analyze(hand: number[], pays: number[]): Hold[] {
  if (hand.length !== 5 || new Set(hand).size !== 5) throw new Error('Pick exactly five different cards.');
  const deck: number[] = [];
  for (let c = 0; c < 52; c++) if (!hand.includes(c)) deck.push(c);
  const out: Hold[] = [];
  const cards = new Int32Array(5);
  for (let mask = 0; mask < 32; mask++) {
    const held = hand.filter((_, i) => mask & (1 << i));
    const k = 5 - held.length;
    for (let i = 0; i < held.length; i++) cards[i] = held[i];
    const counts = new Array<number>(10).fill(0);
    let draws = 0;
    const h = held.length;
    const rec = (start: number, depth: number) => {
      if (depth === 5) { counts[classify(cards[0], cards[1], cards[2], cards[3], cards[4])]++; draws++; return; }
      for (let i = start; i <= 47 - (5 - depth); i++) { cards[depth] = deck[i]; rec(i + 1, depth + 1); }
    };
    if (k === 0) { counts[classify(cards[0], cards[1], cards[2], cards[3], cards[4])]++; draws = 1; } else rec(0, h);
    const ev = counts.reduce((s, n, i) => s + n * pays[i], 0) / draws;
    out.push({ mask, held, ev, counts, draws });
  }
  return out.sort((x, y) => y.ev - x.ev || y.held.length - x.held.length);
}
