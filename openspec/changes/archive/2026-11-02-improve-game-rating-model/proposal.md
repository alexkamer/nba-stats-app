# Proposal

## Why

Graded data shows our own game-winner pick hits only 9/21 (42.9%) vs. ESPN's
own predictor at 15/21 (71.4%) on the same games — worse than a coin flip.
Separately, the spread/total confidence bar (`isBettable`, 0.75σ) almost
never fires for games: across 52 `GameProjection` rows, only 5 ever cleared
the spread bar and 2 the total bar, even on a night with an 8-player-out
roster. Both trace to the same root cause: `lib/projections/game-projection.ts`
blends each team's own recent/season points in isolation, never asking how
good the teams it played were — the single most well-known upgrade from a
raw-average model is adjusting for opponent strength, and the model's
variance estimate for confidence (raw per-game scoring swings, ~10-15 pts)
is far noisier than the small edge a PPG-only model can ever generate
against the market, so the bar is structurally almost unreachable.

## What Changes

- Replace the raw PPG/opponent-PPG blend in `lib/projections/game-projection.ts`
  with opponent-strength-adjusted offensive and defensive ratings, solved
  iteratively across the whole league (a Simple-Rating-System-style
  fixed-point solve, not Elo and not ML) — computed separately over a
  recency window and the full season, then blended 60/40 the same way
  today's PPG blend is, preserving the existing recency philosophy.
- Derive `marginStdev`/`totalStdev` (`ingest/generate-projections.ts`) from
  the rating model's own backtested residual error (actual margin/total
  minus what the current ratings would have projected, over a trailing
  window of completed games) instead of raw per-game scoring variance —
  this is what actually makes the confidence bar reachable, since a
  rating model's prediction error is a materially tighter estimate than
  raw scoring noise.
- Keep the existing unavailable-scorer offense adjustment (from
  add-player-availability-signal) working against the new rating-based
  offense input — same 0.7 redistribution-loss factor, same qualifying
  threshold, just applied on top of a rating instead of a raw PPG blend.
- Add a third accuracy baseline — "always pick the market favorite"
  (straight-up, from the frozen `marketMarginAtPick` already stored on
  `GameProjection`, no new ingest or schema) — alongside our model and
  ESPN's predictor in `/api/betting/accuracy`, so it's possible to tell
  whether beating ESPN also means beating the market, not just tracking it.
- Graceful degradation: a team with too little league-wide schedule data
  for the iterative solve to be meaningful (e.g. first week of a season)
  falls back to today's simple recency/season blend for that team, rather
  than losing projections for the whole league until ratings stabilize.

## Capabilities

### Modified Capabilities
- `betting-projections` (`openspec/specs/betting-projections/spec.md`):
  the "Game projection" requirement's methodology changes from a raw
  points blend to opponent-adjusted ratings; "Insufficient data handling"
  gains the early-season graceful-degradation scenario.
- `prediction-accuracy-tracking` (`openspec/specs/prediction-accuracy-tracking/spec.md`):
  the running accuracy record gains a third baseline source (market
  favorite) alongside our model and ESPN's predictor.

## Impact

- **Modified**: `lib/projections/game-projection.ts` (new rating-solve
  internals, same public `projectGame`/`TeamProjectionInput` shape where
  possible so the unavailable-scorer integration doesn't need to change),
  `ingest/generate-projections.ts` (loads league-wide schedule data for
  the solve instead of just the two teams in a game; new residual-based
  stdev calculation), `lib/accuracy/*` and `src/app/api/betting/accuracy/route.ts`
  (new market-favorite baseline, computed from already-stored data).
- **Not modified**: player-prop projection methodology, ESPN-predictor
  capture, the confidence-bar threshold itself (0.75σ stays; only its
  stdev *input* changes), any paid data source (none introduced).
- **New**: a league-wide rating-computation module (exact module name left
  to design.md), likely `lib/projections/team-rating.ts`.
