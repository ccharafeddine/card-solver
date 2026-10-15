/**
 * The Video Poker tab (Jacks or Better): pick or deal five cards, click cards
 * to choose what you'd hold, and see the exact best hold and the value of
 * every hold, worked out in the worker. The pay table sets the payouts and
 * shows the long-run return with perfect play.
 */
import { PAY_TABLES, VP_HANDS, type Hold } from '../vpoker/engine';
import { cardLabel } from '../poker/cards';
import { HandPicker, faces, randomCards } from './handpicker';
import { Solver } from './solver';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const KEY = 'card-solver-vpoker';
export interface VpState { hand: number[]; table: string; mine: number }
const fresh = (): VpState => ({ hand: [], table: '9-6', mine: 0 });

const holdText = (h: Hold) => (h.held.length ? h.held.map(cardLabel).join(' ') : 'Throw all five away');

export class VideoPokerTab {
  s: VpState;
  holds: Hold[] | null = null;
  private picker: HandPicker;
  private solver = new Solver((m) => {
    if (m.kind === 'error') { this.status(m.message, 'bad'); return; }
    if (m.kind !== 'vpoker') return;
    this.holds = m.holds; this.renderResult(m.ms);
  });

  constructor(private status: (t: string, kind?: '' | 'ok' | 'bad' | 'thinking') => void) {
    this.s = this.load();
    this.picker = new HandPicker($('vp-picker'), (c) => this.toggle(c));
    const sel = $<HTMLSelectElement>('vp-table');
    for (const t of PAY_TABLES) sel.append(new Option(t.name, t.id));
    sel.onchange = () => { this.s.table = sel.value; this.changed(); };
    $('vp-random').onclick = () => { this.s.hand = randomCards(5); this.s.mine = 0; this.changed(); };
    $('vp-clear').onclick = () => { this.s.hand = []; this.s.mine = 0; this.changed(); };
    this.render(); this.compute();
  }
  private load(): VpState {
    const f = fresh();
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<VpState> | null;
      if (raw && Array.isArray(raw.hand) && raw.hand.length <= 5 && raw.hand.every((c) => Number.isInteger(c) && c >= 0 && c < 52) && new Set(raw.hand).size === raw.hand.length) f.hand = raw.hand;
      if (raw && PAY_TABLES.some((t) => t.id === raw.table)) f.table = raw.table!;
      if (raw && Number.isInteger(raw.mine) && raw.mine! >= 0 && raw.mine! < 32) f.mine = raw.mine!;
    } catch { /* fresh */ }
    return f;
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* blocked */ } }
  snapshot() { return JSON.parse(JSON.stringify(this.s)) as VpState; }
  restore(x: VpState) { this.s = x; this.render(); this.compute(); }
  private get pays() { return PAY_TABLES.find((t) => t.id === this.s.table)!; }

  private toggle(c: number) {
    const i = this.s.hand.indexOf(c);
    if (i >= 0) this.s.hand.splice(i, 1);
    else if (this.s.hand.length < 5) this.s.hand.push(c);
    this.s.mine = 0;
    this.changed();
  }
  private changed() { this.save(); this.render(); this.compute(); }
  compute() {
    this.holds = null;
    if (this.s.hand.length !== 5) { this.solver.cancel(); this.renderResult(0); return; }
    this.status('Counting every possible draw…', 'thinking');
    this.solver.ask({ kind: 'vpoker', hand: this.s.hand.slice(), pays: this.pays.pays });
    this.renderResult(0);
  }

  render() {
    const hand = this.s.hand;
    const row = $('vp-cards');
    const slots = faces(hand, 'lg', (c) => this.hold(c), (c) => (this.s.mine & (1 << hand.indexOf(c)) ? 'held' : ''));
    slots.forEach((b, i) => { const w = document.createElement('div'); w.className = 'vp-slot'; w.append(b, Object.assign(document.createElement('span'), { className: 'held-tag', textContent: this.s.mine & (1 << i) ? 'HELD' : '' })); slots[i] = w; });
    while (slots.length < 5) { const e = document.createElement('div'); e.className = 'vp-slot'; e.innerHTML = '<span class="slot empty-slot">+</span><span class="held-tag"></span>'; slots.push(e); }
    row.replaceChildren(...slots);
    this.picker.mark(hand, hand.length >= 5);
    $<HTMLSelectElement>('vp-table').value = this.s.table;
    const t = this.pays;
    $('vp-pays').innerHTML = VP_HANDS.slice(0, 9).map((n, i) => `<tr><th>${n}</th><td class="mono">${t.pays[i]}</td></tr>`).join('');
    $('vp-return').textContent = t.ret ? `${(t.ret * 100).toFixed(2)}%` : '–';
    $('vp-return-note').textContent = t.ret ? `Bet $100 over and over with perfect play and you get back about $${(t.ret * 100).toFixed(2)} on average (the casino keeps $${(100 - t.ret * 100).toFixed(2)}). ${t.id === '9-6' ? 'This is the best common table.' : `Worse than the 9/6 table: the full house and flush pay less.`}` : '';
    $('vp-help').textContent = hand.length < 5 ? `Pick ${5 - hand.length} more card${hand.length === 4 ? '' : 's'} below, or press Deal.` : 'Click your cards to choose which ones to hold, and compare with the best hold.';
  }
  private hold(c: number) {
    const i = this.s.hand.indexOf(c);
    if (this.s.hand.length < 5) { this.toggle(c); return; }
    this.s.mine ^= 1 << i; this.save(); this.render(); this.renderResult(0);
  }

  renderResult(ms: number) {
    const tbl = $('vp-holds');
    const why = $('vp-why');
    if (!this.holds) {
      tbl.innerHTML = `<tr><td class="muted">${this.s.hand.length === 5 ? 'Working…' : 'Pick five cards to see the best hold.'}</td></tr>`;
      why.textContent = ''; $('vp-mine').textContent = '';
      if (this.s.hand.length !== 5) this.status('Pick five cards, or press Deal for a random hand.');
      return;
    }
    const top = this.holds.slice(0, 8);
    const best = this.holds[0];
    const max = Math.max(1, ...top.map((h) => h.ev));
    tbl.replaceChildren(...top.map((h, k) => {
      const tr = document.createElement('tr');
      tr.className = k === 0 ? 'best' : '';
      tr.innerHTML = `<th>${k === 0 ? '★ ' : ''}${holdText(h)}</th><td class="bar"><i class="pos" style="left:0;width:${(100 * Math.min(h.ev, max)) / max}%"></i></td><td class="mono">${h.ev.toFixed(3)}</td>`;
      tr.onclick = () => { this.s.mine = h.mask; this.save(); this.render(); this.renderResult(0); };
      return tr;
    }));
    const chance = best.counts.map((n, i) => ({ n: VP_HANDS[i], p: n / best.draws })).filter((x) => x.p > 0 && x.n !== 'Nothing').sort((a, b) => b.p - a.p).slice(0, 3);
    why.textContent = `Hold ${holdText(best)}: it pays back ${best.ev.toFixed(3)} coins for every coin bet, on average. ${best.held.length === 5 ? 'Keep them all: drawing can only make it worse.' : `Most likely winners after the draw: ${chance.map((x) => `${x.n.toLowerCase()} ${(x.p * 100).toFixed(1)}%`).join(', ') || 'none'}.`} Checked ${this.holds.reduce((a, h) => a + h.draws, 0).toLocaleString()} draws${ms ? ` in ${(ms / 1000).toFixed(1)} s` : ''}.`;
    const mine = this.holds.find((h) => h.mask === this.s.mine)!;
    const lost = best.ev - mine.ev;
    $('vp-mine').innerHTML = `Your hold: <b>${holdText(mine)}</b> → ${mine.ev.toFixed(3)} ${lost < 1e-9 ? '✓ the best play' : `(costs ${lost.toFixed(3)} coins a hand)`}`;
    this.status(lost < 1e-9 ? `Best hold: ${holdText(best)} (${best.ev.toFixed(3)} per coin).` : `Best hold: ${holdText(best)}. Your hold gives up ${lost.toFixed(3)} coins a hand.`, lost < 1e-9 ? 'ok' : '');
  }

  onKey(e: KeyboardEvent): boolean {
    if (e.key.toLowerCase() === 'r') { $('vp-random').click(); return true; }
    return false;
  }
  demo(id: string) {
    if (id === 'vp-hand') { this.s.hand = [51, 47, 43, 39, 1]; this.s.mine = 0; this.s.table = '9-6'; this.changed(); }
    // 6♣ 6♦ 10♠ 9♠ 8♠: keep the low pair, not the straight flush draw.
    else if (id === 'vp-best') { this.s.hand = [16, 17, 35, 31, 27]; this.s.mine = 0b11100; this.changed(); }
  }
}
