import { describe, it, expect } from 'vitest';
import { analyze, classify, PAY_TABLES, VP_HANDS } from './engine';
import { parseCards } from '../poker/cards';

const c = (t: string) => parseCards(t)!;
const cls = (t: string) => VP_HANDS[classify(...(c(t) as [number, number, number, number, number]))];
const pays = PAY_TABLES[0].pays;

describe('video poker', () => {
  it('names every paying hand', () => {
    expect(cls('As Ks Qs Js Ts')).toBe('Royal flush');
    expect(cls('5h 4h 3h 2h Ah')).toBe('Straight flush');
    expect(cls('9c 9d 9h 9s 2c')).toBe('Four of a kind');
    expect(cls('9c 9d 9h 2s 2c')).toBe('Full house');
    expect(cls('Ac 9c 7c 4c 2c')).toBe('Flush');
    expect(cls('Ac 2d 3h 4s 5c')).toBe('Straight');
    expect(cls('Kc Qd Jh Ts 9c')).toBe('Straight');
    expect(cls('7c 7d 7h Ks 2c')).toBe('Three of a kind');
    expect(cls('7c 7d 3h 3s 2c')).toBe('Two pair');
    expect(cls('Jc Jd 7h 3s 2c')).toBe('Jacks or better');
    expect(cls('Tc Td 7h 3s 2c')).toBe('Nothing');
    expect(cls('Kc Qd Jh Ts 8c')).toBe('Nothing');
  });
  it('four to a royal: the EV worked out by hand', () => {
    const best = analyze(c('As Ks Qs Js 2c'), pays)[0];
    expect(best.held.length).toBe(4);
    // Ts royal (800), 8 other spades flush (6), 3 other tens straight (4), 12 aces/kings/queens/jacks pair (1).
    expect(best.ev).toBeCloseTo((800 + 8 * 6 + 3 * 4 + 12) / 47, 12);
    expect(best.draws).toBe(47);
  });
  it('a dealt royal is kept; drawing five counts every draw', () => {
    expect(analyze(c('As Ks Qs Js Ts'), pays)[0].ev).toBe(800);
    const all = analyze(c('2c 7d 9h Js 4s'), pays).find((h) => h.held.length === 0)!;
    expect(all.draws).toBe(1533939);
  });
  it('breaks a low pair? No: keeps a pair of 6s over a 3-card royal draw without a high card', () => {
    const best = analyze(c('6c 6d Ts 9s 8s'), pays)[0];
    expect(best.held.map((x) => x >> 2).sort()).toEqual([4, 4]);
  });
  it('the published return falls as the pay table gets worse', () => {
    const r = PAY_TABLES.map((t) => t.ret!);
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeLessThan(r[i - 1]);
  });
});
