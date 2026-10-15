/**
 * Drawing playing cards. A card face is plain HTML (rank and suit in two
 * corners and a big suit in the middle), so it scales with font size and
 * reads well in every theme. Poker cards are "Ah"; blackjack ranks are "A",
 * "2".."10" (a blackjack 10 is drawn as a plain 10 with no suit).
 */
import { RANKS, SUITS, SUIT_SYMBOLS, SUIT_NAMES, RANK_NAMES, isRed } from '../poker/cards';

export function cardFace(text: string, size: 'xs' | 'sm' | 'md' | 'lg' = 'md'): HTMLElement {
  const el = document.createElement('span');
  el.className = `pcard ${size}`;
  const t = text.replace(/^10/, 'T');
  const r = RANKS.indexOf(t[0]?.toUpperCase() ?? '');
  const s = SUITS.indexOf(t[1]?.toLowerCase() ?? '');
  if (t === '?' || r < 0) { el.classList.add('back'); el.setAttribute('aria-label', 'Face-down card'); el.setAttribute('role', 'img'); return el; }
  const rank = RANKS[r] === 'T' ? '10' : RANKS[r];
  const suit = s >= 0 ? SUIT_SYMBOLS[s] : '';
  if (s >= 0 && isRed(r * 4 + s)) el.classList.add('red');
  if (s < 0) el.classList.add('nosuit');
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', s >= 0 ? `${RANK_NAMES[r]} of ${SUIT_NAMES[s]}` : RANK_NAMES[r]);
  el.innerHTML = `<b>${rank}<i>${suit}</i></b><em>${suit || rank}</em>`;
  return el;
}

/** Blackjack rank (1..10) to the text cardFace takes. */
export const bjText = (r: number) => (r === 1 ? 'A' : String(r));
