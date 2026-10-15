/**
 * A deck of 52 cards to click: click a card to add it to your hand, click it
 * again (here or in the hand) to take it out. Used by the video poker, gin
 * rummy and cribbage tabs.
 */
import { RANKS, SUITS, cardName } from '../poker/cards';
import { cardFace } from './cards';

export class HandPicker {
  constructor(private box: HTMLElement, private onPick: (c: number) => void) {
    box.classList.add('picker');
    box.setAttribute('role', 'grid');
    box.setAttribute('aria-label', 'Pick a card');
    for (const s of [3, 2, 1, 0]) for (let r = 12; r >= 0; r--) {
      const c = r * 4 + s;
      const b = document.createElement('button');
      b.className = 'pick'; b.dataset.c = String(c);
      b.append(cardFace(RANKS[r] + SUITS[s], 'sm'));
      b.setAttribute('aria-label', cardName(c));
      b.onclick = () => this.onPick(c);
      box.append(b);
    }
  }
  /** Dim the cards in use; `full` disables the rest when the hand can't take more. */
  mark(used: number[], full: boolean) {
    this.box.querySelectorAll<HTMLButtonElement>('.pick').forEach((b) => {
      const on = used.includes(+b.dataset.c!);
      b.classList.toggle('used', on);
      b.setAttribute('aria-pressed', String(on));
      b.disabled = full && !on;
    });
  }
}

/** Draw cards (poker encoding) as faces; optional click handler per card. */
export function faces(cards: number[], size: 'sm' | 'md' | 'lg' = 'md', onClick?: (c: number) => void, cls?: (c: number) => string): HTMLElement[] {
  return cards.map((c) => {
    const f = cardFace(RANKS[c >> 2] + SUITS[c & 3], size);
    if (!onClick) return f;
    const b = document.createElement('button');
    b.className = `hand-card ${cls?.(c) ?? ''}`;
    b.setAttribute('aria-label', cardName(c));
    b.append(f);
    b.onclick = () => onClick(c);
    return b;
  });
}

/** n random different cards, avoiding `not`. */
export function randomCards(n: number, not: number[] = []): number[] {
  const deck = Array.from({ length: 52 }, (_, i) => i).filter((c) => !not.includes(c));
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck.slice(0, n);
}

/** Sort for display: by rank (ace high or low), then suit. */
export const sortCards = (cards: number[], aceLow = false) => cards.slice().sort((a, b) => {
  const ra = aceLow ? ((a >> 2) + 1) % 13 : a >> 2, rb = aceLow ? ((b >> 2) + 1) % 13 : b >> 2;
  return ra - rb || (a & 3) - (b & 3);
});
