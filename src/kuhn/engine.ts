/**
 * Kuhn poker: the smallest real poker game, solved exactly.
 *
 * Three cards (Jack, Queen, King), two players, one card each. Both put in 1
 * chip (the ante). Player 1 checks or bets 1. If player 1 bets, player 2 calls
 * or folds. If player 1 checks, player 2 checks (show down for the pot) or
 * bets 1, and then player 1 calls or folds. The higher card wins a showdown.
 *
 * A strategy is a probability for each choice at each card. Every expected
 * value here is exact: it averages the six equally likely deals.
 */
export const KUHN_CARDS = ['J', 'Q', 'K'] as const;
export const KUHN_NAMES = ['Jack', 'Queen', 'King'] as const;
export type KCard = 0 | 1 | 2;

/** Player 1: chance to bet first, and chance to call if they check and player 2 bets. */
export interface P1Strategy { bet: [number, number, number]; call: [number, number, number] }
/** Player 2: chance to call a bet, and chance to bet after a check. */
export interface P2Strategy { call: [number, number, number]; bet: [number, number, number] }

/** The game's value for player 1 under any Nash equilibrium: −1/18 of a chip per hand. */
export const GAME_VALUE = -1 / 18;

/**
 * The Nash equilibria. Player 1 picks a bluffing rate alpha between 0 and 1/3:
 * bet the Jack alpha of the time, never bet the Queen, bet the King 3×alpha,
 * call with the Queen alpha + 1/3 of the time. Player 2 has one strategy:
 * call with the King, call with the Queen 1/3 of the time, and after a check
 * bet the King always and bluff the Jack 1/3 of the time.
 */
export function nashP1(alpha = 1 / 6): P1Strategy {
  const a = Math.max(0, Math.min(1 / 3, alpha));
  return { bet: [a, 0, 3 * a], call: [0, a + 1 / 3, 1] };
}
export const nashP2 = (): P2Strategy => ({ call: [0, 1 / 3, 1], bet: [1 / 3, 0, 1] });

const DEALS: [KCard, KCard][] = [[0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1]];
const sd = (x: KCard, y: KCard) => (x > y ? 1 : -1);

/** Player 1's value for one deal (x for player 1, y for player 2). */
export function dealValue(x: KCard, y: KCard, s1: P1Strategy, s2: P2Strategy): number {
  const b = s1.bet[x], c2 = s2.call[y], b2 = s2.bet[y], c1 = s1.call[x];
  const afterBet = c2 * 2 * sd(x, y) + (1 - c2) * 1;
  const afterCheck = b2 * (c1 * 2 * sd(x, y) + (1 - c1) * -1) + (1 - b2) * sd(x, y);
  return b * afterBet + (1 - b) * afterCheck;
}

/** Player 1's exact expected value per hand. */
export const value = (s1: P1Strategy, s2: P2Strategy) => DEALS.reduce((a, [x, y]) => a + dealValue(x, y, s1, s2), 0) / 6;

/** Player 1's best reply to a fixed player 2, and what it earns. */
export function bestP1(s2: P2Strategy): { strategy: P1Strategy; value: number } {
  const st: P1Strategy = { bet: [0, 0, 0], call: [0, 0, 0] };
  let total = 0;
  for (const x of [0, 1, 2] as KCard[]) {
    const ys = ([0, 1, 2] as KCard[]).filter((y) => y !== x);
    let callV = 0, foldV = 0, betV = 0, checkBase = 0;
    for (const y of ys) {
      const c2 = s2.call[y], b2 = s2.bet[y];
      betV += c2 * 2 * sd(x, y) + (1 - c2);
      callV += b2 * 2 * sd(x, y); foldV += b2 * -1;
      checkBase += (1 - b2) * sd(x, y);
    }
    const callBest = callV > foldV + 1e-12 ? 1 : 0;
    st.call[x] = callBest;
    const checkV = checkBase + Math.max(callV, foldV);
    st.bet[x] = betV > checkV + 1e-12 ? 1 : 0;
    total += Math.max(betV, checkV);
  }
  return { strategy: st, value: total / 6 };
}

/** Player 2's best reply to a fixed player 1, and player 1's value against it. */
export function bestP2(s1: P1Strategy): { strategy: P2Strategy; value: number } {
  const st: P2Strategy = { call: [0, 0, 0], bet: [0, 0, 0] };
  let p2 = 0;
  for (const y of [0, 1, 2] as KCard[]) {
    const xs = ([0, 1, 2] as KCard[]).filter((x) => x !== y);
    let callV = 0, foldV = 0, betV = 0, checkV = 0;
    for (const x of xs) {
      const b = s1.bet[x], c1 = s1.call[x];
      callV += b * 2 * -sd(x, y); foldV += b * -1;
      betV += (1 - b) * (c1 * 2 * -sd(x, y) + (1 - c1) * 1);
      checkV += (1 - b) * -sd(x, y);
    }
    st.call[y] = callV > foldV + 1e-12 ? 1 : 0;
    st.bet[y] = betV > checkV + 1e-12 ? 1 : 0;
    p2 += Math.max(callV, foldV) + Math.max(betV, checkV);
  }
  return { strategy: st, value: -p2 / 6 };
}

/** How much a best reply wins from each side above the game's value (0 for a Nash strategy). */
export const exploitP1 = (s1: P1Strategy) => GAME_VALUE - bestP2(s1).value;
export const exploitP2 = (s2: P2Strategy) => bestP1(s2).value - GAME_VALUE;

export type KAction = 'check' | 'bet' | 'call' | 'fold';
/** Where a hand is: '' (player 1 to act), 'b' (2 to answer a bet), 'k' (2 after a check), 'kb' (1 to answer a bet). */
export type KHistory = '' | 'b' | 'k' | 'kb';
export const toAct = (h: KHistory): 1 | 2 => (h === '' || h === 'kb' ? 1 : 2);
export const choices = (h: KHistory): KAction[] => (h === '' || h === 'k' ? ['check', 'bet'] : ['fold', 'call']);

/**
 * The exact EV (for the player to act, in chips, counting the ante as already
 * in the pot) of each choice with this card, when the other player follows
 * their strategy and you play your best afterwards.
 */
export function actionValues(card: KCard, h: KHistory, s1: P1Strategy, s2: P2Strategy): Record<string, number> {
  const others = ([0, 1, 2] as KCard[]).filter((o) => o !== card);
  if (h === '') {
    // Player 1. Weights are equal: each other card is equally likely.
    let bet = 0, check = 0;
    let callV = 0, foldV = 0, base = 0;
    for (const y of others) {
      bet += s2.call[y] * 2 * sd(card, y) + (1 - s2.call[y]);
      callV += s2.bet[y] * 2 * sd(card, y); foldV -= s2.bet[y];
      base += (1 - s2.bet[y]) * sd(card, y);
    }
    check = base + Math.max(callV, foldV);
    return { check: check / 2, bet: bet / 2 };
  }
  if (h === 'kb') {
    // Player 1 after check, bet: weight each card by how often player 2 bets it.
    const w = others.map((y) => s2.bet[y]);
    const tw = w[0] + w[1];
    const ws = tw > 0 ? w.map((x) => x / tw) : [0.5, 0.5];
    return { fold: -1, call: others.reduce<number>((a, y, i) => a + ws[i] * 2 * sd(card, y), 0) };
  }
  if (h === 'b') {
    const w = others.map((x) => s1.bet[x]);
    const tw = w[0] + w[1];
    const ws = tw > 0 ? w.map((x) => x / tw) : [0.5, 0.5];
    return { fold: -1, call: others.reduce<number>((a, x, i) => a + ws[i] * 2 * -sd(x, card), 0) };
  }
  // h === 'k': player 2 after a check.
  const w = others.map((x) => 1 - s1.bet[x]);
  const tw = w[0] + w[1];
  const ws = tw > 0 ? w.map((x) => x / tw) : [0.5, 0.5];
  let check = 0, bet = 0;
  others.forEach((x, i) => {
    check += ws[i] * -sd(x, card);
    const c1 = s1.call[x];
    bet += ws[i] * (c1 * 2 * -sd(x, card) + (1 - c1));
  });
  return { check, bet };
}

/** Chips won by player 1 when a hand ends. Returns null while it goes on. */
export function settle(x: KCard, y: KCard, h: string): number | null {
  switch (h) {
    case 'kk': return sd(x, y);
    case 'bc': case 'kbc': return 2 * (x > y ? 1 : -1);
    case 'bf': return 1;
    case 'kbf': return -1;
    default: return null;
  }
}
const CODE: Record<KAction, string> = { check: 'k', bet: 'b', call: 'c', fold: 'f' };
export const step = (h: string, a: KAction) => h + CODE[a];

/** Pick an action with a strategy's probabilities (r is a random number in [0, 1)). */
export function sample(card: KCard, h: KHistory, s1: P1Strategy, s2: P2Strategy, r: number): KAction {
  const p = h === '' ? s1.bet[card] : h === 'kb' ? s1.call[card] : h === 'b' ? s2.call[card] : s2.bet[card];
  const [no, yes] = choices(h);
  return r < p ? yes : no;
}
