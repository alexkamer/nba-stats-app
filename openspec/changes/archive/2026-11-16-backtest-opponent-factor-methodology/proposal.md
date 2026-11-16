# Proposal

## Why

`fix-player-projection-season-scope` fixed a bug where a player's "season average" leaked in career history from prior seasons. The regression sweep done while implementing that fix (task 4.1) found the same bug class in a second, higher-impact place: `loadOpponentFactors()` in `ingest/generate-projections.ts` queries every `TeamGameStat` row ever recorded (`TeamGameStat` data goes back to 2002) with no season filter, then feeds it into `computeOpponentFactors()` to compute each team's "how much more/less than league average does this team allow" multiplier — a signal used by *every* game and player-prop projection, not just long-career players. A quick measurement already showed this is material, not theoretical: the Knicks' opponent factor comes out to `0.914` computed from this-season-only data vs. `1.004` computed from all 24 seasons of history — a 9-point swing, well inside the code's `[0.85, 1.15]` clamp. Before changing this production code, we want the same evidence-first treatment the player-average fix got: a walk-forward backtest comparing the current unscoped methodology against a season-scoped one, using real historical outcomes.

## What Changes

- Add a backtesting tool, in the spirit of the one already built for player-prop projections, that walks forward through each team's game history and compares two ways of computing "how much a team allows" for each opponent-adjustable stat: the current unscoped (all-time) average and a season-scoped one — both run through the existing, unmodified `computeOpponentFactors()` so the backtest reflects production behavior exactly, including its below-minimum-sample neutral-factor fallback.
- Measure which variant's predicted "allowed value" is closer to what a team's opponent actually produces in each subsequent game — no market odds needed, same as the player-level backtest.
- Segment results by how many current-season games the team has played as of the game being predicted (e.g. early/mid/late season), since that's exactly where an unscoped-vs-scoped divergence would be expected to matter most or least.
- Standalone, read-only analysis tool — no change to `ingest/generate-projections.ts` or any live table. Its output informs whether and how a follow-up fix to `loadOpponentFactors()` proceeds.

## Capabilities

### New Capabilities
- `opponent-factor-backtesting`: lets a candidate team-level opponent-adjustment methodology be evaluated against historical actual game outcomes, so a proposed change to how opponent factors are computed can be validated with evidence before it ships. Distinct from the existing `projection-methodology-backtesting` capability, which is specific to player-level season-average projections (tenure-segmented by player, graded against a player's own stat line) — this one operates on team-level allowed-stat history and has no notion of player tenure.

## Impact

- New standalone script/tool (no existing production code path is modified).
- Reads existing `TeamGameStat`, `Game`, and `Season` tables only.
- Depends on `lib/projections/opponent-factor.ts`'s `computeOpponentFactors()` being reusable as a pure function outside the live ingest pipeline (it already is — no changes needed there).
- Output is a report (console/file), not a persisted database table; no schema change.
- A follow-up change to actually fix `loadOpponentFactors()` (analogous to `fix-player-projection-season-scope`) is expected after this backtest's results are reviewed, but is out of scope here.
