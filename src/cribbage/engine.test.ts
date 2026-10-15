import { describe, it, expect } from 'vitest';
import { bestDiscards, score } from './engine';
import { parseCards } from '../poker/cards';

const c = (t: string) => parseCards(t)!;
const sc = (h: string, s: string, crib = false) => score(c(h), c(s)[0], crib);

describe('cribbage scoring', () => {
  it('scores the perfect 29', () => {
    expect(sc('5c 5d 5h Js', '5s').total).toBe(29);
  });
  it('scores a double run with fifteens', () => {
    // 7 7 8 9 + K: double run of 3 (6), pair (2), 7+8 fifteen ×2 (4) = 12.
    expect(sc('7c 7d 8h 9s', 'Kc')).toMatchObject({ runs: 6, pairs: 2, fifteens: 4, total: 12 });
  });
  it('counts flushes differently in the crib', () => {
    expect(sc('2h 4h 6h 8h', 'Kc').flush).toBe(4);
    expect(sc('2h 4h 6h 8h', 'Kc', true).flush).toBe(0);
    expect(sc('2h 4h 6h 8h', 'Kh', true).flush).toBe(5);
  });
  it('scores nobs and a zero hand', () => {
    expect(sc('Jh 2c 4d 6s', 'Kh').nobs).toBe(1);
    expect(sc('2c 4d 6s 8h', 'Kd').total).toBe(0);
    expect(sc('Ac 2d 3h 4s', '5c').runs).toBe(5);
  });
});

describe('best discard', () => {
  it('keeps the 5s and the jack and throws the rest', () => {
    const r = bestDiscards(c('5c 5d 5h Js 2c 9d'), true, false);
    expect(r).toHaveLength(15);
    expect(r[0].keep.sort()).toEqual(c('5c 5d 5h Js').sort());
  });
  it('averages over all 46 cut cards exactly', () => {
    const r = bestDiscards(c('2c 4d 6s 8h Tc Qd'), false, false).find((x) => x.keep.join() === c('2c 4d 6s 8h').join())!;
    // Only a 3, 5, 7 or 9 cut adds anything; check against a direct sum.
    const rest = Array.from({ length: 52 }, (_, i) => i).filter((x) => !c('2c 4d 6s 8h Tc Qd').includes(x));
    const direct = rest.reduce((a, s) => a + score(c('2c 4d 6s 8h'), s).total, 0) / 46;
    expect(r.hand).toBeCloseTo(direct, 12);
  });
  it('as the dealer the crib counts for you, otherwise against you', () => {
    const six = c('5c 5d Kh Qs 2c 9d');
    const d = bestDiscards(six, true)[0], p = bestDiscards(six, false)[0];
    expect(d.net).toBeCloseTo(d.hand + d.crib, 12);
    expect(p.net).toBeCloseTo(p.hand - p.crib, 12);
    // Dealing, throwing two 5s into your own crib can pay; as the non-dealer you keep them.
    expect(p.keep).toEqual(expect.arrayContaining(c('5c 5d')));
  });
});
