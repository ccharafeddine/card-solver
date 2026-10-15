/**
 * The Gin Rummy tab: pick your 10 cards (or 11 after you draw), and the face-up
 * card if you like. The app lays out the best melds and your deadwood
 * exactly, then gives discard, draw and knock advice. The advice uses rules
 * of thumb and is labelled that way.
 */
import { knockAdvice } from '../gin/engine';
import { cardLabel } from '../poker/cards';
import type { GinResult } from '../worker';
import { HandPicker, faces, randomCards, sortCards } from './handpicker';
import { Solver } from './solver';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const KEY = 'card-solver-gin';
export interface GinState { hand: number[]; up: number | null; mode: 'hand' | 'up'; turn: number }
const fresh = (): GinState => ({ hand: [], up: null, mode: 'hand', turn: 1 });
const okCard = (c: unknown) => Number.isInteger(c) && (c as number) >= 0 && (c as number) < 52;

export class GinTab {
  s: GinState;
  result: GinResult | null = null;
  private picker: HandPicker;
  private solver = new Solver((m) => {
    if (m.kind === 'error') { this.status(m.message, 'bad'); return; }
    if (m.kind !== 'gin') return;
    this.result = m.result; this.renderResult();
  });

  constructor(private status: (t: string, kind?: '' | 'ok' | 'bad' | 'thinking') => void) {
    this.s = this.load();
    this.picker = new HandPicker($('gn-picker'), (c) => this.toggle(c));
    document.querySelectorAll<HTMLButtonElement>('#gn-mode button').forEach((b) => { b.onclick = () => { this.s.mode = b.dataset.mode as GinState['mode']; this.save(); this.render(); }; });
    $('gn-random').onclick = () => { this.s.hand = randomCards(10); this.s.up = randomCards(1, this.s.hand)[0]; this.s.mode = 'hand'; this.changed(); };
    $('gn-clear').onclick = () => { this.s.hand = []; this.s.up = null; this.s.mode = 'hand'; this.changed(); };
    const turn = $<HTMLInputElement>('gn-turn');
    turn.onchange = () => { this.s.turn = Math.max(1, Math.min(30, Math.round(+turn.value) || 1)); this.save(); this.renderResult(); };
    this.render(); this.compute();
  }
  private load(): GinState {
    const f = fresh();
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<GinState> | null;
      if (raw && Array.isArray(raw.hand) && raw.hand.length <= 11 && raw.hand.every(okCard) && new Set(raw.hand).size === raw.hand.length) f.hand = raw.hand;
      if (raw && okCard(raw.up) && !f.hand.includes(raw.up!)) f.up = raw.up!;
      if (raw && Number.isInteger(raw.turn) && raw.turn! >= 1 && raw.turn! <= 30) f.turn = raw.turn!;
    } catch { /* fresh */ }
    return f;
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* blocked */ } }
  snapshot() { return JSON.parse(JSON.stringify(this.s)) as GinState; }
  restore(x: GinState) { this.s = x; this.render(); this.compute(); }

  private toggle(c: number) {
    const s = this.s;
    if (s.up === c) s.up = null;
    else if (s.hand.includes(c)) s.hand = s.hand.filter((x) => x !== c);
    else if (s.mode === 'up') { s.up = c; s.mode = 'hand'; }
    else if (s.hand.length < 11) s.hand.push(c);
    this.changed();
  }
  private changed() { this.save(); this.render(); this.compute(); }
  compute() {
    this.result = null;
    const n = this.s.hand.length;
    if (n < 10) { this.solver.cancel(); this.renderResult(); return; }
    this.status(n === 11 ? 'Trying every discard…' : 'Finding your best melds…', 'thinking');
    this.solver.ask({ kind: 'gin', hand: this.s.hand.slice(), up: n === 10 ? this.s.up : null });
    this.renderResult();
  }

  render() {
    const s = this.s;
    $('gn-cards').replaceChildren(...faces(sortCards(s.hand, true), 'md', (c) => this.toggle(c)));
    $('gn-up').replaceChildren(...(s.up !== null ? faces([s.up], 'md', (c) => this.toggle(c)) : [Object.assign(document.createElement('span'), { className: 'slot empty-slot', textContent: '+' })]));
    $('gn-count').textContent = s.hand.length === 11 ? '10 cards + 1 drawn' : `${s.hand.length} of 10 cards`;
    document.querySelectorAll<HTMLButtonElement>('#gn-mode button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === s.mode)));
    this.picker.mark([...s.hand, ...(s.up !== null ? [s.up] : [])], s.mode === 'hand' && s.hand.length >= 11);
    $<HTMLInputElement>('gn-turn').value = String(s.turn);
    $('gn-help').textContent = s.mode === 'up' ? 'Now pick the face-up card on the discard pile.' : s.hand.length < 10 ? `Pick ${10 - s.hand.length} more card${s.hand.length === 9 ? '' : 's'}: your hand. Add an 11th after you draw.` : s.hand.length === 10 ? 'Add the card you drew as an 11th card to see what to throw away.' : 'Click a card to take it out.';
  }

  renderResult() {
    const r = this.result;
    const melds = $('gn-melds'), adv = $('gn-advice'), table = $('gn-discards');
    if (!r) {
      melds.innerHTML = `<p class="muted">${this.s.hand.length >= 10 ? 'Working…' : 'Pick 10 cards to see your melds.'}</p>`;
      adv.textContent = ''; table.replaceChildren(); $('gn-dead').textContent = '–';
      if (this.s.hand.length < 10) this.status('Pick your 10 cards, or press Deal for a random hand.');
      return;
    }
    const show = r.discards ? r.discards[0].melds : r.melds;
    const group = (title: string, cards: number[], cls: string) => {
      const g = document.createElement('div'); g.className = `meld ${cls}`;
      const l = document.createElement('span'); l.className = 'slot-label'; l.textContent = title;
      const h = document.createElement('div'); h.className = 'card-group'; h.append(...faces(sortCards(cards, true), 'sm'));
      g.append(l, h); return g;
    };
    melds.replaceChildren(
      ...show.melds.map((m, i) => group(`Meld ${i + 1}: ${new Set(m.map((c) => c >> 2)).size === 1 ? 'set' : 'run'}`, m, 'in')),
      ...(show.deadwood.length ? [group(`Deadwood: ${show.points} point${show.points === 1 ? '' : 's'}`, show.deadwood, 'out')] : []),
    );
    $('gn-dead').textContent = String(show.points);
    const k = knockAdvice(show.points, this.s.turn);
    const lines: string[] = [];
    if (r.discards) {
      const [best, next] = r.discards;
      lines.push(`<b>Throw away ${cardLabel(best.card)}.</b> That leaves ${best.deadwood} deadwood${next ? `; the next best, ${cardLabel(next.card)}, leaves ${next.deadwood}` : ''}. ${best.helpers} of the unseen cards would lower it again next turn.`);
      table.replaceChildren(...r.discards.slice(0, 6).map((o, i) => {
        const tr = document.createElement('tr'); tr.className = i === 0 ? 'best' : '';
        tr.innerHTML = `<th>${i === 0 ? '★ ' : ''}Throw ${cardLabel(o.card)}</th><td class="mono">${o.deadwood}</td><td class="mono">${o.helpers}</td>`;
        return tr;
      }));
      table.prepend(Object.assign(document.createElement('tr'), { innerHTML: '<th></th><th class="num">Deadwood</th><th class="num">Helpful cards</th>' }));
    } else {
      table.replaceChildren();
      if (r.upcard && this.s.up !== null) lines.push(r.upcard.take ? `<b>Take the ${cardLabel(this.s.up)}</b> from the discard pile: it goes into a meld, and after throwing ${cardLabel(r.upcard.discard!)} your deadwood drops from ${r.upcard.before} to ${r.upcard.after}.` : `<b>Draw from the pile</b> instead of taking the ${cardLabel(this.s.up)}: it doesn't go into a meld${r.upcard.after < r.upcard.before ? ' (it only swaps one loose card for another)' : ''}, and taking it tells the other player what you're collecting.`);
      else lines.push('Add the face-up card to get draw advice, or add the card you drew as an 11th card for discard advice.');
    }
    lines.push(`<b>${k.advice === 'gin' ? 'Go gin!' : k.advice === 'knock' ? 'Knock.' : k.advice === 'wait' ? 'You can knock, but wait.' : 'Not yet.'}</b> ${k.why}`);
    adv.innerHTML = lines.map((l) => `<p>${l}</p>`).join('');
    this.status(k.advice === 'gin' ? 'Gin! Zero deadwood.' : r.discards ? `Throw away ${cardLabel(r.discards[0].card)}: ${r.discards[0].deadwood} deadwood left.` : `Your deadwood: ${show.points}.`, k.advice === 'gin' ? 'ok' : '');
  }

  onKey(e: KeyboardEvent): boolean {
    if (e.key.toLowerCase() === 'r') { $('gn-random').click(); return true; }
    return false;
  }
  demo(id: string) {
    // A♣ 2♣ 3♣ · 9♦ 9♥ 9♠ · K♣ K♦ · 4♦ Q♠, then drew K♥.
    const p = (t: string) => t.split(' ').map((x) => '23456789TJQKA'.indexOf(x[0]) * 4 + 'cdhs'.indexOf(x[1]));
    if (id === 'gn-hand') { this.s = { hand: p('Ac 2c 3c 9d 9h 9s Kc Kd 4d Qs'), up: p('Kh')[0], mode: 'hand', turn: 3 }; this.changed(); }
    else if (id === 'gn-advice') { this.s = { hand: p('Ac 2c 3c 9d 9h 9s Kc Kd 4d Qs Kh'), up: null, mode: 'hand', turn: 3 }; this.changed(); }
  }
}
