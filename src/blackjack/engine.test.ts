import { describe, it, expect } from 'vitest';
import { DEFAULT_RULES, codeFor, dealerDist, freshShoe, gameEV, handEVs, strategyChart, UPCARDS } from './engine';
import { countAction, deviationFor, hiLo, ILLUSTRIOUS_18, takeInsurance, trueCount } from './counting';
import { Shoe, playOut } from './shoe';
import { rng } from '../poker/equity';

const R = DEFAULT_RULES;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe('dealer', () => {
  it('final totals add up to 1 for every upcard', () => {
    for (const up of UPCARDS) {
      const s = freshShoe(6); s[up]--;
      expect(sum(dealerDist(s, up, false))).toBeCloseTo(1, 10);
    }
  });
  it('busts most with a 6 showing and least with an ace (S17, 6 decks)', () => {
    const bust = (up: number) => { const s = freshShoe(6); s[up]--; return dealerDist(s, up, false)[5]; };
    expect(bust(6)).toBeGreaterThan(0.41);
    expect(bust(6)).toBeLessThan(0.43);
    expect(bust(1)).toBeLessThan(0.18);
    for (const u of [2, 3, 4, 5, 7, 8, 9, 10, 1]) expect(bust(6)).toBeGreaterThan(bust(u));
  });
  it('has blackjack about 31% of the time under an ace', () => {
    const s = freshShoe(6); s[1]--;
    expect(dealerDist(s, 1, false)[6]).toBeCloseTo(96 / 311, 6);
  });
});

describe('basic strategy from exact EVs', () => {
  const chart = strategyChart(R);
  const at = (rows: typeof chart.hard, label: string, up: number) => rows.find((r) => r.label === label)!.codes[UPCARDS.indexOf(up)];
  it('matches the well-known chart for 6 decks, S17, DAS, late surrender', () => {
    expect(at(chart.hard, '16', 10)).toBe('R');
    expect(at(chart.hard, '15', 10)).toBe('R');
    expect(at(chart.hard, '16', 7)).toBe('H');
    expect(at(chart.hard, '12', 2)).toBe('H');
    expect(at(chart.hard, '12', 4)).toBe('S');
    expect(at(chart.hard, '11', 10)).toBe('D');
    expect(at(chart.hard, '11', 1)).toBe('H');
    expect(at(chart.hard, '9', 2)).toBe('H');
    expect(at(chart.hard, '9', 3)).toBe('D');
    expect(at(chart.soft, 'A,7', 2)).toBe('S');
    expect(at(chart.soft, 'A,7', 3)).toBe('Ds');
    expect(at(chart.soft, 'A,7', 9)).toBe('H');
    expect(at(chart.pairs, '8,8', 10)).toBe('P');
    expect(at(chart.pairs, 'A,A', 1)).toBe('P');
    expect(at(chart.pairs, '10,10', 6)).toBe('S');
    expect(at(chart.pairs, '9,9', 7)).toBe('S');
    expect(at(chart.pairs, '5,5', 9)).toBe('D');
    expect(at(chart.pairs, '4,4', 5)).toBe('P');
  });
  it('changes with the rules: H17 doubles 11 vs A; no DAS stops 4,4 vs 5 splitting', () => {
    const h17 = strategyChart({ ...R, h17: true });
    expect(at(h17.hard, '11', 1)).toBe('D');
    const nodas = strategyChart({ ...R, das: false });
    expect(at(nodas.pairs, '4,4', 5)).toBe('H');
    const nosur = strategyChart({ ...R, surrender: false });
    expect(at(nosur.hard, '16', 10)).toBe('H');
  });
  it('a chart code always names the action with the highest EV', () => {
    for (const rows of Object.values(chart) as (typeof chart.hard)[]) for (const r of rows) r.evs.forEach((h) => {
      const top = Math.max(...Object.values(h.ev) as number[]);
      expect(h.ev[h.best]).toBe(top);
      expect(codeFor(h)).toBeTruthy();
    });
  });
  it('a blackjack pays 3:2 or 6:5, and 20 vs 6 is a strong stand', () => {
    expect(handEVs(1, 10, 6, R).blackjack).toBe(true);
    expect(handEVs(1, 10, 6, R).ev.stand).toBe(1.5);
    expect(handEVs(1, 10, 6, { ...R, bjPays: 1.2 }).ev.stand).toBe(1.2);
    const h = handEVs(10, 10, 6, R);
    expect(h.best).toBe('stand');
    expect(h.ev.stand!).toBeGreaterThan(0.6);
  });
});

describe('house edge', () => {
  it('is near the published figures and moves the right way with each rule', () => {
    const base = gameEV(R);
    expect(base).toBeGreaterThan(-0.006);
    expect(base).toBeLessThan(-0.002);
    expect(gameEV({ ...R, h17: true })).toBeLessThan(base);
    expect(gameEV({ ...R, bjPays: 1.2 })).toBeLessThan(base - 0.01);
    expect(gameEV({ ...R, surrender: false })).toBeLessThan(base);
    expect(gameEV({ ...R, decks: 1 })).toBeGreaterThan(base);
    expect(gameEV({ ...R, das: false })).toBeLessThan(base);
  });
});

describe('counting', () => {
  it('Hi-Lo tags and true count', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(hiLo)).toEqual([-1, 1, 1, 1, 1, 1, 0, 0, 0, -1]);
    expect(trueCount(6, 104)).toBe(3);
    expect(sum([1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => 4 * hiLo(r))) + 16 * hiLo(10)).toBe(0);
  });
  it('lists the Illustrious 18 and applies them by true count', () => {
    expect(ILLUSTRIOUS_18).toHaveLength(18);
    expect(deviationFor(10, 6, 10)?.label).toBe('16 vs 10');
    expect(deviationFor(1, 5, 10)).toBeNull();
    expect(countAction(10, 6, 10, 1, 'hit', ['stand', 'hit', 'double'])).toBe('stand');
    expect(countAction(10, 6, 10, -1, 'hit', ['stand', 'hit', 'double'])).toBeNull();
    // Basic surrender of 16 vs 10 stays at low counts; at 0 or more, stand.
    expect(countAction(10, 6, 10, -2, 'surrender', ['stand', 'hit', 'surrender'])).toBeNull();
    expect(countAction(10, 10, 6, 4, 'stand', ['stand', 'hit', 'double', 'split'])).toBe('split');
    expect(countAction(10, 2, 4, -1, 'stand', ['stand', 'hit'])).toBe('hit');
    expect(takeInsurance(3)).toBe(true);
    expect(takeInsurance(2.9)).toBe(false);
  });
  it('the shoe deals every card once, counts back to zero, and hides the hole card until seen', () => {
    const s = new Shoe(2, rng(7));
    const seen = new Array(11).fill(0);
    for (let i = 0; i < 104; i++) seen[s.deal()]++;
    expect(seen.slice(1)).toEqual([8, 8, 8, 8, 8, 8, 8, 8, 8, 32]);
    expect(s.running).toBe(0);
    const t = new Shoe(1, rng(3));
    const c = t.deal(false);
    expect(t.running).toBe(0);
    t.see(c);
    expect(t.running).toBe(hiLo(c));
  });
  it('plays out a hand and settles it', () => {
    const s = new Shoe(6, rng(11));
    const out = playOut([10, 7], 6, 10, 'stand', R, s);
    expect(out.dealer.slice(0, 2)).toEqual([6, 10]);
    expect(out.hands[0].result).toBe(out.dealer.reduce((a, b) => a + b, 0) > 21 ? 1 : -1);
    expect(playOut([10, 6], 10, 5, 'surrender', R, s).total).toBe(-0.5);
    expect(playOut([1, 10], 9, 9, 'stand', R, s).total).toBe(1.5);
  });
});
