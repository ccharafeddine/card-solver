import { describe, it, expect } from 'vitest';
import { allMelds, bestMelds, discardOptions, knockAdvice, points, takeUpcard } from './engine';
import { parseCards } from '../poker/cards';

const c = (t: string) => parseCards(t)!;

describe('gin rummy', () => {
  it('counts points: aces 1, pictures 10', () => {
    expect(c('Ac 5d Th Ks').map(points)).toEqual([1, 5, 10, 10]);
  });
  it('finds sets and ace-low runs, not ace-high ones', () => {
    expect(allMelds(c('Ac 2c 3c'))).toHaveLength(1);
    expect(allMelds(c('Qc Kc Ac'))).toHaveLength(0);
    expect(allMelds(c('7c 7d 7h 7s'))).toHaveLength(5);
  });
  it('picks the split with the least deadwood when a card could go two ways', () => {
    // 7♥ fits the set of 7s or the run 5-6-7♥. Run + set of the other 7s... only two 7s left, so: run 5-6-7-8♥ and keep 7♣ 7♦ as deadwood (14), or set 7-7-7 and 5♥ 6♥ 8♥ deadwood (19).
    const m = bestMelds(c('5h 6h 7h 8h 7c 7d'));
    expect(m.points).toBe(14);
    const gin = bestMelds(c('Ac 2c 3c 4c 9d 9h 9s Kc Kd Kh'));
    expect(gin.points).toBe(0);
    expect(gin.melds).toHaveLength(3);
  });
  it('shares nothing between melds and adds deadwood correctly', () => {
    const m = bestMelds(c('5h 6h 7h 7c 7d 2s 3d Kc Qd Js'));
    const used = m.melds.flat();
    expect(new Set(used).size).toBe(used.length);
    expect(m.points).toBe(m.deadwood.reduce((a, x) => a + points(x), 0));
  });
  it('throws the card that leaves the least deadwood', () => {
    const best = discardOptions(c('Ac 2c 3c 9d 9h 9s Kc Kd Kh 4d Qs'))[0];
    expect(best.card).toBe(c('Qs')[0]);
    expect(best.deadwood).toBe(4);
  });
  it('gives knock advice with clear limits', () => {
    expect(knockAdvice(0, 9).advice).toBe('gin');
    expect(knockAdvice(11, 1).advice).toBe('cannot');
    expect(knockAdvice(9, 2).advice).toBe('knock');
    expect(knockAdvice(9, 12).advice).toBe('wait');
  });
  it('takes a face-up card that completes a meld', () => {
    const t = takeUpcard(c('Ac 2c 9d 9h Kc Kd Kh 4d Qs 8s'), c('3c')[0]);
    expect(t.take).toBe(true);
    expect(t.after).toBeLessThan(t.before);
  });
});
