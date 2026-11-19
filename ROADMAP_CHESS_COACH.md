# Chess Trainer — product improvement roadmap

Goal: turn the site into a personal chess coach that identifies weaknesses, schedules training, teaches opening concepts, and tracks measurable improvement toward the user's rating goal.

## Current opening-training capabilities (keep and build on)
- Opening catalog, color/first-move filters, theory board, move sequence, opening ideas/plans.
- PGN import and branch training.
- Opening deviation practice and opening-specific Stockfish bot.
- User-created PGN variations and notes.
- Board arrows and premove infrastructure.
- Daily training dashboard and weekly coach plan.

Do not duplicate these features. Improve them and connect them.

## Phase 1 — Opening repertoire & review system
- [ ] Personal repertoire: White/Black, editable branches, saved user lines, import/export PGN.
- [ ] Track position/line attempts, success, missed moves, and deviation points.
- [ ] Due-review queue with adaptive spaced repetition (remember / hard / forgot).
- [ ] Re-review missed moves in context, not only isolated flashcards.
- [ ] Catalog cards show learning state and due count.
- [ ] Opening sprint (30s, 1m, 3m, endless) using due lines first.
- [ ] Persist data safely per signed-in user; no sensitive data in browser keys.

Acceptance: refresh/relogin retains repertoire and review progress; a wrong move schedules the position sooner; completing a line updates review and mastery; imported PGN remains user-editable.

## Phase 2 — Play and deviation coach
- [ ] Opening-specific bot modes: practical game, learn line, opponent deviation.
- [ ] Choose 5+0, 10+0, custom, and untimed.
- [ ] On deviations, show an actionable candidate plan and let the user try a response before revealing engine.
- [ ] After games, show theory exit point, missed opportunities, and save missed positions to review.
- [ ] Use the same arrows, move interactions, and premove logic across opening/endgame/mate trainers.

Acceptance: deviation drill works after both sides' deviations; games have a replayable move list; post-game summary points to positions that can be practiced.

## Phase 3 — Personal mistake training
- [ ] Extract training positions from analyzed games: tactics missed, hanging pieces, missed mate, poor trades, and endgame conversion/defense.
- [ ] User plays the best move before the answer is revealed ("How would you play?").
- [ ] Track motif-specific success rate, with filtering by weakness.
- [ ] Remove non-tactical captures from the "missed tactics" list; keep tactical motifs.
- [ ] Only save personal endgame positions under "My endgames" when user lost but engine evaluation indicates a winning opportunity was missed.

Acceptance: sourced positions link to original game and move; repeatable drills preserve user's attempt and show a clear explanation.

## Phase 4 — Daily coach & skill profile
- [ ] Unified skill profile for tactics, openings, positional play, endgames, decision quality, and time pressure.
- [ ] Skill scores based on observed attempts/analysis, not illustrative hard-coded values.
- [ ] Daily 60-minute plan can adapt to the most weak/overdue skill.
- [ ] Weekly report: completed time, trends, recurring errors, and next week's focus.
- [ ] Rating goal progress and milestones; clearly distinguish estimates from actual ratings.

Acceptance: every dashboard number is data-derived, plan actions link to the relevant training, and weekly plan refresh doesn't erase completed history.

## Phase 5 — UX and reliability polish
- [ ] Simplify crowded training/tactics panels.
- [ ] Consistent dark/light visual language, spacing, mobile responsiveness.
- [ ] Clear move-list layout and evaluation display.
- [ ] Improve game history persistence and bot-game move visibility.
- [ ] Fix premove edge cases, including mate-in-one/mate-training situations.
- [ ] Validate analyzer accuracy against sample PGNs and explain that its accuracy metric is not Chess.com CAPS2 unless calibrated.
- [ ] Recheck Brilliant labels on pin motifs and verified mating sacrifices.
- [ ] Performance budget: avoid redundant engine searches and excessive MultiPV.

## Delivery process
- Implement one coherent feature group at a time, inspect existing code before changing it, keep commits small and descriptive, and run syntax/tests available for the change. Do not claim a feature or test is complete unless verified.
