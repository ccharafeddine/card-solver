/**
 * The Kuhn poker tab: the rules in plain words, a game against the perfect
 * (Nash equilibrium) player with the exact value of every choice, the whole
 * equilibrium strategy, and why bluffing works, shown by what a smart
 * opponent wins from common mistakes. The maths is tiny (six deals), so it
 * runs right here instead of in the worker.
 */
import { KUHN_CARDS, KUHN_NAMES, actionValues, choices, exploitP1, exploitP2, nashP1, nashP2, sample, settle, step, toAct, type KAction, type KCard, type KHistory, type P1Strategy, type P2Strategy } from '../kuhn/engine';
import { cardFace } from './cards';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const KEY = 'card-solver-kuhn';
const LABEL: Record<KAction, string> = { check: 'Check', bet: 'Bet 1', call: 'Call 1', fold: 'Fold' };
const SUIT = ['h', 's', 'd'];
const face = (c: KCard) => cardFace(KUHN_CARDS[c] + SUIT[c], 'lg');
const pc = (x: number) => `${Math.round(x * 100)}%`;
const chips = (x: number) => `${x > 0.0005 ? '+' : x < -0.0005 ? '−' : ''}${Math.abs(x).toFixed(2)}`;

export interface KuhnState { alpha: number; seat: 1 | 2; hands: number; net: number; mistakes: number }
const fresh = (): KuhnState => ({ alpha: 1 / 6, seat: 1, hands: 0, net: 0, mistakes: 0 });
interface Hand { you: KCard; bot: KCard; seat: 1 | 2; h: string; log: string[]; over: boolean }

interface Leak { id: string; label: string; side: 1 | 2; s1?: P1Strategy; s2?: P2Strategy; fix: string }
const LEAKS: Leak[] = [
  { id: 'nobluff', label: 'Never bluffs', side: 1, s1: { bet: [0, 0, 1], call: [0, 1 / 3, 1] },
    fix: 'If player 1 only bets with a King, a bet always means "I have the King". So player 2 just folds the Queen every time, and player 1\'s Kings win only the 1-chip ante instead of 2.' },
  { id: 'allbluff', label: 'Bluffs too much', side: 1, s1: { bet: [1, 0, 1], call: [0, 1 / 3, 1] },
    fix: 'If player 1 always bets the Jack, half of their bets are bluffs. Player 2 calls with every Queen and catches them.' },
  { id: 'qfold', label: 'Folds the Queen', side: 2, s2: { call: [0, 0, 1], bet: [1 / 3, 0, 1] },
    fix: 'If player 2 always folds a Queen to a bet, player 1 bets every Jack: the bluff wins the pot whenever player 2 doesn\'t hold the King.' },
  { id: 'qcall', label: 'Calls every Queen', side: 2, s2: { call: [0, 1, 1], bet: [1 / 3, 0, 1] },
    fix: 'If player 2 always calls with a Queen, player 1 stops bluffing and bets the King more: every call with the Queen pays off a King.' },
];

export class KuhnTab {
  s: KuhnState;
  hand: Hand | null = null;
  leak = 'nobluff';

  constructor(private status: (t: string, kind?: '' | 'ok' | 'bad' | 'thinking') => void) {
    this.s = this.load();
    this.build();
    this.render();
  }
  private load(): KuhnState {
    const f = fresh();
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<KuhnState> | null;
      if (raw && typeof raw === 'object') {
        if (typeof raw.alpha === 'number' && raw.alpha >= 0 && raw.alpha <= 1 / 3 + 1e-9) f.alpha = raw.alpha;
        if (raw.seat === 1 || raw.seat === 2) f.seat = raw.seat;
        for (const k of ['hands', 'net', 'mistakes'] as const) if (typeof raw[k] === 'number' && Number.isFinite(raw[k])) f[k] = raw[k]!;
      }
    } catch { /* fresh */ }
    return f;
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* blocked */ } }
  snapshot() { return { s: { ...this.s }, hand: this.hand ? JSON.parse(JSON.stringify(this.hand)) as Hand : null, leak: this.leak }; }
  restore(x: ReturnType<KuhnTab['snapshot']>) { this.s = x.s; this.hand = x.hand; this.leak = x.leak; this.render(); }

  private get s1() { return nashP1(this.s.alpha); }
  private get s2() { return nashP2(); }

  private build() {
    $('ku-deal').onclick = () => this.deal();
    $('ku-reset').onclick = () => { const a = this.s.alpha; this.s = { ...fresh(), alpha: a }; this.hand = null; this.save(); this.render(); };
    document.querySelectorAll<HTMLButtonElement>('#ku-actions button').forEach((b) => { b.onclick = () => this.act(b.dataset.i === '0' ? 0 : 1); });
    const sl = $<HTMLInputElement>('ku-alpha');
    sl.oninput = () => { this.s.alpha = +sl.value / 300; this.save(); this.renderStrategy(); };
    const seg = $('ku-leaks');
    for (const l of LEAKS) {
      const b = document.createElement('button');
      b.textContent = `${l.side === 1 ? 'Player 1' : 'Player 2'}: ${l.label}`; b.dataset.id = l.id; b.setAttribute('role', 'tab');
      b.onclick = () => { this.leak = l.id; this.renderLeak(); };
      seg.append(b);
    }
  }

  render() { this.renderTable(); this.renderStrategy(); this.renderLeak(); this.renderStats(); }

  // ---------- playing ----------
  deal() {
    const you = Math.floor(Math.random() * 3) as KCard;
    let bot = Math.floor(Math.random() * 2) as KCard;
    if (bot >= you) bot = (bot + 1) as KCard;
    if (this.hand?.over) this.s.seat = this.s.seat === 1 ? 2 : 1;
    this.hand = { you, bot, seat: this.s.seat, h: '', log: [], over: false };
    $('ku-feedback').replaceChildren();
    this.botMoves();
    this.renderTable();
  }
  private youAct(h: Hand) { return toAct(h.h as KHistory) === h.seat; }
  /** The perfect player moves until it's your turn or the hand ends. */
  private botMoves() {
    const h = this.hand!;
    while (!h.over && !this.youAct(h)) {
      const a = sample(h.bot, h.h as KHistory, this.s1, this.s2, Math.random());
      h.log.push(`Perfect player: ${LABEL[a].toLowerCase()}.`);
      h.h = step(h.h, a);
      this.endIfOver();
    }
    if (!h.over) this.status(`You are player ${h.seat} with the ${KUHN_NAMES[h.you]}. ${h.h === '' ? 'You act first.' : h.h === 'b' ? 'They bet. Call or fold?' : h.h === 'k' ? 'They checked. Check or bet?' : 'You checked and they bet. Call or fold?'}`);
  }
  act(i: 0 | 1) {
    const h = this.hand;
    if (!h || h.over || !this.youAct(h)) return;
    const hist = h.h as KHistory;
    const opts = choices(hist);
    const a = opts[i];
    const v = actionValues(h.you, hist, this.s1, this.s2);
    const best = Math.max(...opts.map((o) => v[o]));
    const ok = v[a] >= best - 1e-9;
    if (!ok) this.s.mistakes++;
    const p = document.createElement('p');
    const eq = Math.abs(v[opts[0]] - v[opts[1]]) < 1e-9;
    p.innerHTML = `${ok ? '✓' : '✗'} You chose <b>${LABEL[a]}</b>. Against perfect play: ${opts.map((o) => `${LABEL[o]} ${chips(v[o])}`).join(', ')} chips on average.${eq ? ' <i>Both are worth exactly the same: that is what perfect play does to you.</i>' : ok ? '' : ` ${LABEL[opts.find((o) => v[o] >= best - 1e-9)!]} was better.`}`;
    p.className = ok ? 'ok' : 'bad';
    $('ku-feedback').prepend(p);
    h.log.push(`You: ${LABEL[a].toLowerCase()}.`);
    h.h = step(h.h, a);
    this.endIfOver();
    if (!h.over) this.botMoves();
    this.renderTable();
  }
  private endIfOver() {
    const h = this.hand!;
    const [x, y] = h.seat === 1 ? [h.you, h.bot] : [h.bot, h.you];
    const r = settle(x, y, h.h);
    if (r === null) return;
    h.over = true;
    const mine = h.seat === 1 ? r : -r;
    this.s.hands++; this.s.net += mine; this.save();
    const folded = h.h.endsWith('f');
    const how = folded ? (mine > 0 ? 'They folded.' : 'You folded.') : `Showdown: your ${KUHN_NAMES[h.you]} vs their ${KUHN_NAMES[h.bot]}.`;
    this.status(`${how} You ${mine > 0 ? 'win' : 'lose'} ${Math.abs(mine)} chip${Math.abs(mine) === 1 ? '' : 's'}. Press Deal for the next hand (you switch seats).`, mine > 0 ? 'ok' : 'bad');
    this.renderStats();
  }

  renderTable() {
    const h = this.hand;
    $('ku-you').replaceChildren(h ? face(h.you) : cardFace('?', 'lg'));
    $('ku-bot').replaceChildren(h && h.over && !h.h.endsWith('f') ? face(h.bot) : cardFace('?', 'lg'));
    $('ku-seat').textContent = h ? `You are player ${h.seat}` : `Next hand: you are player ${this.s.seat}`;
    const pot = h ? 2 + (h.h.match(/[bc]/g)?.length ?? 0) : 2;
    $('ku-pot').textContent = `Pot: ${pot} chips`;
    $('ku-log').textContent = h ? h.log.join(' ') || 'Your move.' : 'Each player has put in 1 chip.';
    const btns = document.querySelectorAll<HTMLButtonElement>('#ku-actions button');
    const live = h && !h.over && this.youAct(h);
    const opts = live ? choices(h.h as KHistory) : ['check', 'bet'] as KAction[];
    btns.forEach((b, i) => { b.textContent = live ? LABEL[opts[i]] : i ? 'Bet / Call' : 'Check / Fold'; b.disabled = !live; });
    $('ku-deal').textContent = h && !h.over ? 'Deal again' : 'Deal';
  }
  renderStats() {
    const s = this.s;
    $('ku-stats').textContent = s.hands ? `${s.hands} hands · ${chips(s.net)} chips (${chips(s.net / s.hands)} a hand) · ${s.mistakes} costly choice${s.mistakes === 1 ? '' : 's'}` : 'No hands yet';
  }

  // ---------- the strategy ----------
  renderStrategy() {
    const s1 = this.s1, s2 = this.s2;
    $<HTMLInputElement>('ku-alpha').value = String(Math.round(this.s.alpha * 300));
    $('ku-alpha-out').textContent = pc(this.s.alpha);
    const row = (label: string, p: number[]) => `<tr><th>${label}</th>${p.map((x) => `<td class="mono${x === 0 ? ' never' : x === 1 ? ' always' : ''}">${pc(x)}</td>`).join('')}</tr>`;
    $('ku-table').innerHTML = `<tr><th></th>${KUHN_CARDS.map((c) => `<th>${c}</th>`).join('')}</tr>`
      + row('P1 bets first', s1.bet) + row('P1 calls (after check, bet)', s1.call)
      + row('P2 calls a bet', s2.call) + row('P2 bets after a check', s2.bet);
    $('ku-value').textContent = `Player 1 loses 1/18 of a chip a hand (about ${chips(-1 / 18 * 100)} per 100 hands) whatever bluffing rate they pick: acting first is a small disadvantage. Over both seats it evens out to 0.`;
  }
  renderLeak() {
    const l = LEAKS.find((x) => x.id === this.leak)!;
    $('ku-leaks').querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.id === l.id)));
    const won = l.side === 1 ? exploitP1(l.s1!) : exploitP2(l.s2!);
    $('ku-leak-body').innerHTML = `<p>${l.fix}</p><p class="calc">A smart opponent wins an extra <b>${(won * 100).toFixed(1)} chips per 100 hands</b> from this mistake (worked out exactly). Against the perfect strategy, they win nothing extra.</p>`;
  }

  onKey(e: KeyboardEvent): boolean {
    const k = e.key.toLowerCase();
    const h = this.hand;
    if (h && !h.over && this.youAct(h)) {
      const opts = choices(h.h as KHistory);
      const map: Record<string, KAction> = { k: 'check', b: 'bet', c: 'call', f: 'fold' };
      const a = map[k];
      if (a && opts.includes(a)) { this.act(opts.indexOf(a) as 0 | 1); return true; }
    }
    if ((e.key === 'Enter' || e.key === ' ') && (!h || h.over) && !(e.target as HTMLElement).closest('button, input, select, textarea, a')) { this.deal(); return true; }
    return false;
  }

  /** Live examples for the tour. */
  demo(id: string) {
    if (id === 'ku-play') {
      // You hold the Jack as player 1: the classic bluffing spot.
      this.s.seat = 1;
      this.hand = { you: 0, bot: 1, seat: 1, h: '', log: [], over: false };
      $('ku-feedback').replaceChildren();
      this.status('You are player 1 with the Jack, the worst card. Bet (bluff) or check? Against perfect play both are worth the same.');
      this.renderTable();
    } else if (id === 'ku-strategy') { this.s.alpha = 1 / 6; this.renderStrategy(); }
    else if (id === 'ku-why') { this.leak = 'nobluff'; this.renderLeak(); }
  }
}
