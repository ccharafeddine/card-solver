/**
 * A small client for the maths worker: each tab sends its latest question and
 * only the answer to the newest one is used, so old, slow answers never
 * overwrite new ones.
 */
import type { WorkerRequest, WorkerResponse } from '../worker';

type Req = WorkerRequest extends infer R ? R extends { id: number } ? Omit<R, 'id'> : never : never;

export class Solver {
  private worker: Worker | null = null;
  private last = 0;
  private id = 0;
  constructor(private onAnswer: (m: WorkerResponse) => void) {}
  ask(req: Req) {
    if (!this.worker) {
      this.worker = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => { if (e.data.id === this.last) this.onAnswer(e.data); };
    }
    this.last = ++this.id;
    this.worker.postMessage({ ...req, id: this.last } as WorkerRequest);
  }
  /** Forget the question in flight (its answer will be ignored). */
  cancel() { this.last = -1; }
}
