# Lessons

Rules learned building Card Solver. Sudoku Solver's and Cube Solver's `lessons.md` still apply (Tauri, icons, stable layout).

## Engines
- **Check expected equities by exact count before writing the test.** AhKh on 7h2h9c vs 99 is 24.6%, not the ~30% intuition says.
- **Pot includes the bet.** Pot odds, EV and MDF all disagree by one bet if one formula uses the pot before the bet. MDF uses the pot *before* the bet; the call EV uses the pot *with* it. Comment it where it's used.
- **Peek changes every EV.** With peek, condition on no dealer blackjack; without it, doubles and splits lose two bets to a blackjack. Surrender only makes sense with peek.
- **Memoise the dealer on the multiset of drawn cards**, not the order, or the EV for 8 decks takes seconds.
- **Exact vs Monte Carlo must agree in tests** with a fixed seed; it catches card-removal bugs on both sides.
- **Lesson answers are computed, not typed.** The lessons test runs the engines for each answer; a wrong pot-odds answer slipped in once.

## UI
- **Playing cards ignore the theme.** White faces, red/black suits in every skin; everything else uses tokens. The skins test allows only the `--w` card-width variable.
- **One worker, restart to cancel.** Monte Carlo can't be interrupted mid-loop cheaply; terminating and recreating the worker is simpler and instant.
- **Tour demos change state; restore the tab separately.** Per-step demo restores must not switch tabs, or the tab after the tour is wherever the last demo began. Remember the tab when the tour opens and restore it when it closes.
- **Neubrutalism's button shadow hits every grid cell.** Range cells, chart codes and pickers need explicit overrides.
