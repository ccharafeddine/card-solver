import { describe, it, expect } from 'vitest';
import { LESSONS, TOUR, freshProgress, loadProgress, progressSummary } from './lessons';
import { monteCarlo, rng } from '../poker/equity';
import { parseCards } from '../poker/cards';
import { evaluate } from '../poker/eval';
import { findOuts } from '../poker/outs';
import { combosOf, parseRange } from '../poker/range';
import { potOdds, evCall, mdf } from '../poker/decide';
import { DEFAULT_RULES, gameEV, handEVs } from '../blackjack/engine';
import { countAction, trueCount } from '../blackjack/counting';
import { SEATS } from '../poker/charts';
import { exploitP1 } from '../kuhn/engine';
import { analyze, PAY_TABLES } from '../vpoker/engine';
import { bestMelds } from '../gin/engine';
import { score } from '../cribbage/engine';

const c = (t: string) => parseCards(t)!;
const L = (id: string) => LESSONS.find((l) => l.id === id)!;
const right = (id: string) => L(id).choices[L(id).answer];

describe('lessons', () => {
  it('every lesson has a valid answer, a hint and an explanation', () => {
    expect(LESSONS.length).toBe(17);
    for (const l of LESSONS) {
      expect(l.answer, l.id).toBeGreaterThanOrEqual(0);
      expect(l.answer, l.id).toBeLessThan(l.choices.length);
      expect(l.explain.length).toBeGreaterThan(20);
      expect(l.hint.length).toBeGreaterThan(5);
      expect(new Set(l.choices).size).toBe(l.choices.length);
    }
  });
  it('the answers agree with the engines', () => {
    // Hand rankings: the friend's flush beats your ace-high.
    expect(evaluate(c('Qh 3h 9h 8h 7c 6s 2h'))).toBeGreaterThan(evaluate(c('Ah Kd 9h 8h 7c 6s 2h')));
    expect(right('hands')).toMatch(/flush/);
    // AA vs KK about 82%.
    const e = monteCarlo({ hero: c('Ah As'), board: [], dead: [], opponents: 1, range: parseRange('KK').range }, 40000, rng(4));
    expect(Math.abs(e.equity - 0.82)).toBeLessThan(0.02);
    expect(right('equity')).toBe('About 82%');
    // 9 flush outs, rule of 4: 36%.
    expect(findOuts(c('Ah Kh'), c('Qh 7h 2c'), [])!.groups.find((g) => g.name === 'Flush')!.cards).toHaveLength(9);
    expect(right('outs')).toBe('About 36%');
    expect(right('potodds')).toBe(`${Math.round(potOdds(100, 50) * 100)}%`);
    expect(right('ev')).toBe(`+${evCall({ pot: 150, toCall: 50, equity: 0.4 })}`);
    expect(right('ranges')).toBe(String(combosOf(13).length));
    expect(right('mdf')).toBe(`${mdf(100, 100) * 100}%`);
    expect(SEATS.find((s) => s.id === 'btn')!.pct).toBeGreaterThan(SEATS.find((s) => s.id === 'utg')!.pct);
    // 16 vs 10 with surrender: surrender best.
    expect(handEVs(10, 6, 10, DEFAULT_RULES).best).toBe('surrender');
    expect(right('basic')).toBe('Surrender');
    const base = gameEV(DEFAULT_RULES);
    const costs = [gameEV({ ...DEFAULT_RULES, h17: true }), gameEV({ ...DEFAULT_RULES, das: false }), gameEV({ ...DEFAULT_RULES, bjPays: 1.2 })].map((x) => base - x);
    expect(costs.indexOf(Math.max(...costs))).toBe(L('edge').answer);
    expect(right('count')).toBe(`+${trueCount(6, 104)}`);
    expect(countAction(10, 5, 10, 4, 'hit', ['hit', 'stand', 'double'])).toBe('stand');
    expect(right('deviate')).toBe('Stand');
    // Kuhn: never bluffing gives away about 17 chips per 100 hands.
    expect((exploitP1({ bet: [0, 0, 1], call: [0, 1 / 3, 1] }) * 100).toFixed(0)).toBe('17');
    expect(L('kuhn').explain).toMatch(/about 17 extra chips/);
    expect(right('kuhn')).toMatch(/call sometimes/);
    expect(analyze(c('6c 6d Ts 9s 8s'), PAY_TABLES[0].pays)[0].held.map((x) => x >> 2)).toEqual([4, 4]);
    expect(right('vpoker')).toBe('The pair of 6s');
    expect(right('gin')).toBe(String(bestMelds(c('3c 3d 3h Ks 5d')).points));
    expect(right('cribbage')).toBe(String(score(c('5c 5d 5h Js'), c('5s')[0]).total));
  });
});

describe('tour', () => {
  it('gives the main tools a live example and names a tab for each game step', () => {
    for (const id of ['table', 'range', 'equity', 'decide', 'theory', 'charts', 'rules', 'hand', 'trainer', 'count', 'ku-play', 'ku-strategy', 'ku-why', 'vp-hand', 'vp-best', 'gn-hand', 'gn-advice', 'cb-throw', 'cb-score']) expect(TOUR.find((t) => t.id === id)?.demo, id).toBeTruthy();
    for (const t of TOUR) if (t.demo) expect(t.tab).toBeTruthy();
    expect(new Set(TOUR.map((t) => t.id)).size).toBe(TOUR.length);
  });
  it('uses plain words', () => {
    for (const t of [...TOUR.map((x) => x.body), ...LESSONS.flatMap((l) => l.body)]) expect(t).not.toMatch(/heuristic|stochastic|combinatorial/i);
  });
});

describe('progress', () => {
  const store = (v: string | null) => ({ getItem: () => v, setItem: () => {} });
  it('loads safely from missing, corrupt or out-of-range data', () => {
    expect(loadProgress(store(null))).toEqual(freshProgress());
    expect(loadProgress(store('{bad'))).toEqual(freshProgress());
    expect(loadProgress(store('{"lesson":99,"lessonsDone":["hands","nope"],"tour":-3}'))).toMatchObject({ lesson: LESSONS.length - 1, lessonsDone: ['hands'], tour: 0 });
    expect(progressSummary(freshProgress())).toBe(`0/${LESSONS.length} lessons · tour not started`);
  });
});
