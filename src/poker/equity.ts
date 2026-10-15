/**
 * All-in equity: how often your hand wins (ties split) if every card were
 * dealt out now. One opponent is enumerated exactly when that is cheap
 * enough (every possible opponent hand times every way to finish the board);
 * otherwise, or with more opponents, a Monte Carlo run deals random
 * finishes. Pure functions, run in the Web Worker by the app.
 */
import { evaluate } from './eval';
import { combosOf, type Range } from './range';

export interface EquityInput {
  hero: number[];
  board: number[];
  dead: number[];
  opponents: number;
  /** The opponents' range; null means any two cards. */
  range: Range | null;
}
export interface EquityResult {
  win: number; tie: number; lose: number;
  /** Win plus your share of ties, 0..1. */
  equity: number;
  method: 'exact' | 'monte-carlo';
  trials: number;
  /** How often you end with each hand category (0 = high card .. 8 = straight flush). */
  categories: number[];
  /** True when the opponent range has no hand left that fits the known cards. */
  impossible?: boolean;
}

/** Cheap pseudo-random numbers with a seed, so tests are repeatable. */
export function rng(seed = 1): () => number {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function choose(n: number, k: number): number { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return Math.round(r); }

/** Opponent hands that fit the cards already used, from the range (or all hands). */
export function villainCombos(range: Range | null, used: Set<number>): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < 169; k++) {
    if (range && !range[k]) continue;
    for (const c of combosOf(k)) if (!used.has(c[0]) && !used.has(c[1])) out.push(c);
  }
  return out;
}

/** How much work exact enumeration would take for this spot (hand comparisons). */
export function exactCost(inp: EquityInput): number {
  if (inp.opponents !== 1) return Infinity;
  const used = new Set([...inp.hero, ...inp.board, ...inp.dead]);
  const v = villainCombos(inp.range, used).length;
  return v * choose(52 - used.size - 2, 5 - inp.board.length);
}

export const EXACT_LIMIT = 1_200_000;

export function validate(inp: EquityInput): string | null {
  const all = [...inp.hero, ...inp.board, ...inp.dead];
  if (inp.hero.length !== 2) return 'Pick your two cards first.';
  if (![0, 3, 4, 5].includes(inp.board.length)) return 'The board needs 0, 3, 4 or 5 cards (none, the flop, the turn or the river).';
  if (new Set(all).size !== all.length) return 'The same card is picked twice.';
  if (inp.opponents < 1 || inp.opponents > 9) return 'Pick 1 to 9 opponents.';
  if (52 - all.length < 2 * inp.opponents + 5 - inp.board.length) return 'Not enough cards left in the deck for that many opponents.';
  return null;
}

const blank = (method: EquityResult['method']): EquityResult => ({ win: 0, tie: 0, lose: 0, equity: 0, method, trials: 0, categories: new Array(9).fill(0) });

function finish(r: EquityResult, eqSum: number): EquityResult {
  const t = r.trials || 1;
  r.equity = eqSum / t; r.win /= t; r.tie /= t; r.lose /= t;
  r.categories = r.categories.map((c) => c / t);
  return r;
}

/** Exact enumeration for one opponent. */
export function exactEquity(inp: EquityInput): EquityResult {
  const used = new Set([...inp.hero, ...inp.board, ...inp.dead]);
  const villains = villainCombos(inp.range, used);
  const r = blank('exact');
  if (!villains.length) return { ...r, impossible: true };
  const need = 5 - inp.board.length;
  const deck = Array.from({ length: 52 }, (_, i) => i).filter((c) => !used.has(c));
  const h = new Int32Array(7), v = new Int32Array(7);
  h[0] = inp.hero[0]; h[1] = inp.hero[1];
  inp.board.forEach((c, i) => { h[2 + i] = c; v[2 + i] = c; });
  const b0 = 2 + inp.board.length;
  let eqSum = 0;
  const idx = new Int32Array(need);
  for (const [a, b] of villains) {
    v[0] = a; v[1] = b;
    const rest = deck.filter((c) => c !== a && c !== b);
    const n = rest.length;
    // Walk every `need`-card subset of the rest of the deck.
    for (let i = 0; i < need; i++) idx[i] = i;
    for (;;) {
      for (let i = 0; i < need; i++) { h[b0 + i] = rest[idx[i]]; v[b0 + i] = rest[idx[i]]; }
      const hv = evaluate(h, 7);
      r.categories[Math.floor(hv / 1048576)]++;
      const vv = evaluate(v, 7);
      r.trials++;
      if (hv > vv) { r.win++; eqSum++; } else if (hv === vv) { r.tie++; eqSum += 0.5; } else r.lose++;
      if (need === 0) break;
      let i = need - 1;
      while (i >= 0 && idx[i] === n - need + i) i--;
      if (i < 0) break;
      idx[i]++;
      for (let j = i + 1; j < need; j++) idx[j] = idx[j - 1] + 1;
    }
  }
  return finish(r, eqSum);
}

/** Monte Carlo: deal `trials` random finishes. `onProgress` gets the running result now and then. */
export function monteCarlo(inp: EquityInput, trials: number, rand: () => number = Math.random, onProgress?: (r: EquityResult, done: number) => void): EquityResult {
  const used = new Set([...inp.hero, ...inp.board, ...inp.dead]);
  const villains = villainCombos(inp.range, used);
  const r = blank('monte-carlo');
  if (!villains.length) return { ...r, impossible: true };
  const deck = Array.from({ length: 52 }, (_, i) => i).filter((c) => !used.has(c));
  const taken = new Uint8Array(52);
  const need = 5 - inp.board.length;
  const hero = new Int32Array(7), opp = new Int32Array(7);
  hero[0] = inp.hero[0]; hero[1] = inp.hero[1];
  inp.board.forEach((c, i) => { hero[2 + i] = c; });
  let eqSum = 0;
  const vals: number[] = new Array(inp.opponents);
  for (let t = 0; t < trials; t++) {
    taken.fill(0);
    let ok = true;
    // Opponents first: each picks a hand from the range that doesn't clash with the others.
    const hands: [number, number][] = [];
    for (let o = 0; o < inp.opponents && ok; o++) {
      let tries = 0, pick: [number, number];
      do { pick = villains[Math.floor(rand() * villains.length)]; } while ((taken[pick[0]] || taken[pick[1]]) && ++tries < 60);
      if (taken[pick[0]] || taken[pick[1]]) ok = false;
      else { taken[pick[0]] = taken[pick[1]] = 1; hands.push(pick); }
    }
    if (!ok) continue;
    for (let i = 0; i < need; i++) {
      let c: number;
      do { c = deck[Math.floor(rand() * deck.length)]; } while (taken[c]);
      taken[c] = 1; hero[2 + inp.board.length + i] = c;
    }
    for (let i = 2; i < 7; i++) opp[i] = hero[i];
    const hv = evaluate(hero, 7);
    r.categories[Math.floor(hv / 1048576)]++;
    let best = 0, tied = 0;
    for (let o = 0; o < hands.length; o++) {
      opp[0] = hands[o][0]; opp[1] = hands[o][1];
      vals[o] = evaluate(opp, 7);
      if (vals[o] > best) best = vals[o];
    }
    r.trials++;
    if (hv > best) { r.win++; eqSum++; }
    else if (hv === best) { for (let o = 0; o < hands.length; o++) if (vals[o] === best) tied++; r.tie++; eqSum += 1 / (tied + 1); }
    else r.lose++;
    if (onProgress && (t + 1) % 20000 === 0) onProgress(finish({ ...r, categories: r.categories.slice() }, eqSum), t + 1);
  }
  return finish(r, eqSum);
}

/** Exact when cheap, Monte Carlo otherwise. */
export function equity(inp: EquityInput, trials = 150_000, rand?: () => number, onProgress?: (r: EquityResult, done: number) => void): EquityResult {
  return exactCost(inp) <= EXACT_LIMIT ? exactEquity(inp) : monteCarlo(inp, trials, rand, onProgress);
}
