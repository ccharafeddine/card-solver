import { describe, it, expect } from 'vitest';
import { GAME_VALUE, actionValues, bestP1, bestP2, exploitP1, exploitP2, nashP1, nashP2, settle, value, type P1Strategy } from './engine';

describe('Kuhn poker', () => {
  it('every equilibrium is worth exactly −1/18 to player 1', () => {
    for (const a of [0, 0.1, 1 / 6, 0.25, 1 / 3]) expect(value(nashP1(a), nashP2())).toBeCloseTo(GAME_VALUE, 12);
  });
  it('no one can gain by changing from the equilibrium', () => {
    for (const a of [0, 1 / 6, 1 / 3]) {
      expect(exploitP1(nashP1(a))).toBeCloseTo(0, 12);
      expect(bestP1(nashP2()).value).toBeCloseTo(GAME_VALUE, 12);
    }
    expect(exploitP2(nashP2())).toBeCloseTo(0, 12);
  });
  it('a player who never bluffs can be exploited', () => {
    const honest: P1Strategy = { bet: [0, 0, 1], call: [0, 1 / 3, 1] };
    expect(exploitP1(honest)).toBeGreaterThan(0.01);
    // Player 2 who never calls with the Queen loses to more bluffing.
    expect(exploitP2({ call: [0, 0, 1], bet: [1 / 3, 0, 1] })).toBeGreaterThan(0.01);
    expect(bestP2(honest).strategy.call[1]).toBe(0);
  });
  it('against the equilibrium, bluffing the Jack and checking it are worth the same', () => {
    const v = actionValues(0, '', nashP1(), nashP2());
    expect(v.bet).toBeCloseTo(v.check, 12);
    // Player 2 holding a Queen facing a bet: call and fold are equal too.
    const q = actionValues(1, 'b', nashP1(), nashP2());
    expect(q.call).toBeCloseTo(q.fold, 12);
    // The King always calls.
    const k = actionValues(2, 'b', nashP1(), nashP2());
    expect(k.call).toBeGreaterThan(k.fold);
  });
  it('settles hands', () => {
    expect(settle(2, 0, 'kk')).toBe(1);
    expect(settle(0, 2, 'bc')).toBe(-2);
    expect(settle(0, 2, 'bf')).toBe(1);
    expect(settle(2, 0, 'kbf')).toBe(-1);
    expect(settle(1, 0, 'kb')).toBeNull();
  });
});
