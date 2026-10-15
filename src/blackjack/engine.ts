/**
 * Exact blackjack expected values. Card ranks are 1..10 (1 is the ace, 10
 * covers 10, J, Q and K). A shoe is a count of each rank still in it.
 *
 * How exact: the dealer's hand is worked out card by card with every drawn
 * card removed from the shoe, so the dealer's chances are exact for the shoe
 * after your two cards and the upcard are taken out. Your own later draws use
 * that same shoe (they don't remove each other), the usual way strategy
 * calculators keep this fast; the difference is a few hundredths of a percent.
 * Splitting is allowed once (no resplits); split aces get one card each.
 */
export interface Rules {
  decks: number;
  /** Dealer hits soft 17 (H17) instead of standing (S17). */
  h17: boolean;
  /** Double after split. */
  das: boolean;
  /** Late surrender: give up half the bet after the dealer checks for blackjack. */
  surrender: boolean;
  /** What a blackjack pays per unit bet: 1.5 for 3:2, 1.2 for 6:5. */
  bjPays: number;
  /** The dealer peeks for blackjack with an ace or ten showing (US style). */
  peek: boolean;
}
export const DEFAULT_RULES: Rules = { decks: 6, h17: false, das: true, surrender: true, bjPays: 1.5, peek: true };

export type ActionId = 'stand' | 'hit' | 'double' | 'split' | 'surrender';
export const ACTION_LABELS: Record<ActionId, string> = { stand: 'Stand', hit: 'Hit', double: 'Double', split: 'Split', surrender: 'Surrender' };

export type Shoe = number[];
export const freshShoe = (decks: number): Shoe => [0, ...Array.from({ length: 10 }, (_, i) => (i === 9 ? 16 : 4) * decks)];
export const shoeSize = (s: Shoe) => s.reduce((a, b) => a + b, 0);
export const rankLabel = (r: number) => (r === 1 ? 'A' : String(r));

/** Value of a hand from its hard sum and whether it holds an ace. */
export const handValue = (hard: number, ace: boolean) => (ace && hard + 10 <= 21 ? hard + 10 : hard);
export const isSoft = (hard: number, ace: boolean) => ace && hard + 10 <= 21;

/** Dealer final totals: index 0..4 for 17..21, 5 for bust, 6 for blackjack. */
export type DealerDist = number[];

/** The dealer's chances of each final total, drawing from `shoe` (upcard already removed). */
export function dealerDist(shoe: Shoe, up: number, h17: boolean): DealerDist {
  const s = shoe.slice();
  const memo = new Map<string, DealerDist>();
  const drawn = new Array(11).fill(0);
  const go = (hard: number, ace: boolean, n: number): DealerDist => {
    const v = handValue(hard, ace);
    if (n === 2 && v === 21) return [0, 0, 0, 0, 0, 0, 1];
    if (v > 21) return [0, 0, 0, 0, 0, 1, 0];
    if (v >= 17 && !(h17 && v === 17 && isSoft(hard, ace))) { const d = [0, 0, 0, 0, 0, 0, 0]; d[v - 17] = 1; return d; }
    const key = drawn.join(',');
    const hit = memo.get(key);
    if (hit) return hit;
    const total = shoeSize(s);
    const out = [0, 0, 0, 0, 0, 0, 0];
    for (let r = 1; r <= 10; r++) {
      if (!s[r]) continue;
      const p = s[r] / total;
      s[r]--; drawn[r]++;
      const sub = go(hard + r, ace || r === 1, n + 1);
      s[r]++; drawn[r]--;
      for (let k = 0; k < 7; k++) out[k] += p * sub[k];
    }
    memo.set(key, out);
    return out;
  };
  return go(up, up === 1, 1);
}

export interface HandEVs {
  /** Expected value of each allowed action, per unit bet. */
  ev: Partial<Record<ActionId, number>>;
  best: ActionId;
  /** Best action if doubling and surrender are not allowed (what a "D" or "R" falls back to). */
  fallback: ActionId;
  /** Player blackjack: the hand is paid, there is nothing to decide. */
  blackjack: boolean;
  /** Chance the dealer has blackjack (before any peek). */
  dealerBJ: number;
}

/**
 * Expected value of each action for a two-card hand against an upcard.
 * With peek, values assume the dealer has already checked and has no blackjack,
 * like every printed strategy chart. Without peek, a dealer blackjack also
 * takes your double and split bets.
 */
export function handEVs(c1: number, c2: number, up: number, rules: Rules, shoeIn?: Shoe): HandEVs {
  const shoe = (shoeIn ?? freshShoe(rules.decks)).slice();
  for (const c of [c1, c2, up]) shoe[c] = Math.max(0, shoe[c] - 1);
  const d = dealerDist(shoe, up, rules.h17);
  const bj = d[6];
  const cond = bj < 1 ? d.slice(0, 6).map((x) => x / (1 - bj)) : [0, 0, 0, 0, 0, 1];
  const N = shoeSize(shoe);
  const p = shoe.map((c) => c / N);

  const stand = (v: number) => {
    if (v > 21) return -1;
    let ev = cond[5];
    for (let t = 17; t <= 21; t++) ev += t < v ? cond[t - 17] : t > v ? -cond[t - 17] : 0;
    return ev;
  };
  const memo = new Map<number, number>();
  const bestPlay = (hard: number, ace: boolean): number => {
    if (hard > 21) return -1;
    const key = hard * 2 + (ace ? 1 : 0);
    const m = memo.get(key);
    if (m !== undefined) return m;
    const v = Math.max(stand(handValue(hard, ace)), hitEV(hard, ace));
    memo.set(key, v);
    return v;
  };
  function hitEV(hard: number, ace: boolean): number {
    return sumOver((r) => (hard + r > 21 ? -1 : bestPlay(hard + r, ace || r === 1)));
  }
  const sumOver = (f: (r: number) => number) => { let s = 0; for (let r = 1; r <= 10; r++) if (p[r]) s += p[r] * f(r); return s; };
  const doubleEV = (hard: number, ace: boolean) => 2 * sumOver((r) => (hard + r > 21 ? -1 : stand(handValue(hard + r, ace || r === 1))));

  const hard = c1 + c2, ace = c1 === 1 || c2 === 1;
  const blackjack = ace && hard === 11;
  const ev: Partial<Record<ActionId, number>> = {};
  const atRisk: Partial<Record<ActionId, number>> = { stand: 1, hit: 1, double: 2, split: 2, surrender: 1 };
  if (blackjack) {
    ev.stand = rules.peek ? rules.bjPays : rules.bjPays * (1 - bj);
    return { ev, best: 'stand', fallback: 'stand', blackjack: true, dealerBJ: bj };
  }
  ev.stand = stand(handValue(hard, ace));
  ev.hit = hitEV(hard, ace);
  ev.double = doubleEV(hard, ace);
  if (c1 === c2) {
    const one = c1 === 1
      ? sumOver((r) => stand(handValue(1 + r, true)))
      : sumOver((r) => {
        const h = c1 + r, a = c1 === 1 || r === 1;
        const options = [stand(handValue(h, a)), hitEV(h, a)];
        if (rules.das) options.push(doubleEV(h, a));
        return Math.max(...options);
      });
    ev.split = 2 * one;
  }
  if (rules.surrender && rules.peek) ev.surrender = -0.5;
  if (!rules.peek && bj > 0) for (const k of Object.keys(ev) as ActionId[]) ev[k] = bj * -(atRisk[k] ?? 1) + (1 - bj) * ev[k]!;
  const order: ActionId[] = ['stand', 'hit', 'double', 'split', 'surrender'];
  const pick = (ids: ActionId[]) => ids.filter((k) => ev[k] !== undefined).reduce((a, b) => (ev[b]! > ev[a]! + 1e-12 ? b : a));
  return { ev, best: pick(order), fallback: pick(['stand', 'hit', ...(c1 === c2 ? ['split' as const] : [])]), blackjack: false, dealerBJ: bj };
}

/**
 * The player's expected result per hand over the whole game, playing the best
 * action every time (insurance never taken). House edge is minus this.
 */
export function gameEV(rules: Rules): number {
  const shoe = freshShoe(rules.decks);
  const N = shoeSize(shoe);
  let total = 0;
  for (let a = 1; a <= 10; a++) for (let b = a; b <= 10; b++) for (let up = 1; up <= 10; up++) {
    const s = shoe.slice();
    let pr = s[a] / N; s[a]--;
    pr *= s[b] / (N - 1); s[b]--;
    pr *= s[up] / (N - 2);
    if (a !== b) pr *= 2;
    if (!pr) continue;
    const h = handEVs(a, b, up, rules);
    const best = h.ev[h.best]!;
    // With peek, a dealer blackjack ends the hand first: you lose 1, or push with your own blackjack.
    total += pr * (rules.peek ? h.dealerBJ * (h.blackjack ? 0 : -1) + (1 - h.dealerBJ) * best : best);
  }
  return total;
}

/** Strategy chart codes: H hit, S stand, D double (else hit), Ds double (else stand), P split, R surrender (else hit), Rs surrender (else stand), Rp surrender (else split). */
export type Code = 'H' | 'S' | 'D' | 'Ds' | 'P' | 'R' | 'Rs' | 'Rp';
export const CODE_HELP: Record<Code, string> = {
  H: 'Hit', S: 'Stand', D: 'Double if allowed, otherwise hit', Ds: 'Double if allowed, otherwise stand', P: 'Split',
  R: 'Surrender if allowed, otherwise hit', Rs: 'Surrender if allowed, otherwise stand', Rp: 'Surrender if allowed, otherwise split',
};
export function codeFor(h: HandEVs): Code {
  const fb = h.fallback;
  switch (h.best) {
    case 'double': return fb === 'stand' ? 'Ds' : 'D';
    case 'surrender': return fb === 'stand' ? 'Rs' : fb === 'split' ? 'Rp' : 'R';
    case 'split': return 'P';
    case 'stand': return 'S';
    default: return 'H';
  }
}

export interface ChartRow { label: string; cards: [number, number]; codes: Code[]; evs: HandEVs[] }
export interface Chart { hard: ChartRow[]; soft: ChartRow[]; pairs: ChartRow[] }
/** Upcards in chart order: 2..10 then A. */
export const UPCARDS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1];

export function strategyChart(rules: Rules): Chart {
  const row = (label: string, cards: [number, number]): ChartRow => {
    const evs = UPCARDS.map((u) => handEVs(cards[0], cards[1], u, rules));
    return { label, cards, evs, codes: evs.map(codeFor) };
  };
  const hardCards: Record<number, [number, number]> = { 7: [2, 5], 8: [2, 6], 9: [2, 7], 10: [2, 8], 11: [2, 9], 12: [10, 2], 13: [10, 3], 14: [10, 4], 15: [10, 5], 16: [10, 6], 17: [10, 7] };
  return {
    hard: Object.entries(hardCards).map(([t, c]) => row(t === '7' ? '5–7' : t === '17' ? '17+' : t, c)),
    soft: [2, 3, 4, 5, 6, 7, 8, 9].map((r) => row(`A,${r}`, [1, r])),
    pairs: [2, 3, 4, 5, 6, 7, 8, 9, 10, 1].map((r) => row(`${rankLabel(r)},${rankLabel(r)}`, [r, r])),
  };
}
