/**
 * Poker hand evaluator for 5, 6 or 7 cards. Returns one number per hand so
 * that a bigger number always beats a smaller one: the category (high card up
 * to straight flush) in the top bits, then up to five kicker ranks, 4 bits each.
 * No lookup tables: rank counts and per-suit bit masks, so it is small and
 * still fast enough to compare a couple of million hands a second.
 */
export const CATEGORY_NAMES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
export const CATEGORY_HELP = [
  'No pair: your highest card plays.',
  'Two cards of the same rank.',
  'Two different pairs.',
  'Three cards of the same rank.',
  'Five cards in a row, any suits (A-2-3-4-5 counts too).',
  'Five cards of the same suit.',
  'Three of a kind plus a pair.',
  'All four cards of one rank.',
  'Five in a row, all the same suit.',
];

const counts = new Int8Array(13);
const suitMask = new Int32Array(4);

/** Highest card of a straight in a 13-bit rank mask (3 means the 5-high wheel), or -1. */
export function straightHigh(mask: number): number {
  // Bit 0 of `m` is the ace playing low; bits 1..13 are 2..A.
  const m = (mask << 1) | ((mask >> 12) & 1);
  for (let h = 13; h >= 4; h--) if (((m >> (h - 4)) & 31) === 31) return h - 1;
  return -1;
}

const pack = (cat: number, k: number[]) => {
  let v = cat;
  for (let i = 0; i < 5; i++) v = v * 16 + (k[i] ?? 0);
  return v;
};

export function evaluate(cards: ArrayLike<number>, n = cards.length): number {
  counts.fill(0); suitMask.fill(0);
  let all = 0;
  for (let i = 0; i < n; i++) {
    const c = cards[i], r = c >> 2;
    counts[r]++; suitMask[c & 3] |= 1 << r; all |= 1 << r;
  }
  for (let s = 0; s < 4; s++) {
    const m = suitMask[s];
    if (popcount(m) >= 5) {
      const sf = straightHigh(m);
      if (sf >= 0) return pack(8, [sf]);
      const top: number[] = [];
      for (let r = 12; r >= 0 && top.length < 5; r--) if (m & (1 << r)) top.push(r);
      // Quads or a full house beat a flush, and 7 cards can hold both.
      const q = madeWithoutFlush(all);
      return q >= pack(6, []) ? q : pack(5, top);
    }
  }
  return madeWithoutFlush(all);
}

function madeWithoutFlush(all: number): number {
  let quad = -1, trips = -1, trips2 = -1, p1 = -1, p2 = -1, p3 = -1;
  for (let r = 12; r >= 0; r--) {
    const k = counts[r];
    if (k === 4) quad = r;
    else if (k === 3) { if (trips < 0) trips = r; else if (trips2 < 0) trips2 = r; }
    else if (k === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; else if (p3 < 0) p3 = r; }
  }
  const kick = (skip: number[], n: number) => {
    const out: number[] = [];
    for (let r = 12; r >= 0 && out.length < n; r--) if (counts[r] && !skip.includes(r)) out.push(r);
    return out;
  };
  if (quad >= 0) return pack(7, [quad, ...kick([quad], 1)]);
  if (trips >= 0 && (trips2 >= 0 || p1 >= 0)) return pack(6, [trips, Math.max(trips2, p1)]);
  const st = straightHigh(all);
  if (st >= 0) return pack(4, [st]);
  if (trips >= 0) return pack(3, [trips, ...kick([trips], 2)]);
  if (p2 >= 0) return pack(2, [p1, p2, ...kick([p1, p2], 1)]);
  if (p1 >= 0) return pack(1, [p1, ...kick([p1], 3)]);
  return pack(0, kick([], 5));
}

export const categoryOf = (v: number) => Math.floor(v / 16 ** 5);

function popcount(x: number): number {
  x -= (x >> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  return (((x + (x >> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Plain-words name of a made hand, like "Pair of Kings" or "Ace-high flush". */
export function handName(v: number): string {
  const cat = categoryOf(v);
  const k = [4, 3, 2, 1, 0].map((i) => Math.floor(v / 16 ** i) % 16);
  const R = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];
  const r1 = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
  switch (cat) {
    case 0: return `${r1[k[0]]}-high`;
    case 1: return `Pair of ${R[k[0]]}`;
    case 2: return `Two pair, ${R[k[0]]} and ${R[k[1]]}`;
    case 3: return `Three ${R[k[0]]}`;
    case 4: return `${r1[k[0]]}-high straight`;
    case 5: return `${r1[k[0]]}-high flush`;
    case 6: return `Full house, ${R[k[0]]} full of ${R[k[1]]}`;
    case 7: return `Four ${R[k[0]]}`;
    default: return k[0] === 12 ? 'Royal flush' : `${r1[k[0]]}-high straight flush`;
  }
}
