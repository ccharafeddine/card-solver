/**
 * A real shuffled shoe for the trainer: deals cards one at a time, keeps the
 * Hi-Lo running count, and reshuffles at the cut card (75% dealt).
 */
import { hiLo, trueCount } from './counting';
import { handValue, type Rules, type ActionId } from './engine';

export class Shoe {
  cards: number[] = [];
  pos = 0;
  running = 0;
  shuffles = 0;
  constructor(private decks: number, private rand: () => number = Math.random) { this.shuffle(); }

  shuffle() {
    this.cards = [];
    for (let d = 0; d < this.decks; d++) for (let r = 1; r <= 13; r++) for (let s = 0; s < 4; s++) this.cards.push(Math.min(r, 10));
    for (let i = this.cards.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]]; }
    this.pos = 0; this.running = 0; this.shuffles++;
  }
  get left() { return this.cards.length - this.pos; }
  get needsShuffle() { return this.pos >= this.cards.length * 0.75; }
  get trueCount() { return trueCount(this.running, this.left); }
  /** The counts of each rank still in the shoe (index 1..10), for exact EVs at this point. */
  remaining(): number[] {
    const r = new Array(11).fill(0);
    for (let i = this.pos; i < this.cards.length; i++) r[this.cards[i]]++;
    return r;
  }
  /** Deal a card. A face-down card (the dealer's hole card) is counted only when `see` is called. */
  deal(faceUp = true): number {
    if (this.pos >= this.cards.length) this.shuffle();
    const c = this.cards[this.pos++];
    if (faceUp) this.running += hiLo(c);
    return c;
  }
  see(c: number) { this.running += hiLo(c); }
}

export interface PlayedHand { cards: number[]; bet: number; result: number; note: string }

/** Draw for one hand following a simple rule (hit below 17, or below 12 against a weak dealer card). */
function finishHand(cards: number[], up: number, shoe: Shoe): void {
  for (;;) {
    const hard = cards.reduce((a, b) => a + b, 0), v = handValue(hard, cards.includes(1));
    const stiff = up >= 2 && up <= 6;
    if (v >= 17 || (stiff && v >= 12 && !(v === 12 && up <= 3))) return;
    cards.push(shoe.deal());
  }
}

/** Play out the trainer hand with the action the player chose, then the dealer, and settle. */
export function playOut(player: number[], up: number, hole: number, action: ActionId, rules: Rules, shoe: Shoe): { hands: PlayedHand[]; dealer: number[]; total: number } {
  shoe.see(hole);
  const dealer = [up, hole];
  const dv = () => handValue(dealer.reduce((a, b) => a + b, 0), dealer.includes(1));
  const dealerBJ = dv() === 21;
  const playerBJ = handValue(player[0] + player[1], player.includes(1)) === 21;
  if (playerBJ) {
    const result = dealerBJ ? 0 : rules.bjPays;
    return { hands: [{ cards: player, bet: 1, result, note: dealerBJ ? 'Both blackjack: push' : 'Blackjack!' }], dealer, total: result };
  }
  if (dealerBJ && rules.peek) return { hands: [{ cards: player, bet: 1, result: -1, note: 'Dealer blackjack' }], dealer, total: -1 };
  let hands: PlayedHand[] = [];
  if (action === 'surrender') hands = [{ cards: player, bet: 1, result: -0.5, note: 'Surrendered: half back' }];
  else if (action === 'split') {
    for (const c of [player[0], player[1]]) {
      const h = [c, shoe.deal()];
      if (c !== 1) finishHand(h, up, shoe);
      hands.push({ cards: h, bet: 1, result: 0, note: '' });
    }
  } else {
    const h = player.slice();
    if (action === 'double') h.push(shoe.deal());
    else if (action === 'hit') { h.push(shoe.deal()); finishHand(h, up, shoe); }
    hands.push({ cards: h, bet: action === 'double' ? 2 : 1, result: 0, note: '' });
  }
  const live = hands.some((h) => h.note === '' && handValue(h.cards.reduce((a, b) => a + b, 0), h.cards.includes(1)) <= 21);
  if (live && !dealerBJ) {
    for (;;) {
      const hard = dealer.reduce((a, b) => a + b, 0), v = handValue(hard, dealer.includes(1));
      const soft17 = v === 17 && dealer.includes(1) && hard + 10 === 17;
      if (v > 17 || (v === 17 && !(rules.h17 && soft17))) break;
      dealer.push(shoe.deal());
    }
  }
  const d = dv();
  for (const h of hands) {
    if (h.note) continue;
    const v = handValue(h.cards.reduce((a, b) => a + b, 0), h.cards.includes(1));
    if (v > 21) { h.result = -h.bet; h.note = 'Bust'; }
    else if (dealerBJ) { h.result = -h.bet; h.note = 'Dealer blackjack'; }
    else if (d > 21) { h.result = h.bet; h.note = 'Dealer busts'; }
    else if (v > d) { h.result = h.bet; h.note = `${v} beats ${d}`; }
    else if (v < d) { h.result = -h.bet; h.note = `${v} loses to ${d}`; }
    else { h.result = 0; h.note = `Push at ${v}`; }
  }
  return { hands, dealer, total: hands.reduce((a, h) => a + h.result, 0) };
}
