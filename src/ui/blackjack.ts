/**
 * The Blackjack tab: table rules and the house edge, the best play for any
 * hand with the EV of every choice, the strategy chart for those rules, the
 * trainer, and Hi-Lo counting with the Illustrious 18.
 */
import { ACTION_LABELS, CODE_HELP, DEFAULT_RULES, UPCARDS, handEVs, handValue, isSoft, rankLabel, type ActionId, type Chart, type Code, type HandEVs, type Rules } from '../blackjack/engine';
import { ILLUSTRIOUS_18, countAction, deviationFor, edgeWithCount, takeInsurance } from '../blackjack/counting';
import { Shoe, playOut } from '../blackjack/shoe';
import { cardFace } from './cards';
import type { WorkerRequest, WorkerResponse } from '../worker';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const KEY = 'card-solver-blackjack';
const SUIT = 'cdhs';
const TENS = ['T', 'J', 'Q', 'K'];

export interface Stats { hands: number; right: number; streak: number; best: number; lost: number }
export interface BjState { rules: Rules; p1: number; p2: number; up: number; counting: boolean; showCount: boolean; stats: Stats }
export const freshBj = (): BjState => ({ rules: { ...DEFAULT_RULES }, p1: 10, p2: 6, up: 10, counting: false, showCount: true, stats: { hands: 0, right: 0, streak: 0, best: 0, lost: 0 } });

const fmt = (x: number) => `${x >= 0.0005 ? '+' : x <= -0.0005 ? '−' : ''}${Math.abs(x).toFixed(3)}`;
const pct = (x: number, d = 2) => `${(x * 100).toFixed(d)}%`;
const total = (cards: number[]) => handValue(cards.reduce((a, b) => a + b, 0), cards.includes(1));
const handWords = (a: number, b: number) => {
  const v = handValue(a + b, a === 1 || b === 1);
  if (v === 21 && (a === 1 || b === 1)) return 'Blackjack';
  if (a === b) return `Pair of ${a === 1 ? 'aces' : `${rankLabel(a)}s`}`;
  return `${isSoft(a + b, a === 1 || b === 1) ? 'Soft' : 'Hard'} ${v}`;
};

interface Round { player: number[]; up: number; hole: number; faces: string[]; answered: boolean; evs: HandEVs | null; tc: number }

export class BlackjackTab {
  s: BjState;
  private worker: Worker | null = null;
  private reqId = 0;
  private cache = new Map<string, { ev: number; chart: Chart }>();
  baseEV: number | null = null;
  chart: Chart | null = null;
  shoe: Shoe;
  round: Round | null = null;

  constructor(private status: (t: string, kind?: '' | 'ok' | 'bad' | 'thinking') => void) {
    this.s = this.load();
    this.shoe = new Shoe(this.s.rules.decks);
    this.build();
    this.render();
    this.compute();
  }

  private load(): BjState {
    const f = freshBj();
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<BjState> | null;
      if (!raw || typeof raw !== 'object') return f;
      const r = raw.rules ?? {} as Partial<Rules>;
      if ([1, 2, 4, 6, 8].includes(r.decks as number)) f.rules.decks = r.decks!;
      for (const k of ['h17', 'das', 'surrender', 'peek'] as const) if (typeof r[k] === 'boolean') f.rules[k] = r[k]!;
      if ([1, 1.2, 1.5].includes(r.bjPays as number)) f.rules.bjPays = r.bjPays!;
      for (const k of ['p1', 'p2', 'up'] as const) if (Number.isInteger(raw[k]) && raw[k]! >= 1 && raw[k]! <= 10) f[k] = raw[k]!;
      f.counting = raw.counting === true; f.showCount = raw.showCount !== false;
      const st = raw.stats;
      if (st && typeof st === 'object') for (const k of ['hands', 'right', 'streak', 'best', 'lost'] as const) if (typeof st[k] === 'number' && Number.isFinite(st[k])) f.stats[k] = Math.max(0, st[k]);
    } catch { /* corrupt: fresh */ }
    return f;
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* blocked */ } }
  snapshot() { return { s: JSON.parse(JSON.stringify(this.s)) as BjState, round: this.round ? JSON.parse(JSON.stringify(this.round)) as Round : null, shoe: { cards: this.shoe.cards.slice(), pos: this.shoe.pos, running: this.shoe.running } }; }
  restore(x: ReturnType<BlackjackTab['snapshot']>) {
    this.s = x.s; this.round = x.round;
    if (this.shoe.cards.length !== x.shoe.cards.length) this.shoe = new Shoe(this.s.rules.decks);
    this.shoe.cards = x.shoe.cards; this.shoe.pos = x.shoe.pos; this.shoe.running = x.shoe.running;
    this.render(); this.compute();
  }

  // ---------- building ----------
  private build() {
    const bind = (id: string, f: (el: HTMLInputElement & HTMLSelectElement) => void) => { const el = $<HTMLInputElement & HTMLSelectElement>(id); el.onchange = () => { f(el); this.rulesChanged(); }; };
    bind('r-decks', (el) => { this.s.rules.decks = +el.value; });
    bind('r-h17', (el) => { this.s.rules.h17 = el.value === 'h17'; });
    bind('r-bj', (el) => { this.s.rules.bjPays = +el.value; });
    bind('r-das', (el) => { this.s.rules.das = el.checked; });
    bind('r-sur', (el) => { this.s.rules.surrender = el.checked; });
    bind('r-peek', (el) => { this.s.rules.peek = el.checked; });
    const ranks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (const [id, key] of [['pick-p1', 'p1'], ['pick-p2', 'p2'], ['pick-up', 'up']] as const) {
      const row = $(id);
      for (const r of ranks) {
        const b = document.createElement('button');
        b.textContent = rankLabel(r); b.dataset.r = String(r); b.setAttribute('role', 'radio');
        b.setAttribute('aria-label', r === 1 ? 'Ace' : r === 10 ? '10 or picture card' : String(r));
        b.onclick = () => { this.s[key] = r; this.save(); this.renderHand(); };
        row.append(b);
      }
    }
    document.querySelectorAll<HTMLButtonElement>('#tr-actions button').forEach((b) => { b.onclick = () => this.answer(b.dataset.a as ActionId); });
    $('tr-deal').onclick = () => this.deal();
    $('tr-reset').onclick = () => { this.s.stats = freshBj().stats; this.save(); this.renderStats(); };
    $<HTMLInputElement>('count-on').onchange = (e) => { this.s.counting = (e.target as HTMLInputElement).checked; this.save(); this.renderCount(); this.renderHand(); };
    $<HTMLInputElement>('count-show').onchange = (e) => { this.s.showCount = (e.target as HTMLInputElement).checked; this.save(); this.renderCount(); };
    $('i18-table').innerHTML = '<tr><th>Hand</th><th>Index</th><th>At or above</th><th>Below</th></tr>' + ILLUSTRIOUS_18.map((d) => `<tr data-id="${d.id}"><td>${d.label}</td><td class="mono">${d.index >= 0 ? '+' : ''}${d.index}</td><td>${cap(d.above)}</td><td>${cap(d.below)}</td></tr>`).join('');
    $('chart-legend').innerHTML = (['H', 'S', 'D', 'Ds', 'P', 'R', 'Rs', 'Rp'] as Code[]).map((c) => `<span><b class="code c-${c}">${c}</b> ${CODE_HELP[c]}</span>`).join('');
  }

  private rulesChanged() {
    if (this.shoe.cards.length !== this.s.rules.decks * 52) { this.shoe = new Shoe(this.s.rules.decks); this.round = null; }
    this.save();
    this.render();
    this.compute();
  }
  private rulesKey() { return JSON.stringify(this.s.rules); }

  /** House edge and chart for the rules, from the worker (cached per rule set). */
  private pending = new Map<number, string>();
  compute() {
    const key = this.rulesKey();
    const hit = this.cache.get(key);
    if (hit) { this.baseEV = hit.ev; this.chart = hit.chart; this.renderEdge(); this.renderChart(); this.renderCount(); return; }
    this.baseEV = null; this.chart = null;
    this.renderEdge(); this.renderChart();
    if (!this.worker) {
      this.worker = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const m = e.data;
        const k = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.kind === 'error') { this.status(m.message, 'bad'); return; }
        if (m.kind !== 'blackjack' || k === undefined) return;
        this.cache.set(k, { ev: m.ev, chart: m.chart });
        if (k !== this.rulesKey()) return;
        this.baseEV = m.ev; this.chart = m.chart;
        this.renderEdge(); this.renderChart(); this.renderCount();
      };
    }
    const id = ++this.reqId;
    this.pending.set(id, key);
    this.worker.postMessage({ id, kind: 'blackjack', rules: { ...this.s.rules } } satisfies WorkerRequest);
  }

  // ---------- rendering ----------
  render() {
    const r = this.s.rules;
    $<HTMLSelectElement>('r-decks').value = String(r.decks);
    $<HTMLSelectElement>('r-h17').value = r.h17 ? 'h17' : 's17';
    $<HTMLSelectElement>('r-bj').value = String(r.bjPays);
    $<HTMLInputElement>('r-das').checked = r.das;
    $<HTMLInputElement>('r-sur').checked = r.surrender;
    $<HTMLInputElement>('r-peek').checked = r.peek;
    $<HTMLInputElement>('r-sur').disabled = !r.peek;
    $<HTMLInputElement>('count-on').checked = this.s.counting;
    $<HTMLInputElement>('count-show').checked = this.s.showCount;
    $('chart-rules').textContent = `${r.decks} deck${r.decks > 1 ? 's' : ''} · ${r.h17 ? 'H17' : 'S17'} · ${r.das ? 'DAS' : 'no DAS'} · ${r.surrender && r.peek ? 'LS' : 'no surrender'} · ${r.bjPays === 1.5 ? '3:2' : r.bjPays === 1.2 ? '6:5' : '1:1'}${r.peek ? '' : ' · no peek'}`;
    this.renderEdge();
    this.renderHand();
    this.renderChart();
    this.renderRound();
    this.renderStats();
    this.renderCount();
  }
  private renderEdge() {
    const el = $('edge');
    if (this.baseEV === null) { el.textContent = '…'; return; }
    el.textContent = this.baseEV <= 0 ? `House edge ${pct(-this.baseEV)}` : `Player edge ${pct(this.baseEV)}`;
    el.classList.toggle('good', this.baseEV > 0);
    $('edge-note').textContent = `With perfect basic strategy you lose about ${(Math.max(0, -this.baseEV) * 100).toFixed(2)} cents per $1 bet on average${this.baseEV > 0 ? ' (here you win!)' : ''}. ${this.s.rules.bjPays < 1.5 ? 'The short blackjack payout is the biggest cost: look for 3:2 tables. ' : ''}${this.s.rules.peek ? '' : 'Without a peek, a dealer blackjack also takes your doubles and splits. '}`;
  }
  /** EVs for the picked hand; with counting on, using the shoe as it stands in the trainer. */
  renderHand() {
    const { p1, p2, up } = this.s;
    for (const [id, v] of [['pick-p1', p1], ['pick-p2', p2], ['pick-up', up]] as const) $(id).querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.r! === v)));
    const show = $('bj-show');
    show.replaceChildren(group('You', [face(p1, 0), face(p2, 1)]), group('Dealer', [face(up, 2), cardFace('?', 'md')]));
    const h = handEVs(p1, p2, up, this.s.rules);
    $('hand-total').textContent = handWords(p1, p2);
    this.evTable($('bj-ev'), h, null);
    const why = $('bj-why');
    if (h.blackjack) { why.textContent = `Blackjack! It pays ${this.s.rules.bjPays === 1.5 ? '3 to 2' : this.s.rules.bjPays === 1.2 ? '6 to 5' : '1 to 1'}${this.s.rules.peek ? '' : ', unless the dealer has one too (then it\'s a push)'}. Nothing to decide.`; return; }
    const sorted = (Object.entries(h.ev) as [ActionId, number][]).sort((a, b) => b[1] - a[1]);
    const [best, second] = sorted;
    let t = `Best: ${ACTION_LABELS[best[0]]}, ${best[1] >= 0 ? `winning ${(best[1] * 100).toFixed(1)}%` : `losing ${(-best[1] * 100).toFixed(1)}%`} of your bet on average. `;
    if (second) t += `Next best is ${ACTION_LABELS[second[0]]} (${fmt(second[1])}), ${((best[1] - second[1]) * 100).toFixed(1)}% of a bet worse. `;
    if (best[1] < 0 && sorted.every(([, v]) => v < 0)) t += 'Every choice loses here, so pick the one that loses least. ';
    if (this.s.rules.peek && (up === 1 || up === 10)) t += 'These numbers assume the dealer has checked and has no blackjack. ';
    const dev = deviationFor(p1, p2, up);
    if (dev && this.s.counting) t += `Counting: ${dev.label} is one of the Illustrious 18. At a true count of ${dev.index >= 0 ? '+' : ''}${dev.index} or more, ${dev.above}; below it, ${dev.below}.`;
    why.textContent = t;
  }
  private evTable(table: HTMLElement, h: HandEVs, chosen: ActionId | null, correct?: ActionId) {
    const rows = (Object.entries(h.ev) as [ActionId, number][]).sort((a, b) => b[1] - a[1]);
    const max = Math.max(0.5, ...rows.map(([, v]) => Math.abs(v)));
    const star = correct ?? h.best;
    table.replaceChildren(...rows.map(([a, v]) => {
      const tr = document.createElement('tr');
      tr.className = (a === star ? 'best ' : '') + (a === chosen ? 'chosen' : '');
      const w = (50 * Math.abs(v)) / max;
      tr.innerHTML = `<th>${a === star ? '★ ' : ''}${ACTION_LABELS[a]}${a === chosen ? ' <small>(you)</small>' : ''}</th><td class="bar"><span class="axis"></span><i class="${v < 0 ? 'neg' : 'pos'}" style="width:${w}%;${v < 0 ? 'right:50%' : 'left:50%'}"></i></td><td class="mono">${fmt(v)}</td>`;
      return tr;
    }));
  }
  renderChart() {
    const box = $('bj-chart');
    if (!this.chart) { box.innerHTML = '<p class="muted">Working out the chart…</p>'; return; }
    const head = `<tr><th></th>${UPCARDS.map((u) => `<th>${rankLabel(u)}</th>`).join('')}</tr>`;
    const section = (title: string, rows: Chart['hard']) => `<table class="chart"><caption>${title}</caption>${head}${rows.map((r) => `<tr><th>${r.label}</th>${r.codes.map((c, k) => `<td><button class="code c-${c}" data-a="${r.cards[0]}" data-b="${r.cards[1]}" data-u="${UPCARDS[k]}" title="${r.label} vs ${rankLabel(UPCARDS[k])}: ${CODE_HELP[c]}. ${evText(r.evs[k])}">${c}</button></td>`).join('')}</tr>`).join('')}</table>`;
    box.innerHTML = section('Hard totals', this.chart.hard) + section('Soft totals (with an ace)', this.chart.soft) + section('Pairs', this.chart.pairs);
    box.querySelectorAll<HTMLButtonElement>('button.code').forEach((b) => {
      b.onclick = () => { this.s.p1 = +b.dataset.a!; this.s.p2 = +b.dataset.b!; this.s.up = +b.dataset.u!; this.save(); this.renderHand(); $('hand-card').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
    });
  }

  // ---------- trainer ----------
  deal() {
    let note = '';
    if (this.shoe.needsShuffle) { this.shoe.shuffle(); note = 'New shoe: the count starts again at 0. '; }
    const suit = () => SUIT[Math.floor(Math.random() * 4)];
    const faceOf = (r: number) => (r === 10 ? TENS[Math.floor(Math.random() * 4)] : r === 1 ? 'A' : String(r)) + suit();
    const p1 = this.shoe.deal(), up = this.shoe.deal(), p2 = this.shoe.deal(), hole = this.shoe.deal(false);
    const player = [p1, p2];
    this.round = { player, up, hole, faces: [faceOf(p1), faceOf(p2), faceOf(up), faceOf(hole)], answered: false, evs: null, tc: this.shoe.trueCount };
    // Exact EVs from the player's point of view: every unseen card (the hole card too) is still possible.
    const comp = this.shoe.remaining(); comp[hole]++; comp[p1]++; comp[p2]++; comp[up]++;
    this.round.evs = handEVs(p1, p2, up, this.s.rules, comp);
    const dealerBJ = total([up, hole]) === 21;
    if (this.round.evs.blackjack || (dealerBJ && this.s.rules.peek)) { this.finish(null, note); return; }
    const ins = this.s.counting && up === 1 ? ` Insurance? ${takeInsurance(this.round.tc) ? 'Yes: the true count is +3 or more.' : 'No: only at a true count of +3 or more.'}` : '';
    this.status(`${note}${handWords(p1, p2)} against a ${rankLabel(up)}. What do you do?${ins}`);
    $('tr-feedback').replaceChildren();
    this.renderRound(); this.renderCount();
  }
  allowed(): ActionId[] {
    const r = this.round;
    if (!r?.evs) return [];
    return (Object.keys(r.evs.ev) as ActionId[]);
  }
  answer(a: ActionId) {
    const r = this.round;
    if (!r || r.answered || !r.evs || !this.allowed().includes(a)) return;
    this.finish(a, '');
  }
  private finish(a: ActionId | null, note: string) {
    const r = this.round!;
    r.answered = true;
    const h = r.evs!;
    const fb = $('tr-feedback');
    fb.replaceChildren();
    let correct: ActionId = h.best;
    let devNote = '';
    if (this.s.counting && a) {
      const dev = countAction(r.player[0], r.player[1], r.up, r.tc, h.best, this.allowed());
      if (dev) { correct = dev; devNote = ` At a true count of ${r.tc.toFixed(1)}, the count says ${ACTION_LABELS[dev]} instead of ${ACTION_LABELS[h.best]} (${deviationFor(r.player[0], r.player[1], r.up)!.label}).`; }
    }
    const out = playOut(r.player, r.up, r.hole, a ?? 'stand', this.s.rules, this.shoe);
    r.player = out.hands.length === 1 ? out.hands[0].cards : r.player;
    (r as Round & { result?: typeof out }).result = out;
    let head: string, kind: '' | 'ok' | 'bad' = '';
    if (!a) head = h.blackjack ? (out.total > 0 ? `Blackjack! You win ${out.total}.` : 'Blackjack, but so does the dealer: push.') : 'The dealer has blackjack. Nothing you could do.';
    else {
      const ok = a === correct || Math.abs(h.ev[a]! - h.ev[correct]!) < 1e-9;
      const st = this.s.stats;
      st.hands++;
      if (ok) { st.right++; st.streak++; st.best = Math.max(st.best, st.streak); } else { st.streak = 0; st.lost += h.ev[correct]! - h.ev[a]!; }
      this.save();
      head = ok ? `✓ ${ACTION_LABELS[a]} is the best play.${devNote}` : `✗ ${ACTION_LABELS[correct]} was best: ${ACTION_LABELS[a]} costs ${((h.ev[correct]! - h.ev[a]!) * 100).toFixed(1)}% of a bet on average.${devNote}`;
      kind = ok ? 'ok' : 'bad';
      const t = document.createElement('table'); t.className = 'ev-table small';
      this.evTable(t, h, a, correct);
      fb.append(t);
    }
    const res = document.createElement('p');
    res.className = 'muted';
    res.textContent = `Result: ${out.hands.map((x) => x.note).join(', ')} (${out.total > 0 ? '+' : ''}${out.total}). Dealer: ${out.dealer.map(rankLabel).join(' ')} = ${total(out.dealer)}.`;
    fb.append(res);
    this.status(`${note}${head}`, kind);
    this.renderRound(); this.renderStats(); this.renderCount();
  }
  renderRound() {
    const r = this.round;
    const acts = document.querySelectorAll<HTMLButtonElement>('#tr-actions button');
    const allowed = this.allowed();
    acts.forEach((b) => { b.disabled = !r || r.answered || !allowed.includes(b.dataset.a as ActionId); });
    if (!r) { $('tr-dealer').replaceChildren(cardFace('?', 'md'), cardFace('?', 'md')); $('tr-player').replaceChildren(cardFace('?', 'md'), cardFace('?', 'md')); return; }
    const out = (r as Round & { result?: ReturnType<typeof playOut> }).result;
    const suitFor = (k: number) => SUIT[k % 4];
    const extra = (cards: number[], from: number, off: number) => cards.slice(from).map((c, k) => cardFace((c === 10 ? 'K' : c === 1 ? 'A' : String(c)) + suitFor(k + off), 'md'));
    $('tr-dealer').replaceChildren(cardFace(r.faces[2], 'md'), r.answered ? cardFace(r.faces[3], 'md') : cardFace('?', 'md'), ...(out ? extra(out.dealer, 2, 1) : []));
    if (out && out.hands.length > 1) {
      $('tr-player').replaceChildren(...out.hands.map((hh, i) => { const g = document.createElement('span'); g.className = 'split-hand'; g.append(cardFace(r.faces[i], 'md'), ...extra(hh.cards, 1, i)); return g; }));
    } else $('tr-player').replaceChildren(cardFace(r.faces[0], 'md'), cardFace(r.faces[1], 'md'), ...(out ? extra(out.hands[0].cards, 2, 2) : []));
  }
  renderStats() {
    const st = this.s.stats;
    $('tr-stats').textContent = st.hands ? `${st.right}/${st.hands} right (${Math.round((100 * st.right) / st.hands)}%) · streak ${st.streak} · best ${st.best} · cost ${(st.lost * 100).toFixed(1)}% of a bet` : 'No hands yet';
  }
  renderCount() {
    $('count-body').classList.toggle('off', !this.s.counting);
    const hide = !this.s.showCount;
    const tc = this.shoe.trueCount;
    $('c-run').textContent = hide ? '?' : `${this.shoe.running >= 0 ? '+' : ''}${this.shoe.running}`;
    $('c-true').textContent = hide ? '?' : `${tc >= 0 ? '+' : ''}${tc.toFixed(1)}`;
    $('c-decks').textContent = (this.shoe.left / 52).toFixed(1);
    $('c-edge').textContent = this.baseEV === null || hide ? '?' : `${edgeWithCount(this.baseEV, tc) >= 0 ? '+' : '−'}${pct(Math.abs(edgeWithCount(this.baseEV, tc)))}`;
    const r = this.round;
    const dev = r ? deviationFor(r.player[0], r.player[1], r.up) : null;
    $('i18-table').querySelectorAll('tr[data-id]').forEach((tr) => tr.classList.toggle('now', !!dev && +(tr as HTMLElement).dataset.id! === dev.id));
  }

  onKey(e: KeyboardEvent): boolean {
    const map: Record<string, ActionId> = { h: 'hit', s: 'stand', d: 'double', p: 'split', u: 'surrender' };
    const a = map[e.key.toLowerCase()];
    if (a && this.round && !this.round.answered) { this.answer(a); return true; }
    if ((e.key === 'Enter' || e.key === ' ') && (!this.round || this.round.answered) && !(e.target as HTMLElement).closest('button, input, select, textarea, a')) { this.deal(); return true; }
    return false;
  }

  /** Live example for the tour. */
  demo(id: string) {
    if (id === 'rules') { this.s.rules = { ...DEFAULT_RULES }; this.rulesChanged(); }
    else if (id === 'hand') { this.s.p1 = 10; this.s.p2 = 6; this.s.up = 10; this.renderHand(); }
    else if (id === 'trainer') this.deal();
    else if (id === 'count') { this.s.counting = true; if (!this.round) this.deal(); this.renderCount(); this.renderHand(); ($('i18') as HTMLDetailsElement).open = true; }
  }
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const evText = (h: HandEVs) => (Object.entries(h.ev) as [ActionId, number][]).map(([a, v]) => `${ACTION_LABELS[a]} ${fmt(v)}`).join(', ');
function face(r: number, k: number) { return cardFace((r === 10 ? 'K' : rankLabel(r)) + SUIT[(k + 1) % 4], 'md'); }
function group(label: string, cards: HTMLElement[]) {
  const g = document.createElement('div'); g.className = 'felt-row';
  const l = document.createElement('span'); l.className = 'slot-label'; l.textContent = label;
  const h = document.createElement('div'); h.className = 'hand'; h.append(...cards);
  g.append(l, h);
  return g;
}
