/// <reference lib="webworker" />
/**
 * The heavy maths runs here so the page never stalls: poker equity (exact or
 * Monte Carlo, with progress), the blackjack house edge and chart, the best
 * video poker hold, gin rummy melds and discards, and cribbage discards.
 */
import { equity, exactCost, EXACT_LIMIT, validate, type EquityInput, type EquityResult } from './poker/equity';
import { gameEV, strategyChart, type Chart, type Rules } from './blackjack/engine';
import { analyze, type Hold } from './vpoker/engine';
import { discardOptions, bestMelds, takeUpcard, type DiscardOption, type Melds } from './gin/engine';
import { bestDiscards, type DiscardResult } from './cribbage/engine';

export interface GinResult { melds: Melds; discards: DiscardOption[] | null; upcard: ReturnType<typeof takeUpcard> | null }

export type WorkerRequest =
  | { id: number; kind: 'equity'; input: EquityInput; trials: number }
  | { id: number; kind: 'blackjack'; rules: Rules }
  | { id: number; kind: 'vpoker'; hand: number[]; pays: number[] }
  | { id: number; kind: 'gin'; hand: number[]; up: number | null }
  | { id: number; kind: 'crib'; six: number[]; dealer: boolean };
export type WorkerResponse =
  | { id: number; kind: 'equity'; result: EquityResult; ms: number; final: boolean; cost: number }
  | { id: number; kind: 'blackjack'; ev: number; chart: Chart; ms: number }
  | { id: number; kind: 'vpoker'; holds: Hold[]; ms: number }
  | { id: number; kind: 'gin'; result: GinResult; ms: number }
  | { id: number; kind: 'crib'; results: DiscardResult[]; ms: number }
  | { id: number; kind: 'error'; message: string };

const post = (m: WorkerResponse) => (self as unknown as Worker).postMessage(m);

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  const t0 = performance.now();
  try {
    if (req.kind === 'equity') {
      const bad = validate(req.input);
      if (bad) { post({ id: req.id, kind: 'error', message: bad }); return; }
      const cost = exactCost(req.input);
      const result = equity(req.input, req.trials, undefined, (r) => post({ id: req.id, kind: 'equity', result: r, ms: performance.now() - t0, final: false, cost }));
      post({ id: req.id, kind: 'equity', result, ms: performance.now() - t0, final: true, cost: cost <= EXACT_LIMIT ? cost : -1 });
    } else if (req.kind === 'vpoker') {
      post({ id: req.id, kind: 'vpoker', holds: analyze(req.hand, req.pays), ms: performance.now() - t0 });
    } else if (req.kind === 'gin') {
      const hand = req.hand;
      const result: GinResult = {
        melds: bestMelds(hand),
        discards: hand.length === 11 ? discardOptions(hand) : null,
        upcard: hand.length === 10 && req.up !== null ? takeUpcard(hand, req.up) : null,
      };
      post({ id: req.id, kind: 'gin', result, ms: performance.now() - t0 });
    } else if (req.kind === 'crib') {
      post({ id: req.id, kind: 'crib', results: bestDiscards(req.six, req.dealer), ms: performance.now() - t0 });
    } else {
      const ev = gameEV(req.rules);
      post({ id: req.id, kind: 'blackjack', ev, chart: strategyChart(req.rules), ms: performance.now() - t0 });
    }
  } catch (err) {
    post({ id: req.id, kind: 'error', message: (err as Error).message });
  }
};
