/**
 * The decision helper and the game-theory numbers, all in chips.
 *
 * A simplified model, not a solver: it assumes your equity is what you win
 * on average if the hand goes to showdown, that a call ends the betting, and
 * that a raise is either folded to (with the fold chance you set) or called,
 * never re-raised. Real play has more streets and more choices; the point is
 * to show how pot odds, equity and fold equity combine into expected value.
 */
export interface Spot {
  /** Chips in the middle now, including the bet you face. */
  pot: number;
  /** Chips you must add to call (0 if nobody has bet). */
  toCall: number;
  /** Your raise (or bet) size: the total you would put in now. */
  raiseTo: number;
  /** How often the opponent folds to your raise, 0..1. */
  foldChance: number;
  /** Extra chips you expect to win later when you hit (implied odds). */
  implied: number;
  /** Your all-in equity, 0..1. */
  equity: number;
}

export type Action = 'fold' | 'check' | 'call' | 'bet' | 'raise';
export interface Choice { action: Action; ev: number; note: string }
export interface Decision { choices: Choice[]; best: Choice; potOdds: number; needed: number; neededImplied: number; why: string }

const r1 = (x: number) => Math.round(x * 10) / 10;
const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

/** Equity you need to call: call / (pot after you call). */
export const potOdds = (pot: number, toCall: number) => (toCall <= 0 ? 0 : toCall / (pot + toCall));

/** EV of calling, measured from now (folding is 0). */
export const evCall = (s: Pick<Spot, 'pot' | 'toCall' | 'equity'>) => s.equity * s.pot - (1 - s.equity) * s.toCall;

/** EV of raising to `raiseTo`: they fold (you take the pot) or call (you play for the bigger pot). */
export function evRaise(s: Spot): number {
  const callAmount = Math.max(0, s.raiseTo - s.toCall);
  const finalPot = s.pot + s.raiseTo + callAmount;
  const whenCalled = s.equity * finalPot - s.raiseTo;
  return s.foldChance * s.pot + (1 - s.foldChance) * whenCalled;
}

export function decide(s: Spot): Decision {
  const choices: Choice[] = [];
  const po = potOdds(s.pot, s.toCall);
  const needImplied = s.toCall <= 0 ? 0 : s.toCall / (s.pot + s.toCall + s.implied);
  if (s.toCall > 0) {
    choices.push({ action: 'fold', ev: 0, note: 'You put nothing more in and win nothing more.' });
    const ev = evCall(s);
    choices.push({ action: 'call', ev, note: `You win the ${r1(s.pot)} pot ${pct(s.equity)} of the time and lose your ${r1(s.toCall)} the rest.` });
  } else {
    // Checking keeps your share of the pot: equity x pot (still measured from now).
    choices.push({ action: 'check', ev: s.equity * s.pot, note: 'Nobody adds chips; on average you win your equity share of the pot.' });
  }
  if (s.raiseTo > s.toCall) {
    choices.push({ action: s.toCall > 0 ? 'raise' : 'bet', ev: evRaise(s), note: `They fold ${pct(s.foldChance)} of the time (you take the pot); otherwise they call and you play for a pot of ${r1(s.pot + 2 * s.raiseTo - s.toCall)}.` });
  }
  const best = choices.reduce((a, b) => (b.ev > a.ev + 1e-9 ? b : a));
  let why: string;
  if (s.toCall > 0) {
    why = s.equity >= po
      ? `You have ${pct(s.equity)} equity and need only ${pct(po)} to call, so calling makes money in the long run.`
      : s.equity + 1e-9 >= needImplied
        ? `You need ${pct(po)} but have ${pct(s.equity)}. With the ${r1(s.implied)} extra you expect to win when you hit, you only need ${pct(needImplied)}, so a call can still pay.`
        : `You need ${pct(po)} equity to call but have only ${pct(s.equity)}, so calling loses chips over time.`;
  } else why = `No bet to call. Betting is worth it when fold equity plus your equity beats just checking.`;
  if (best.action === 'raise' || best.action === 'bet') why += ` A ${best.action} does best here (EV ${r1(best.ev)}), mostly thanks to ${s.foldChance > 0.25 ? 'the chance they fold' : 'your strong equity'}.`;
  return { choices, best, potOdds: po, needed: po, neededImplied: needImplied, why };
}

/**
 * Minimum defense frequency: facing a bet B into pot P, the defender must
 * continue with P / (P + B) of their range, or a bluff with any two cards
 * makes money.
 */
export const mdf = (pot: number, bet: number) => (bet <= 0 ? 1 : pot / (pot + bet));

/**
 * Balanced bluffing: on the last bet, if B goes into P, making the caller
 * indifferent takes bluffs in B / (P + 2B) of your betting range. Their
 * call costs B to win P + B, so they need B / (P + 2B) equity.
 */
export const bluffShare = (pot: number, bet: number) => (bet <= 0 ? 0 : bet / (pot + 2 * bet));
/** Bluffs per value bet in a balanced range. */
export const bluffsPerValue = (pot: number, bet: number) => (bet <= 0 ? 0 : bet / (pot + bet));
