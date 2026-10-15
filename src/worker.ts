/// <reference lib="webworker" />
/**
 * The heavy maths runs here so the page never stalls: poker equity (exact or
 * Monte Carlo, with progress) and the blackjack house edge and chart.
 */
import { equity, exactCost, EXACT_LIMIT, validate, type EquityInput, type EquityResult } from './poker/equity';
import { gameEV, strategyChart, type Chart, type Rules } from './blackjack/engine';

export type WorkerRequest =
  | { id: number; kind: 'equity'; input: EquityInput; trials: number }
  | { id: number; kind: 'blackjack'; rules: Rules };
export type WorkerResponse =
  | { id: number; kind: 'equity'; result: EquityResult; ms: number; final: boolean; cost: number }
  | { id: number; kind: 'blackjack'; ev: number; chart: Chart; ms: number }
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
    } else {
      const ev = gameEV(req.rules);
      post({ id: req.id, kind: 'blackjack', ev, chart: strategyChart(req.rules), ms: performance.now() - t0 });
    }
  } catch (err) {
    post({ id: req.id, kind: 'error', message: (err as Error).message });
  }
};
