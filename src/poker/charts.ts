/**
 * Reference preflop charts by seat for a 6-player table. They are simple and
 * honest: each opening range is the strongest share of hands for that seat,
 * ordered by all-in equity against one random hand (strength.ts). Real
 * solver charts mix hands, use different sizes and change with stacks; these
 * are a starting point to learn from, not a solution.
 */
import { topPercent, type Range } from './range';

export interface Seat { id: string; label: string; pct: number; note: string }
export const SEATS: Seat[] = [
  { id: 'utg', label: 'Under the gun (first)', pct: 15, note: 'First to act with five players still to come: play only strong hands.' },
  { id: 'hj', label: 'Hijack', pct: 20, note: 'Four players behind you: a little looser.' },
  { id: 'co', label: 'Cutoff', pct: 28, note: 'Only three players behind: open more hands.' },
  { id: 'btn', label: 'Button (dealer)', pct: 45, note: 'You act last after the flop, the best seat: open lots of hands.' },
  { id: 'sb', label: 'Small blind', pct: 38, note: 'Only the big blind is left, but you act first after the flop.' },
  { id: 'bb', label: 'Big blind: defend vs the button', pct: 55, note: 'You already paid a blind and get a good price, so you defend wide.' },
];

export const seatRange = (id: string): Range => topPercent(SEATS.find((s) => s.id === id)?.pct ?? 15);
