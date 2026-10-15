/**
 * Hand ranges on the usual 13x13 grid. Row and column run A down to 2.
 * The diagonal holds pairs (6 combos each), above it suited hands (4 combos),
 * below it offsuit hands (12 combos): 1326 two-card hands in all.
 */
import { card, RANKS } from './cards';
import { STRENGTH } from './strength';

/** Grid index (0..168) of the class at row i, column j (0 = Ace). */
export const classAt = (i: number, j: number) => i * 13 + j;
const rankAt = (i: number) => 12 - i;

export function className(k: number): string {
  const i = Math.floor(k / 13), j = k % 13;
  const a = RANKS[rankAt(Math.min(i, j))], b = RANKS[rankAt(Math.max(i, j))];
  return i === j ? a + b : a + b + (i < j ? 's' : 'o');
}
export const comboCount = (k: number) => { const i = Math.floor(k / 13), j = k % 13; return i === j ? 6 : i < j ? 4 : 12; };

/** Every two-card hand in a class, as [high card, low card]. */
export function combosOf(k: number): [number, number][] {
  const i = Math.floor(k / 13), j = k % 13;
  const out: [number, number][] = [];
  if (i === j) {
    const r = rankAt(i);
    for (let s = 0; s < 4; s++) for (let t = s + 1; t < 4; t++) out.push([card(r, s), card(r, t)]);
  } else {
    const hi = rankAt(Math.min(i, j)), lo = rankAt(Math.max(i, j));
    for (let s = 0; s < 4; s++) for (let t = 0; t < 4; t++) if ((i < j) === (s === t)) out.push([card(hi, s), card(lo, t)]);
  }
  return out;
}

/** The class a two-card hand belongs to. */
export function classOf(a: number, b: number): number {
  const ra = a >> 2, rb = b >> 2;
  const hi = Math.max(ra, rb), lo = Math.min(ra, rb);
  const i = 12 - hi, j = 12 - lo;
  if (hi === lo) return classAt(i, i);
  return (a & 3) === (b & 3) ? classAt(i, j) : classAt(j, i);
}

/** A range is one on/off flag per class. */
export type Range = boolean[];
export const emptyRange = (): Range => new Array(169).fill(false);
export const fullRange = (): Range => new Array(169).fill(true);
export const rangeCombos = (r: Range) => r.reduce((n, on, k) => n + (on ? comboCount(k) : 0), 0);
export const rangePercent = (r: Range) => (100 * rangeCombos(r)) / 1326;

/** Classes from strongest to weakest, by all-in equity against one random hand (see strength.ts). */
export const ORDER: number[] = Array.from({ length: 169 }, (_, k) => k).sort((a, b) => STRENGTH[b] - STRENGTH[a]);

/** The strongest classes that together make up about `pct` percent of all hands. */
export function topPercent(pct: number): Range {
  const r = emptyRange();
  let n = 0;
  for (const k of ORDER) {
    if (n >= (pct / 100) * 1326 - 0.5) break;
    r[k] = true; n += comboCount(k);
  }
  return r;
}

/** "AA, KK, AKs" style text for a range (in strength order, short). */
export function rangeText(r: Range): string {
  return ORDER.filter((k) => r[k]).map(className).join(', ');
}

/** Parse "AA, KQs, T9o" or "AKs AQo"; unknown words are ignored and reported. */
export function parseRange(text: string): { range: Range; bad: string[] } {
  const range = emptyRange(), bad: string[] = [];
  const names = new Map(Array.from({ length: 169 }, (_, k) => [className(k), k] as const));
  for (const w of text.split(/[\s,]+/).filter(Boolean)) {
    const t = w.replace(/10/g, 'T').toUpperCase().replace(/S$/, 's').replace(/O$/, 'o');
    const k = names.get(t);
    if (k !== undefined) range[k] = true;
    else if (/^[2-9TJQKA]{2}$/.test(t) && t[0] !== t[1]) {
      for (const sfx of ['s', 'o']) {
        const a = names.get(t + sfx) ?? names.get(t[1] + t[0] + sfx);
        if (a !== undefined) range[a] = true; else bad.push(w);
      }
    } else bad.push(w);
  }
  return { range, bad };
}

export interface Preset { id: string; label: string; range: () => Range }
export const PRESETS: Preset[] = [
  { id: 'any', label: 'Any two cards (100%)', range: fullRange },
  { id: 'p50', label: 'Loose: top 50%', range: () => topPercent(50) },
  { id: 'p30', label: 'Medium: top 30%', range: () => topPercent(30) },
  { id: 'p15', label: 'Tight: top 15%', range: () => topPercent(15) },
  { id: 'p7', label: 'Very tight: top 7%', range: () => topPercent(7) },
  { id: 'premium', label: 'Premium: QQ+, AK', range: () => parseRange('AA KK QQ AKs AKo').range },
];
