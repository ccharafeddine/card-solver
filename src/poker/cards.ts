/**
 * Playing cards as small integers: card = rank * 4 + suit, with rank 0..12
 * for 2..A and suit 0..3 for clubs, diamonds, hearts, spades.
 */
export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';
export const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];
export const SUIT_NAMES = ['clubs', 'diamonds', 'hearts', 'spades'];
export const RANK_NAMES = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];

export const card = (rank: number, suit: number) => rank * 4 + suit;
export const rankOf = (c: number) => c >> 2;
export const suitOf = (c: number) => c & 3;
export const isRed = (c: number) => suitOf(c) === 1 || suitOf(c) === 2;

/** "Ah", "Td", "2c". */
export const cardText = (c: number) => RANKS[rankOf(c)] + SUITS[suitOf(c)];
/** "A♥" for display. */
export const cardLabel = (c: number) => (RANKS[rankOf(c)] === 'T' ? '10' : RANKS[rankOf(c)]) + SUIT_SYMBOLS[suitOf(c)];
export const cardName = (c: number) => `${RANK_NAMES[rankOf(c)]} of ${SUIT_NAMES[suitOf(c)]}`;

/** Parse "Ah Kd", "AhKd" or "10h"; returns null on anything it doesn't understand or a repeated card. */
export function parseCards(text: string): number[] | null {
  const t = text.replace(/10/g, 'T').replace(/[\s,]+/g, '');
  if (t.length % 2) return null;
  const out: number[] = [];
  for (let i = 0; i < t.length; i += 2) {
    const r = RANKS.indexOf(t[i].toUpperCase()), s = SUITS.indexOf(t[i + 1].toLowerCase());
    if (r < 0 || s < 0) return null;
    const c = card(r, s);
    if (out.includes(c)) return null;
    out.push(c);
  }
  return out;
}

export const FULL_DECK = Array.from({ length: 52 }, (_, i) => i);
