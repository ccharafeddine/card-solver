import { describe, it, expect } from 'vitest';
import { parseCards, cardText, cardLabel } from './cards';
import { evaluate, categoryOf, handName, straightHigh } from './eval';
import { equity, exactEquity, monteCarlo, rng, validate, exactCost, EXACT_LIMIT } from './equity';
import { className, classOf, combosOf, comboCount, parseRange, rangeCombos, topPercent, rangeText, PRESETS, ORDER } from './range';
import { findOuts } from './outs';
import { decide, potOdds, evCall, evRaise, mdf, bluffShare, bluffsPerValue } from './decide';
import { SEATS, seatRange } from './charts';
import { STRENGTH } from './strength';

const c = (t: string) => parseCards(t)!;
const v = (t: string) => evaluate(c(t));

describe('cards', () => {
  it('parse and print', () => {
    expect(c('Ah Kd').map(cardText)).toEqual(['Ah', 'Kd']);
    expect(c('10h')[0]).toBe(c('Th')[0]);
    expect(cardLabel(c('Ts')[0])).toBe('10♠');
    expect(parseCards('Ah Ah')).toBeNull();
    expect(parseCards('Zz')).toBeNull();
  });
});

describe('hand evaluator', () => {
  it('ranks every category in order', () => {
    const hands = ['2c 5d 9h Js Kd 3c 7h', 'Ah Ad 3c 7d 9s Jc 4h', 'Ah Ad 3c 3d 9s Jc 4h', 'Ah Ad Ac 3d 9s Jc 4h', '5c 6d 7h 8s 9c Kd 2h',
      '2h 7h 9h Jh Kh Ac 3d', 'Ah Ad Ac 3d 3s Jc 4h', 'Ah Ad Ac As 3s Jc 4h', '5h 6h 7h 8h 9h Ac Ad'];
    hands.forEach((h, i) => expect(categoryOf(v(h)), h).toBe(i));
  });
  it('handles the wheel, kickers, and the best five of seven', () => {
    expect(straightHigh(0b1000000001111)).toBe(3);
    expect(v('Ah 2d 3c 4s 5h Kd Kc')).toBeGreaterThan(v('Kh Kd 3c 4s 9h 2d Jc'));
    expect(v('6h 2d 3c 4s 5h Kd Qc')).toBeGreaterThan(v('Ah 2d 3c 4s 5h Kd Qc'));
    expect(v('Ah Kd Qc Js 9h 2c 3d')).toBeGreaterThan(v('Ah Kd Qc Js 8h 2c 3d'));
    expect(v('Ah Ad Kc Ks Qh Qd 2c')).toBe(v('Ah Ad Kc Ks Qh 2d 3c'));
    expect(v('Ah Ad Ac Kd Kc Qh Qd')).toBeGreaterThan(v('Kh Kd Kc Ad Ac Qh Qd'));
    // A flush with a full house available plays the full house.
    expect(categoryOf(v('Ah Kh 9h 2h 2c 2d Ac'))).toBe(6);
    expect(handName(v('Ah Kh Qh Jh Th 2c 3d'))).toBe('Royal flush');
    expect(handName(v('Kh Kd 3c 4s 9h 2d Jc'))).toBe('Pair of Kings');
  });
  it('counts the 7-card category frequencies right (2,000 random hands within tolerance)', () => {
    const r = rng(5), cats = new Array(9).fill(0);
    for (let t = 0; t < 20000; t++) {
      const deck = Array.from({ length: 52 }, (_, i) => i);
      for (let i = 0; i < 7; i++) { const j = i + Math.floor(r() * (52 - i)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      cats[categoryOf(evaluate(deck.slice(0, 7)))]++;
    }
    // Known 7-card odds: high card 17.4%, pair 43.8%, two pair 23.5%, trips 4.83%, straight 4.62%, flush 3.03%, full house 2.60%.
    const want = [17.4, 43.8, 23.5, 4.83, 4.62, 3.03, 2.6];
    want.forEach((w, i) => expect(Math.abs((100 * cats[i]) / 20000 - w), String(i)).toBeLessThan(1.2));
  });
});

describe('ranges', () => {
  it('has 169 classes and 1326 hands', () => {
    expect(className(0)).toBe('AA');
    expect(className(1)).toBe('AKs');
    expect(className(13)).toBe('AKo');
    expect(className(168)).toBe('22');
    let n = 0;
    for (let k = 0; k < 169; k++) { n += combosOf(k).length; expect(combosOf(k).length).toBe(comboCount(k)); for (const [a, b] of combosOf(k)) expect(classOf(a, b)).toBe(k); }
    expect(n).toBe(1326);
  });
  it('parses text, presets and top percentages', () => {
    const { range, bad } = parseRange('AA, KQs t9o 76 xx');
    expect(bad).toEqual(['xx']);
    expect(rangeCombos(range)).toBe(6 + 4 + 12 + 16);
    expect(rangeCombos(topPercent(100))).toBe(1326);
    const p15 = rangeCombos(topPercent(15)) / 1326;
    expect(p15).toBeGreaterThan(0.14); expect(p15).toBeLessThan(0.16);
    expect(rangeText(PRESETS.find((p) => p.id === 'premium')!.range())).toBe('AA, KK, QQ, AKs, AKo');
    expect(className(ORDER[0])).toBe('AA');
  });
  it('the strength table is sane: AA best, 32o worst, suited beats offsuit', () => {
    expect(STRENGTH).toHaveLength(169);
    expect(Math.max(...STRENGTH)).toBe(STRENGTH[0]);
    expect(STRENGTH[0]).toBeGreaterThan(84);
    for (let i = 0; i < 13; i++) for (let j = i + 1; j < 13; j++) expect(STRENGTH[i * 13 + j] + 0.6).toBeGreaterThan(STRENGTH[j * 13 + i]);
  });
  it('seat charts widen from first to last seat', () => {
    const sizes = SEATS.slice(0, 4).map((s) => rangeCombos(seatRange(s.id)));
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
    // Every tighter range sits inside the looser one.
    const utg = seatRange('utg'), btn = seatRange('btn');
    utg.forEach((on, k) => { if (on) expect(btn[k]).toBe(true); });
  });
});

describe('equity', () => {
  it('matches known all-in numbers', () => {
    // AA vs KK preflop: about 82%.
    const aa = monteCarlo({ hero: c('Ah As'), board: [], dead: [], opponents: 1, range: parseRange('KK').range }, 60000, rng(1));
    expect(aa.equity).toBeGreaterThan(0.8); expect(aa.equity).toBeLessThan(0.84);
    // Exact: the nut flush draw on the flop against a set is about 25% (the set can still fill up).
    const ex = exactEquity({ hero: c('Ah Kh'), board: c('7h 2h 9c'), dead: [], opponents: 1, range: parseRange('99').range });
    expect(ex.method).toBe('exact');
    expect(ex.trials).toBe(3 * 990);
    expect(ex.equity).toBeGreaterThan(0.23); expect(ex.equity).toBeLessThan(0.27);
  });
  it('exact on the river is a simple count, ties split', () => {
    const r = exactEquity({ hero: c('2c 3d'), board: c('Ah Kh Qh Jh Th'), dead: [], opponents: 1, range: null });
    expect(r.tie).toBe(1); expect(r.equity).toBe(0.5);
  });
  it('Monte Carlo agrees with exact enumeration', () => {
    const inp = { hero: c('Jc Td'), board: c('9s 8h 2c'), dead: [], opponents: 1, range: null };
    const ex = exactEquity(inp), mc = monteCarlo(inp, 80000, rng(9));
    expect(Math.abs(ex.equity - mc.equity)).toBeLessThan(0.01);
    expect(exactCost(inp)).toBeLessThanOrEqual(EXACT_LIMIT);
    expect(equity(inp).method).toBe('exact');
  });
  it('more opponents means less equity, and dead cards are respected', () => {
    const one = monteCarlo({ hero: c('Ah Kd'), board: [], dead: [], opponents: 1, range: null }, 30000, rng(2));
    const four = monteCarlo({ hero: c('Ah Kd'), board: [], dead: [], opponents: 4, range: null }, 30000, rng(2));
    expect(four.equity).toBeLessThan(one.equity - 0.2);
    // With every other ace dead, the hero can't make three aces.
    const dead = monteCarlo({ hero: c('Ah Kd'), board: c('Ac 2d 7s'), dead: c('As Ad'), opponents: 1, range: null }, 20000, rng(3));
    expect(dead.categories[3] + dead.categories[6] + dead.categories[7]).toBeLessThan(0.08);
  });
  it('explains bad input', () => {
    expect(validate({ hero: c('Ah'), board: [], dead: [], opponents: 1, range: null })).toMatch(/two cards/);
    expect(validate({ hero: c('Ah Kd'), board: c('2c 3c'), dead: [], opponents: 1, range: null })).toMatch(/0, 3, 4 or 5/);
    expect(validate({ hero: c('Ah Kd'), board: [], dead: [], opponents: 1, range: null })).toBeNull();
    expect(exactEquity({ hero: c('Ah Ad'), board: [], dead: c('Ac As'), opponents: 1, range: parseRange('AA').range }).impossible).toBe(true);
  });
});

describe('outs', () => {
  it('counts a flush draw as 9 outs and a gutshot as 4', () => {
    const o = findOuts(c('Ah Kh'), c('7h 2h 9c'), [])!;
    expect(o.groups.find((g) => g.name === 'Flush')!.cards).toHaveLength(9);
    expect(o.ruleOf).toBe(4 * o.total);
    const gut = findOuts(c('9c 8d'), c('Jh 7s 2c 3d'), [])!;
    expect(gut.groups.find((g) => g.name === 'Straight')!.cards).toHaveLength(4);
  });
  it('a card that only pairs the board is not an out', () => {
    const o = findOuts(c('Ah Kd'), c('7c 7d 2s'), [])!;
    const trips = o.groups.find((g) => g.name === 'Three of a kind');
    expect(trips).toBeUndefined();
    expect(findOuts(c('Ah Kd'), [], [])).toBeNull();
  });
});

describe('decisions and game theory', () => {
  it('pot odds, call EV and raise EV', () => {
    expect(potOdds(100, 50)).toBeCloseTo(1 / 3);
    expect(evCall({ pot: 150, toCall: 50, equity: 0.25 })).toBeCloseTo(0);
    const s = { pot: 100, toCall: 0, raiseTo: 50, foldChance: 0.5, implied: 0, equity: 0.3 };
    // Fold half: +100. Called: 0.3 x 200 - 50 = 10. Total 55.
    expect(evRaise(s)).toBeCloseTo(55);
  });
  it('recommends folding without the odds and calling with them', () => {
    const base = { pot: 100, toCall: 50, raiseTo: 0, foldChance: 0, implied: 0 };
    expect(decide({ ...base, equity: 0.2 }).best.action).toBe('fold');
    expect(decide({ ...base, equity: 0.4 }).best.action).toBe('call');
    const imp = decide({ ...base, equity: 0.2, implied: 200 });
    expect(imp.neededImplied).toBeCloseTo(50 / 350);
    expect(imp.why).toMatch(/extra/);
    expect(decide({ ...base, equity: 0.8, raiseTo: 200 }).best.action).toBe('raise');
  });
  it('MDF and bluffing frequencies', () => {
    expect(mdf(100, 100)).toBeCloseTo(0.5);
    expect(mdf(100, 50)).toBeCloseTo(2 / 3);
    expect(bluffShare(100, 100)).toBeCloseTo(1 / 3);
    expect(bluffsPerValue(100, 100)).toBeCloseTo(0.5);
    expect(mdf(100, 0)).toBe(1);
  });
});
