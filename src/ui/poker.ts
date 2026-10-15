/**
 * The Poker tab: card slots and picker, opponents and their range, equity
 * (from the worker), outs, the fold/call/raise helper, the game-theory
 * explainers and the preflop reference charts.
 */
import { cardName, cardText, RANKS, SUITS } from '../poker/cards';
import { CATEGORY_NAMES, CATEGORY_HELP, evaluate, handName } from '../poker/eval';
import type { EquityInput, EquityResult } from '../poker/equity';
import { findOuts } from '../poker/outs';
import { decide, mdf, bluffShare, bluffsPerValue, potOdds } from '../poker/decide';
import { className, classOf, comboCount, emptyRange, fullRange, parseRange, PRESETS, rangeCombos, rangePercent, rangeText, topPercent, type Range } from '../poker/range';
import { SEATS, seatRange } from '../poker/charts';
import { STRENGTH } from '../poker/strength';
import { cardFace } from './cards';
import type { WorkerRequest, WorkerResponse } from '../worker';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
type Group = 'hero' | 'flop' | 'turn' | 'river' | 'dead';
const SIZES: Record<Group, number> = { hero: 2, flop: 3, turn: 1, river: 1, dead: 6 };
const GROUP_WORDS: Record<Group, string> = { hero: 'your card', flop: 'flop card', turn: 'turn', river: 'river', dead: 'dead card' };
const ORDER: Group[] = ['hero', 'flop', 'turn', 'river', 'dead'];

export interface PokerState {
  slots: Record<Group, (number | null)[]>;
  active: { group: Group; i: number } | null;
  opps: number;
  mode: 'any' | 'range';
  range: Range;
  preset: string;
  pot: number; call: number; raise: number; implied: number; fold: number;
  theory: string;
  seat: string;
}
const KEY = 'card-solver-poker';
export const freshPoker = (): PokerState => ({
  slots: { hero: [null, null], flop: [null, null, null], turn: [null], river: [null], dead: new Array(6).fill(null) },
  active: { group: 'hero', i: 0 }, opps: 1, mode: 'any', range: topPercent(30), preset: 'p30',
  pot: 100, call: 50, raise: 150, implied: 0, fold: 30, theory: 'ev', seat: 'btn',
});

const pct = (x: number, d = 1) => `${(Math.round(x * 100 * 10 ** d) / 10 ** d).toFixed(d)}%`;
const num = (x: number) => (Math.round(x * 10) / 10).toLocaleString('en-US');
const fmtEV = (x: number) => `${x > 0.05 ? '+' : x < -0.05 ? '−' : ''}${num(Math.abs(x))}`;

export class PokerTab {
  s: PokerState;
  private worker: Worker | null = null;
  private busy = false;
  private reqId = 0;
  private timer = 0;
  result: EquityResult | null = null;
  private resultKey = '';
  private painting: boolean | null = null;

  constructor(private status: (t: string, kind?: '' | 'ok' | 'bad' | 'thinking') => void) {
    this.s = this.load();
    this.build();
    this.render();
    this.schedule();
  }

  // ---------- state ----------
  private load(): PokerState {
    const f = freshPoker();
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<PokerState> | null;
      if (!raw || typeof raw !== 'object') return f;
      const okCard = (c: unknown) => (Number.isInteger(c) && (c as number) >= 0 && (c as number) < 52 ? (c as number) : null);
      for (const g of ORDER) if (Array.isArray(raw.slots?.[g])) f.slots[g] = f.slots[g].map((_, i) => okCard(raw.slots![g][i]));
      const seen = new Set<number>();
      for (const g of ORDER) f.slots[g] = f.slots[g].map((c) => (c === null || seen.has(c) ? null : (seen.add(c), c)));
      if (Array.isArray(raw.range) && raw.range.length === 169) f.range = raw.range.map(Boolean);
      if (raw.mode === 'range' || raw.mode === 'any') f.mode = raw.mode;
      for (const k of ['opps', 'pot', 'call', 'raise', 'implied', 'fold'] as const) if (typeof raw[k] === 'number' && Number.isFinite(raw[k])) f[k] = Math.max(0, raw[k]!);
      f.opps = Math.min(9, Math.max(1, Math.round(f.opps)));
      f.fold = Math.min(100, f.fold);
      if (typeof raw.theory === 'string' && THEORY.some((t) => t.id === raw.theory)) f.theory = raw.theory;
      if (typeof raw.seat === 'string' && SEATS.some((t) => t.id === raw.seat)) f.seat = raw.seat;
      if (typeof raw.preset === 'string') f.preset = raw.preset;
    } catch { /* corrupt: start fresh */ }
    return f;
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify({ ...this.s, active: null })); } catch { /* storage blocked */ } }
  snapshot(): PokerState { return JSON.parse(JSON.stringify(this.s)); }
  restore(s: PokerState) { this.s = JSON.parse(JSON.stringify(s)); this.render(); this.schedule(0); }

  get hero() { return this.s.slots.hero.filter((c): c is number => c !== null); }
  get board() {
    const f = this.s.slots.flop.filter((c): c is number => c !== null);
    const t = this.s.slots.turn[0], r = this.s.slots.river[0];
    return [...f, ...(t !== null ? [t] : []), ...(r !== null ? [r] : [])];
  }
  get dead() { return this.s.slots.dead.filter((c): c is number => c !== null); }
  private used(): Map<number, { group: Group; i: number }> {
    const m = new Map<number, { group: Group; i: number }>();
    for (const g of ORDER) this.s.slots[g].forEach((c, i) => { if (c !== null) m.set(c, { group: g, i }); });
    return m;
  }
  /** Why the board can't be used yet, if it can't. */
  private boardProblem(): string | null {
    const f = this.s.slots.flop.filter((c) => c !== null).length;
    const t = this.s.slots.turn[0] !== null, r = this.s.slots.river[0] !== null;
    if (f > 0 && f < 3) return `The flop needs all three cards (${f} so far).`;
    if ((t || r) && f < 3) return 'Fill in the flop before the turn and river.';
    if (r && !t) return 'Fill in the turn before the river.';
    return null;
  }

  // ---------- building ----------
  private build() {
    for (const g of ORDER) {
      const row = document.querySelector<HTMLElement>(`.slot-row[data-group="${g}"]`)!;
      for (let i = 0; i < SIZES[g]; i++) {
        const b = document.createElement('button');
        b.className = 'slot'; b.dataset.group = g; b.dataset.i = String(i);
        b.onclick = () => { this.s.active = { group: g, i }; this.render(); };
        b.oncontextmenu = (e) => { e.preventDefault(); this.setSlot(g, i, null); };
        row.append(b);
      }
    }
    const picker = $('picker');
    for (const s of [3, 2, 1, 0]) for (let r = 12; r >= 0; r--) {
      const c = r * 4 + s;
      const b = document.createElement('button');
      b.className = 'pick'; b.dataset.c = String(c);
      b.append(cardFace(RANKS[r] + SUITS[s], 'sm'));
      b.setAttribute('aria-label', cardName(c));
      b.onclick = () => this.pick(c);
      picker.append(b);
    }
    $('pk-random').onclick = () => this.randomDeal();
    $('pk-next').onclick = () => this.nextCard();
    $('pk-clear').onclick = () => { for (const g of ORDER) this.s.slots[g].fill(null); this.s.active = { group: 'hero', i: 0 }; this.changed(); };
    const opps = $<HTMLSelectElement>('pk-opps');
    for (let n = 1; n <= 9; n++) opps.append(new Option(String(n), String(n)));
    opps.onchange = () => { this.s.opps = +opps.value; this.changed(); };
    document.querySelectorAll<HTMLButtonElement>('#range-mode button').forEach((b) => { b.onclick = () => { this.s.mode = b.dataset.mode as 'any' | 'range'; this.changed(); }; });
    const preset = $<HTMLSelectElement>('range-preset');
    preset.append(new Option('Presets…', ''));
    for (const p of PRESETS) preset.append(new Option(p.label, p.id));
    for (const st of SEATS) preset.append(new Option(`Opens from: ${st.label}`, `seat:${st.id}`));
    preset.onchange = () => { if (preset.value) this.applyPreset(preset.value); };
    const grid = $('range-grid');
    for (let k = 0; k < 169; k++) {
      const b = document.createElement('button');
      b.className = 'hc'; b.dataset.k = String(k); b.textContent = className(k);
      b.title = `${className(k)}: ${comboCount(k)} ways to be dealt, ${STRENGTH[k]}% vs a random hand`;
      b.onpointerdown = (e) => { e.preventDefault(); this.painting = !this.s.range[k]; this.paintCell(k); };
      b.onpointerenter = () => { if (this.painting !== null) this.paintCell(k); };
      b.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.painting = !this.s.range[k]; this.paintCell(k); this.painting = null; this.changed(); } };
      grid.append(b);
    }
    window.addEventListener('pointerup', () => { if (this.painting !== null) { this.painting = null; this.changed(); } });
    $('range-apply').onclick = () => {
      const { range, bad } = parseRange(expand($<HTMLInputElement>('range-text').value));
      this.s.range = range; this.s.mode = 'range'; this.s.preset = '';
      this.changed();
      if (bad.length) this.status(`Didn't understand: ${bad.join(', ')}. Use hands like AA, AKs, T9o, or 77+.`, 'bad');
    };
    $('range-clear').onclick = () => { this.s.range = emptyRange(); this.s.mode = 'range'; this.changed(); };
    for (const id of ['d-pot', 'd-call', 'd-raise', 'd-implied']) $<HTMLInputElement>(id).oninput = () => this.readInputs();
    $<HTMLInputElement>('d-fold').oninput = () => this.readInputs();
    const tabs = $('theory-tabs');
    for (const t of THEORY) {
      const b = document.createElement('button');
      b.textContent = t.label; b.dataset.t = t.id; b.setAttribute('role', 'tab');
      b.onclick = () => { this.s.theory = t.id; this.save(); this.renderTheory(); };
      tabs.append(b);
    }
    const seat = $<HTMLSelectElement>('seat');
    for (const st of SEATS) seat.append(new Option(st.label, st.id));
    seat.onchange = () => { this.s.seat = seat.value; this.save(); this.renderSeat(); };
    const sg = $('seat-grid');
    for (let k = 0; k < 169; k++) { const d = document.createElement('span'); d.className = 'hc'; d.textContent = className(k); sg.append(d); }
    $('seat-use').onclick = () => this.applyPreset(`seat:${this.s.seat}`);
  }

  private paintCell(k: number) {
    this.s.range[k] = this.painting!;
    this.s.mode = 'range'; this.s.preset = '';
    $('range-grid').children[k].classList.toggle('on', this.painting!);
    this.renderRangeInfo();
  }

  applyPreset(id: string) {
    const p = PRESETS.find((x) => x.id === id);
    this.s.range = id.startsWith('seat:') ? seatRange(id.slice(5)) : p ? p.range() : this.s.range;
    this.s.preset = id; this.s.mode = id === 'any' ? 'any' : 'range';
    if (id === 'any') this.s.range = fullRange();
    this.changed();
  }

  private readInputs() {
    const v = (id: string) => { const x = parseFloat($<HTMLInputElement>(id).value); return Number.isFinite(x) && x >= 0 ? x : 0; };
    this.s.pot = v('d-pot'); this.s.call = v('d-call'); this.s.raise = v('d-raise'); this.s.implied = v('d-implied');
    this.s.fold = +$<HTMLInputElement>('d-fold').value;
    this.save();
    this.renderDecision();
    this.renderTheory();
  }

  // ---------- picking cards ----------
  pick(c: number) {
    const at = this.used().get(c);
    if (at) { this.setSlot(at.group, at.i, null); this.s.active = at; this.render(); return; }
    const a = this.s.active ?? this.firstEmpty();
    if (!a) { this.status('Every spot is full. Click a spot to change it.', 'bad'); return; }
    this.setSlot(a.group, a.i, c, true);
  }
  private firstEmpty(): { group: Group; i: number } | null {
    for (const g of ORDER) { const i = this.s.slots[g].indexOf(null); if (i >= 0) return { group: g, i }; }
    return null;
  }
  setSlot(g: Group, i: number, c: number | null, advance = false) {
    this.s.slots[g][i] = c;
    if (advance) {
      // Move on to the next empty spot in reading order (hero, flop, turn, river), then stop.
      const order = ORDER.flatMap((gg) => this.s.slots[gg].map((_, j) => ({ group: gg, i: j })));
      const k = order.findIndex((o) => o.group === g && o.i === i);
      this.s.active = order.slice(k + 1).find((o) => this.s.slots[o.group][o.i] === null && (o.group !== 'dead' || g === 'dead')) ?? null;
    }
    this.changed();
  }
  /** Type a card: rank then suit. */
  private typed = '';
  onKey(e: KeyboardEvent): boolean {
    const k = e.key;
    if (k === 'Backspace' || k === 'Delete') { if (this.s.active) { this.setSlot(this.s.active.group, this.s.active.i, null); return true; } return false; }
    if (/^[2-9tjqka]$/i.test(k) && !this.typed) { this.typed = k.toUpperCase(); return true; }
    if (this.typed && /^[cdhs]$/i.test(k)) {
      const c = RANKS.indexOf(this.typed) * 4 + SUITS.indexOf(k.toLowerCase());
      this.typed = '';
      this.pick(c);
      return true;
    }
    this.typed = '';
    if (k === 'r' || k === 'R') { this.randomDeal(); return true; }
    if (k === 'n' || k === 'N') { this.nextCard(); return true; }
    return false;
  }
  randomDeal() {
    for (const g of ['hero', 'flop', 'turn', 'river'] as Group[]) this.s.slots[g].fill(null);
    const used = new Set(this.dead);
    const draw = () => { let c: number; do { c = Math.floor(Math.random() * 52); } while (used.has(c)); used.add(c); return c; };
    this.s.slots.hero = [draw(), draw()];
    this.s.active = { group: 'flop', i: 0 };
    this.changed();
  }
  nextCard() {
    if (this.hero.length < 2) { this.randomDeal(); return; }
    if (this.boardProblem()) { this.status(this.boardProblem()!, 'bad'); return; }
    const used = new Set(this.used().keys());
    const draw = () => { let c: number; do { c = Math.floor(Math.random() * 52); } while (used.has(c)); used.add(c); return c; };
    const n = this.board.length;
    if (n === 0) this.s.slots.flop = [draw(), draw(), draw()];
    else if (n === 3) this.s.slots.turn = [draw()];
    else if (n === 4) this.s.slots.river = [draw()];
    else { this.status('The river is out: all five board cards are dealt. Clear or deal new cards.', ''); return; }
    this.changed();
  }

  changed() { this.save(); this.render(); this.schedule(); }

  // ---------- equity in the worker ----------
  schedule(delay = 120) { clearTimeout(this.timer); this.timer = window.setTimeout(() => this.run(), delay); }
  input(): EquityInput {
    return { hero: this.hero, board: this.board, dead: this.dead, opponents: this.s.opps, range: this.s.mode === 'range' ? this.s.range : null };
  }
  private run() {
    if (this.hero.length < 2) { this.result = null; this.resultKey = ''; this.status(this.hero.length ? 'Pick your second card.' : 'Pick your two cards to start: click a spot, then a card.'); this.renderEquity(); return; }
    const bp = this.boardProblem();
    if (bp) { this.status(bp, 'bad'); return; }
    if (this.s.mode === 'range' && rangeCombos(this.s.range) === 0) { this.status('The opponent range is empty. Pick some hands on the grid, or choose Any hand.', 'bad'); return; }
    const inp = this.input();
    const key = JSON.stringify(inp);
    if (key === this.resultKey && this.result) return;
    if (this.busy && this.worker) { this.worker.terminate(); this.worker = null; }
    if (!this.worker) {
      this.worker = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.onResult(e.data);
      this.worker.onerror = (e) => { this.busy = false; this.status(`The equity worker failed: ${e.message}`, 'bad'); };
    }
    const id = ++this.reqId;
    this.busy = true;
    this.resultKey = key;
    this.status('Working out your equity…', 'thinking');
    $('eq-progress').style.width = '5%';
    this.worker.postMessage({ id, kind: 'equity', input: inp, trials: this.s.opps > 3 ? 120_000 : 150_000 } satisfies WorkerRequest);
  }
  private onResult(m: WorkerResponse) {
    if (m.id !== this.reqId) return;
    if (m.kind === 'error') { this.busy = false; this.result = null; this.resultKey = ''; this.status(m.message, 'bad'); this.renderEquity(); return; }
    if (m.kind !== 'equity') return;
    this.result = m.result;
    if (m.final) {
      this.busy = false;
      $('eq-progress').style.width = '0';
      if (m.result.impossible) this.status('No hand in the opponent range fits the cards on show. Widen the range.', 'bad');
      else this.status(this.summary(m.result), 'ok');
    } else $('eq-progress').style.width = `${Math.min(95, (100 * m.result.trials) / 150_000)}%`;
    this.renderEquity(m.ms, m.final ? m.cost : undefined);
    this.renderDecision();
  }
  private summary(r: EquityResult): string {
    const need = potOdds(this.s.pot, this.s.call);
    const street = ['before the flop', '', '', 'on the flop', 'on the turn', 'on the river'][this.board.length];
    const opp = this.s.opps === 1 ? 'one opponent' : `${this.s.opps} opponents`;
    const vs = this.s.mode === 'range' ? `with ${rangePercent(this.s.range).toFixed(0)}% of hands` : 'with any hand';
    let t = `${street[0].toUpperCase()}${street.slice(1)}, you win ${pct(r.equity)} against ${opp} ${vs}.`;
    if (this.s.call > 0) t += r.equity >= need ? ` That's more than the ${pct(need)} you need to call.` : ` You need ${pct(need)} to call.`;
    return t;
  }

  // ---------- rendering ----------
  render() {
    const used = this.used();
    document.querySelectorAll<HTMLButtonElement>('#table-card .slot').forEach((b) => {
      const g = b.dataset.group as Group, i = +b.dataset.i!;
      const c = this.s.slots[g][i];
      b.replaceChildren(c === null ? Object.assign(document.createElement('span'), { className: 'empty', textContent: '+' }) : cardFace(cardText(c), 'md'));
      const act = this.s.active?.group === g && this.s.active.i === i;
      b.classList.toggle('active', act);
      b.setAttribute('aria-pressed', String(act));
      b.setAttribute('aria-label', c === null ? `Empty ${GROUP_WORDS[g]} spot${act ? ', picked' : ''}` : `${GROUP_WORDS[g]}: ${cardName(c)}${act ? ', picked' : ''}`);
    });
    document.querySelectorAll<HTMLButtonElement>('#picker .pick').forEach((b) => {
      const at = used.get(+b.dataset.c!);
      b.classList.toggle('used', !!at);
      b.title = at ? `In ${GROUP_WORDS[at.group]}: click to take it back` : 'Put this card in the picked spot';
    });
    $<HTMLSelectElement>('pk-opps').value = String(this.s.opps);
    document.querySelectorAll<HTMLButtonElement>('#range-mode button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === this.s.mode)));
    $('range-wrap').classList.toggle('off', this.s.mode === 'any');
    [...$('range-grid').children].forEach((b, k) => b.classList.toggle('on', this.s.range[k]));
    $<HTMLSelectElement>('range-preset').value = PRESETS.some((p) => p.id === this.s.preset) || this.s.preset.startsWith('seat:') ? this.s.preset : '';
    this.renderRangeInfo();
    for (const [id, k] of [['d-pot', 'pot'], ['d-call', 'call'], ['d-raise', 'raise'], ['d-implied', 'implied']] as const) {
      const el = $<HTMLInputElement>(id);
      if (document.activeElement !== el) el.value = String(this.s[k]);
    }
    $<HTMLInputElement>('d-fold').value = String(this.s.fold);
    this.renderEquity();
    this.renderOuts();
    this.renderDecision();
    this.renderTheory();
    this.renderSeat();
  }
  private renderRangeInfo() {
    const p = rangePercent(this.s.range);
    $('range-info').textContent = this.s.mode === 'any' ? 'Random cards (100%)' : `${p.toFixed(1)}% of hands · ${rangeCombos(this.s.range)} combos`;
    const t = $<HTMLInputElement>('range-text');
    if (document.activeElement !== t) t.value = this.s.mode === 'range' ? compact(this.s.range) : '';
  }
  renderEquity(ms?: number, cost?: number) {
    const r = this.result;
    const show = !!r && !r.impossible && this.hero.length === 2;
    $('eq-pct').textContent = show ? pct(r!.equity) : '–';
    $<HTMLElement>('eq-win').style.width = show ? `${100 * r!.win}%` : '0';
    $<HTMLElement>('eq-tie').style.width = show ? `${100 * r!.tie}%` : '0';
    $('eq-w').textContent = show ? pct(r!.win) : '–';
    $('eq-t').textContent = show ? pct(r!.tie) : '–';
    $('eq-l').textContent = show ? pct(r!.lose) : '–';
    const made = this.hero.length === 2 && this.board.length >= 3 ? handName(evaluate([...this.hero, ...this.board])) : this.hero.length === 2 ? startName(this.hero) : '';
    $('eq-hand').textContent = made;
    if (!show) { $('eq-method').textContent = ''; $('eq-cat-list').replaceChildren(); return; }
    if (r!.method === 'exact') $('eq-method').textContent = `Exact · every one of ${r!.trials.toLocaleString('en-US')} deals${ms !== undefined ? ` · ${Math.round(ms)} ms` : ''}`;
    else {
      const moe = 1.96 * Math.sqrt((r!.equity * (1 - r!.equity)) / Math.max(1, r!.trials));
      $('eq-method').textContent = `Monte Carlo · ${r!.trials.toLocaleString('en-US')} random deals · ±${(100 * moe).toFixed(2)}%${cost === -1 && ms !== undefined ? ` · ${Math.round(ms)} ms` : ''}`;
    }
    $('eq-cat-list').replaceChildren(...r!.categories.map((p, k) => ({ p, k })).filter((x) => x.p > 0).reverse().map(({ p, k }) => {
      const row = document.createElement('div');
      row.className = 'cat';
      row.title = CATEGORY_HELP[k];
      row.innerHTML = `<span>${CATEGORY_NAMES[k]}</span><i style="width:${Math.max(1, 100 * p)}%"></i><span class="mono">${pct(p)}</span>`;
      return row;
    }));
  }
  private renderOuts() {
    const body = $('outs-body');
    const o = this.hero.length === 2 ? findOuts(this.hero, this.board, this.dead) : null;
    if (!o) {
      $('outs-total').textContent = '';
      body.innerHTML = `<p class="muted">${this.board.length === 5 ? 'All the cards are out: no more outs. Your hand is what it is.' : 'Outs show once the flop is out: the cards still to come that would improve your hand.'}</p>`;
      return;
    }
    $('outs-total').textContent = `${o.total} out${o.total === 1 ? '' : 's'}`;
    body.replaceChildren();
    if (!o.total) { body.innerHTML = `<p class="muted">No single card improves you to a better kind of hand (you have ${CATEGORY_NAMES[o.current].toLowerCase()}).</p>`; return; }
    for (const g of o.groups) {
      const row = document.createElement('div');
      row.className = 'out-row';
      const lab = document.createElement('span');
      lab.className = 'out-lab'; lab.textContent = `${g.name} · ${g.cards.length}`;
      const cards = document.createElement('span');
      cards.className = 'out-cards';
      cards.append(...g.cards.map((c) => cardFace(cardText(c), 'xs')));
      row.append(lab, cards);
      body.append(row);
    }
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = this.board.length === 3
      ? `Rule of 4: ${o.total} × 4 ≈ ${o.ruleOf}% to hit by the river. Exact: ${o.exactNext!.toFixed(1)}%.`
      : `Rule of 2: ${o.total} × 2 ≈ ${o.ruleOf}% to hit on the river. Exact: ${o.exactNext!.toFixed(1)}%.`;
    body.append(p);
  }
  renderDecision() {
    const r = this.result;
    const table = $('ev-table');
    const eq = r && !r.impossible ? r.equity : null;
    if (eq === null) { table.innerHTML = '<tr><td class="muted">Pick your cards to see the expected value of each choice.</td></tr>'; $('d-why').textContent = ''; $('d-fold-out').textContent = `${this.s.fold}%`; return; }
    const d = decide({ pot: this.s.pot, toCall: this.s.call, raiseTo: this.s.raise, foldChance: this.s.fold / 100, implied: this.s.implied, equity: eq });
    $('d-fold-out').textContent = `${this.s.fold}%`;
    const max = Math.max(1, ...d.choices.map((c) => Math.abs(c.ev)));
    table.replaceChildren(...d.choices.map((c) => {
      const tr = document.createElement('tr');
      tr.className = c === d.best ? 'best' : '';
      tr.title = c.note;
      const w = (50 * Math.abs(c.ev)) / max;
      tr.innerHTML = `<th>${c === d.best ? '★ ' : ''}${c.action[0].toUpperCase()}${c.action.slice(1)}</th><td class="bar"><span class="axis"></span><i class="${c.ev < 0 ? 'neg' : 'pos'}" style="width:${w}%;${c.ev < 0 ? `right:50%` : 'left:50%'}"></i></td><td class="mono">${fmtEV(c.ev)}</td>`;
      return tr;
    }));
    const po = this.s.call > 0 ? `Pot odds: you need ${pct(d.potOdds)} equity${this.s.implied > 0 ? ` (${pct(d.neededImplied)} with implied odds)` : ''}; you have ${pct(eq)}. ` : '';
    $('d-why').textContent = `${po}${d.why}`;
  }
  renderTheory() {
    document.querySelectorAll<HTMLButtonElement>('#theory-tabs button').forEach((b) => { b.setAttribute('aria-selected', String(b.dataset.t === this.s.theory)); b.classList.toggle('on', b.dataset.t === this.s.theory); });
    const t = THEORY.find((x) => x.id === this.s.theory)!;
    $('theory-body').innerHTML = t.html(this);
  }
  renderSeat() {
    const st = SEATS.find((x) => x.id === this.s.seat)!;
    $<HTMLSelectElement>('seat').value = st.id;
    const r = seatRange(st.id);
    [...$('seat-grid').children].forEach((d, k) => d.classList.toggle('on', r[k]));
    $('seat-note').textContent = st.note;
    $('seat-info').textContent = `${rangePercent(r).toFixed(0)}% of hands`;
  }

  /** Live example for the tour. */
  demo(id: string) {
    const c = (t: string) => RANKS.indexOf(t[0]) * 4 + SUITS.indexOf(t[1]);
    if (id === 'deal') {
      for (const g of ORDER) this.s.slots[g].fill(null);
      this.s.slots.hero = [c('Ah'), c('Kh')]; this.s.slots.flop = [c('Qh'), c('Jd'), c('4h')];
      this.s.active = { group: 'turn', i: 0 };
    } else if (id === 'range') { this.s.mode = 'range'; this.s.range = topPercent(15); this.s.preset = 'p15'; }
    else if (id === 'decide') { this.s.pot = 100; this.s.call = 50; this.s.raise = 150; this.s.fold = 30; this.s.implied = 0; }
    else if (id === 'theory') this.s.theory = 'mdf';
    else if (id === 'chart') this.s.seat = 'btn';
    if (['deal', 'range', 'equity', 'decide'].includes(id) && this.hero.length < 2) { this.s.slots.hero = [c('Ah'), c('Kh')]; this.s.slots.flop = [c('Qh'), c('Jd'), c('4h')]; }
    this.render();
    this.schedule(0);
  }
}

/** "AKs" style name of two hole cards, with its preflop strength. */
function startName(h: number[]): string {
  const k = classOf(h[0], h[1]);
  return `${className(k)} · ${STRENGTH[k]}% vs a random hand`;
}

/** A range as text, strongest hands first. */
const compact = (r: Range) => rangeText(r);
/** Expand "77+" and "ATs+" shorthands before parsing. */
export function expand(text: string): string {
  return text.replace(/\b([2-9TJQKA])\1\+/gi, (_m, p: string) => {
    const i = RANKS.indexOf(p.toUpperCase());
    return RANKS.slice(i).split('').map((x) => x + x).join(' ');
  }).replace(/\b([2-9TJQKA])([2-9TJQKA])([so])\+/gi, (_m, a: string, b: string, t: string) => {
    const hi = RANKS.indexOf(a.toUpperCase()), lo = RANKS.indexOf(b.toUpperCase());
    return RANKS.slice(lo, hi).split('').map((x) => a.toUpperCase() + x + t.toLowerCase()).join(' ');
  });
}

interface Topic { id: string; label: string; html: (p: PokerTab) => string }
const THEORY: Topic[] = [
  { id: 'ev', label: 'EV', html: (p) => {
    const eq = p.result?.equity;
    const e = eq === undefined ? '' : `<p class="calc">Here: ${pct(eq)} × ${num(p.s.pot)} − ${pct(1 - eq)} × ${num(p.s.call)} = <b>${fmtEV(eq * p.s.pot - (1 - eq) * p.s.call)}</b> chips for a call.</p>`;
    return `<p><b>Expected value</b> is what a choice wins or loses on average, if you could make it many times. You can't control single results, only the choices, so the best long-run play is the one with the highest EV.</p><p>Calling: <span class="mono">EV = equity × pot − (1 − equity) × call</span>. Folding is 0 from here on: chips already in the pot aren't yours any more.</p>${e}`;
  } },
  { id: 'odds', label: 'Pot odds', html: (p) => {
    const po = potOdds(p.s.pot, p.s.call);
    return `<p><b>Pot odds</b> are the price of a call. If you must pay ${num(p.s.call)} into a pot of ${num(p.s.pot)}, the pot becomes ${num(p.s.pot + p.s.call)} and you paid ${num(p.s.call)} of it.</p><p class="calc">You need at least ${num(p.s.call)} ÷ ${num(p.s.pot + p.s.call)} = <b>${pct(po)}</b> equity to break even.</p><p><b>Implied odds</b>: if you'll win ${num(p.s.implied)} more on later streets when you hit, you only need ${num(p.s.call)} ÷ ${num(p.s.pot + p.s.call + p.s.implied)} = ${pct(p.s.call / Math.max(1e-9, p.s.pot + p.s.call + p.s.implied))}. Be honest: people don't always pay you off.</p>`;
  } },
  { id: 'ranges', label: 'Ranges', html: (p) => `<p>You never see an opponent's cards, so think of <b>every hand they could hold</b>: their range. A tight player who raises first might hold the top 15% of hands; someone defending the big blind holds many more.</p><p>The grid shows all 169 kinds of starting hands. Pairs can be dealt 6 ways, suited hands 4 and offsuit hands 12: 1,326 in all. The opponent range now covers <b>${p.s.mode === 'any' ? '100%' : `${rangePercent(p.s.range).toFixed(1)}%`}</b> of hands.</p><p>Your equity against a range is the average over all those hands, weighted by how often each can be dealt given the cards you can see.</p>` },
  { id: 'mdf', label: 'Bluffs & MDF', html: (p) => {
    const before = Math.max(0, p.s.pot - p.s.call), bet = p.s.call;
    if (bet <= 0) return '<p>Enter a bet to call above to see how often to defend and how often to bluff at that size.</p>' + MDF_TEXT;
    return `<p class="calc">They bet ${num(bet)} into ${num(before)}. To stop any-two-card bluffs from profiting, defend (call or raise) at least <b>${pct(mdf(before, bet), 0)}</b> of your range: that's the minimum defense frequency.</p><p class="calc">A balanced bettor at this size bluffs <b>${pct(bluffShare(before, bet), 0)}</b> of their bets (${num(bluffsPerValue(before, bet) * 10)} bluffs for every 10 value bets), so your call needs ${pct(bet / (before + 2 * bet), 0)} equity.</p>${MDF_TEXT}`;
  } },
  { id: 'gto', label: 'GTO', html: () => '<p><b>Game theory optimal</b> (GTO) play is a strategy that can\'t be beaten in the long run, whatever the opponent does: it mixes bets and bluffs in just the right proportions so that no counter-strategy gains.</p><p>Finding it for real poker needs a <b>solver</b> that runs for minutes or hours on one spot. This app doesn\'t do that. It shows the building blocks (EV, pot odds, equity against ranges, MDF and balanced bluffing) that solvers combine, and gives a simple one-decision recommendation.</p><p>Against real players, the most money comes from spotting their mistakes (calling too much, folding too much) and adjusting: that is <b>exploitative</b> play.</p>' },
];
const MDF_TEXT = '<p class="muted">Why: if you fold more than this, a bluff with any cards shows a profit. If they bluff more than the balanced share, calling profits; less, folding does. In balance, neither player can gain by changing alone: that is a game-theory equilibrium.</p>';
