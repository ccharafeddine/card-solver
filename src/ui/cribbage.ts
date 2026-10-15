/**
 * The Cribbage tab: pick six cards to find the best two to throw in the crib
 * (exact averages over every cut card and every crib, from the worker), or
 * pick four cards and a cut card to score a hand, with every point explained.
 */
import { score, type DiscardResult } from '../cribbage/engine';
import { cardLabel } from '../poker/cards';
import { HandPicker, faces, randomCards, sortCards } from './handpicker';
import { Solver } from './solver';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const KEY = 'card-solver-cribbage';
export interface CribState { mode: 'throw' | 'score'; six: number[]; four: number[]; starter: number | null; dealer: boolean; crib: boolean }
const fresh = (): CribState => ({ mode: 'throw', six: [], four: [], starter: null, dealer: true, crib: false });
const okList = (a: unknown, n: number) => Array.isArray(a) && a.length <= n && a.every((c) => Number.isInteger(c) && c >= 0 && c < 52) && new Set(a).size === a.length;
const pts = (n: number) => `${n} point${n === 1 ? '' : 's'}`;

export class CribbageTab {
  s: CribState;
  results: DiscardResult[] | null = null;
  private picker: HandPicker;
  private solver = new Solver((m) => {
    if (m.kind === 'error') { this.status(m.message, 'bad'); return; }
    if (m.kind !== 'crib') return;
    this.results = m.results; this.renderThrow(m.ms);
  });

  constructor(private status: (t: string, kind?: '' | 'ok' | 'bad' | 'thinking') => void) {
    this.s = this.load();
    this.picker = new HandPicker($('cb-picker'), (c) => this.toggle(c));
    document.querySelectorAll<HTMLButtonElement>('#cb-mode button').forEach((b) => { b.onclick = () => { this.s.mode = b.dataset.mode as CribState['mode']; this.changed(); }; });
    document.querySelectorAll<HTMLButtonElement>('#cb-seat button').forEach((b) => { b.onclick = () => { this.s.dealer = b.dataset.seat === 'dealer'; this.changed(); }; });
    $<HTMLInputElement>('cb-iscrib').onchange = (e) => { this.s.crib = (e.target as HTMLInputElement).checked; this.save(); this.renderScore(); };
    $('cb-random').onclick = () => {
      if (this.s.mode === 'throw') this.s.six = randomCards(6);
      else { const r = randomCards(5); this.s.four = r.slice(0, 4); this.s.starter = r[4]; }
      this.changed();
    };
    $('cb-clear').onclick = () => { if (this.s.mode === 'throw') this.s.six = []; else { this.s.four = []; this.s.starter = null; } this.changed(); };
    this.render(); this.compute();
  }
  private load(): CribState {
    const f = fresh();
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<CribState> | null;
      if (!raw || typeof raw !== 'object') return f;
      if (raw.mode === 'score') f.mode = 'score';
      if (okList(raw.six, 6)) f.six = raw.six!;
      if (okList(raw.four, 4)) f.four = raw.four!;
      if (Number.isInteger(raw.starter) && raw.starter! >= 0 && raw.starter! < 52 && !f.four.includes(raw.starter!)) f.starter = raw.starter!;
      f.dealer = raw.dealer !== false; f.crib = raw.crib === true;
    } catch { /* fresh */ }
    return f;
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* blocked */ } }
  snapshot() { return JSON.parse(JSON.stringify(this.s)) as CribState; }
  restore(x: CribState) { this.s = x; this.render(); this.compute(); }

  private toggle(c: number) {
    const s = this.s;
    if (s.mode === 'throw') {
      if (s.six.includes(c)) s.six = s.six.filter((x) => x !== c); else if (s.six.length < 6) s.six.push(c);
    } else if (s.starter === c) s.starter = null;
    else if (s.four.includes(c)) s.four = s.four.filter((x) => x !== c);
    else if (s.four.length < 4) s.four.push(c);
    else if (s.starter === null) s.starter = c;
    this.changed();
  }
  private changed() { this.save(); this.render(); this.compute(); }
  compute() {
    this.results = null;
    if (this.s.mode !== 'throw' || this.s.six.length !== 6) { this.solver.cancel(); this.renderThrow(0); return; }
    this.status('Scoring every cut card and every crib…', 'thinking');
    this.solver.ask({ kind: 'crib', six: this.s.six.slice(), dealer: this.s.dealer });
    this.renderThrow(0);
  }

  render() {
    const s = this.s;
    const throwMode = s.mode === 'throw';
    document.querySelectorAll<HTMLButtonElement>('#cb-mode button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === s.mode)));
    document.querySelectorAll<HTMLButtonElement>('#cb-seat button').forEach((b) => b.setAttribute('aria-checked', String((b.dataset.seat === 'dealer') === s.dealer)));
    $('cb-throw-card').classList.toggle('hidden', !throwMode);
    $('cb-score-card').classList.toggle('hidden', throwMode);
    $('cb-seat-row').classList.toggle('invisible', !throwMode);
    $('cb-crib-row').classList.toggle('invisible', throwMode);
    const used = throwMode ? s.six : [...s.four, ...(s.starter !== null ? [s.starter] : [])];
    $('cb-cards').replaceChildren(...faces(sortCards(throwMode ? s.six : s.four, true), 'md', (c) => this.toggle(c)));
    $('cb-starter-wrap').classList.toggle('invisible', throwMode);
    $('cb-starter').replaceChildren(...(s.starter !== null ? faces([s.starter], 'md', (c) => this.toggle(c)) : [Object.assign(document.createElement('span'), { className: 'slot empty-slot', textContent: '+' })]));
    this.picker.mark(used, throwMode ? s.six.length >= 6 : s.four.length >= 4 && s.starter !== null);
    $<HTMLInputElement>('cb-iscrib').checked = s.crib;
    $('cb-help').textContent = throwMode ? (s.six.length < 6 ? `Pick ${6 - s.six.length} more of the six cards you were dealt.` : 'Click a card to take it out.') : s.four.length < 4 ? `Pick ${4 - s.four.length} more card${s.four.length === 3 ? '' : 's'} for your hand.` : s.starter === null ? 'Now pick the cut card (the starter).' : 'Click a card to take it out.';
    this.renderScore();
  }

  renderThrow(ms: number) {
    if (this.s.mode !== 'throw') return;
    const tbl = $('cb-throws'), why = $('cb-why');
    if (!this.results) {
      tbl.innerHTML = `<tr><td class="muted">${this.s.six.length === 6 ? 'Working…' : 'Pick six cards to find the best throw.'}</td></tr>`;
      why.textContent = '';
      if (this.s.six.length !== 6) this.status('Pick the six cards you were dealt, or press Deal.');
      return;
    }
    const d = this.s.dealer;
    tbl.replaceChildren(Object.assign(document.createElement('tr'), { innerHTML: `<th>Throw</th><th class="num">Hand</th><th class="num">Crib</th><th class="num">Total</th>` }),
      ...this.results.slice(0, 8).map((r, i) => {
        const tr = document.createElement('tr'); tr.className = i === 0 ? 'best' : '';
        tr.innerHTML = `<th>${i === 0 ? '★ ' : ''}${r.throw.map(cardLabel).join(' ')}</th><td class="mono">${r.hand.toFixed(2)}</td><td class="mono">${d ? '+' : '−'}${r.crib.toFixed(2)}</td><td class="mono">${r.net.toFixed(2)}</td>`;
        tr.onclick = () => { this.s.mode = 'score'; this.s.four = r.keep.slice(); this.s.starter = null; this.changed(); };
        return tr;
      }));
    const b = this.results[0];
    why.textContent = `Throw ${b.throw.map(cardLabel).join(' and ')} ${d ? 'into your own crib' : 'into their crib'}. Your four cards score ${b.hand.toFixed(2)} on average (from ${b.min} to ${b.max}, depending on the cut), and the crib ${d ? 'adds' : 'gives them'} about ${b.crib.toFixed(2)}. Click a row to see that hand scored.${ms ? ` Worked out in ${(ms / 1000).toFixed(1)} s.` : ''}`;
    this.status(`Best throw: ${b.throw.map(cardLabel).join(' ')}, worth ${b.net.toFixed(2)} points on average.`, 'ok');
  }

  renderScore() {
    const s = this.s;
    const body = $('cb-score');
    if (s.mode !== 'score') return;
    if (s.four.length !== 4 || s.starter === null) {
      body.innerHTML = '<p class="muted">Pick four cards and a cut card to score the hand.</p>';
      this.status('Pick four cards and the cut card, or press Deal.');
      return;
    }
    const sc = score(s.four, s.starter, s.crib);
    const rows: [string, number, string][] = [
      ['Fifteens', sc.fifteens, 'Each group adding to 15 is 2 points. Aces count 1, pictures 10.'],
      ['Pairs', sc.pairs, 'Each pair of the same rank is 2 points (three of a kind makes 3 pairs: 6).'],
      ['Runs', sc.runs, '3 or more in a row: 1 point per card, for each way you can make it.'],
      ['Flush', sc.flush, s.crib ? 'In the crib, all five cards must be one suit.' : 'All four hand cards one suit: 4 (5 if the cut matches).'],
      ['Nobs', sc.nobs, 'The jack of the cut card\'s suit in your hand: 1 point.'],
    ];
    body.innerHTML = `<table class="ev-table score-table">${rows.map(([n, v, h]) => `<tr${v ? ' class="best"' : ''}><th>${n}</th><td class="muted small">${h}</td><td class="mono">${v}</td></tr>`).join('')}<tr class="total"><th>Total</th><td></td><td class="mono">${sc.total}</td></tr></table>`;
    // Average over every cut, to compare with the hand you got.
    const rest = Array.from({ length: 52 }, (_, i) => i).filter((c) => !s.four.includes(c));
    const avg = rest.reduce((a, c) => a + score(s.four, c, s.crib).total, 0) / rest.length;
    this.status(`${pts(sc.total)}${sc.total === 29 ? ': the perfect hand!' : '.'} With a random cut these four cards average ${avg.toFixed(2)}.`, sc.total ? 'ok' : '');
  }

  onKey(e: KeyboardEvent): boolean {
    if (e.key.toLowerCase() === 'r') { $('cb-random').click(); return true; }
    return false;
  }
  demo(id: string) {
    const p = (t: string) => t.split(' ').map((x) => '23456789TJQKA'.indexOf(x[0]) * 4 + 'cdhs'.indexOf(x[1]));
    if (id === 'cb-score') { this.s = { ...this.s, mode: 'score', four: p('5c 5d 5h Js'), starter: p('5s')[0], crib: false }; this.changed(); }
    else if (id === 'cb-throw') { this.s = { ...this.s, mode: 'throw', six: p('5c 5d Kh Qs 2c 9d'), dealer: true }; this.changed(); }
  }
}
