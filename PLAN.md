# Card Solver plan

App #4 in the suite: one app, two tabs (Poker, Blackjack), built like Sudoku Solver (TS + Vite + Tauri 2 + PWA, four skins × light/dark, System default).

## Done (v1.0.0 scope)
- [x] Poker engine: cards, 5–7 card evaluator, ranges (169 classes), strength table, exact + Monte Carlo equity in a worker, outs, pot odds / EV / MDF model, seat charts
- [x] Blackjack engine: exact EV per action with card removal, rule variants, house edge, strategy chart, shoe, Hi-Lo, Illustrious 18
- [x] UI: card picker, range painter, equity, outs, decision table, theory panel, charts; rules, best play, chart, trainer, counting
- [x] Tour with live examples (14 steps) and 13 lessons checked against the engines
- [x] Brand: original mark, PWA/Tauri icons, OG card
- [x] Tests, lint, CI, release workflow, README

## Next ideas
- Multi-street poker decisions (bet sizing across turn and river)
- Resplitting and resplit aces in blackjack
- Bet-spread simulator for counting (risk of ruin)
- Range vs range equity matrix
