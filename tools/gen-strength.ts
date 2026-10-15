import { monteCarlo, rng } from '../src/poker/equity';
import { combosOf } from '../src/poker/range';
const out: number[] = [];
const r = rng(12345);
for (let k = 0; k < 169; k++) {
  const [a, b] = combosOf(k)[0];
  const e = monteCarlo({ hero: [a, b], board: [], dead: [], opponents: 1, range: null }, 60000, r);
  out.push(Math.round(e.equity * 1000) / 10);
}
console.log(JSON.stringify(out));
