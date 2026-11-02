# Design

## Context

See proposal.md for motivation. Relevant current state:

- `lib/projections/game-projection.ts`'s `projectGame` blends each team's
  own season `pointsPerGame`/`oppPointsPerGame` (`TeamSeasonStat`) with a
  recency-weighted average of its last 10 `FINAL` games (60% recent / 40%
  season, ≥3-game qualifying bar), independently per team — it never looks
  at who either team's recent games were *against*. `ingest/generate-projections.ts`'s
  `generateGameProjections` currently loads only the two teams in a given
  game (`loadTeamProjectionInput(teamId, seasonId)`), one game at a time.
- `lib/projections/opponent-factor.ts` already does a related but simpler
  thing for player props: a single-pass (non-iterative) league-average-relative
  multiplier per team, from `TeamGameStat` rows — "how much more/less than
  average does this team allow." It's a useful existing precedent (same
  "derive opponent strength from already-ingested game data" idea) but not
  directly reusable here, since it's single-pass and stat-allowed-specific,
  not an iteratively-solved, two-sided (offense *and* defense) team rating.
- `ingest/generate-projections.ts`'s `generateGameProjections` computes
  `marginStdev`/`totalStdev` via `combineStdev` over each team's own raw
  recent-game scoring-margin/total variance (`lib/projections/confidence.ts`).
  This is the variance the 0.75σ `isBettable` bar is measured against — see
  proposal.md for why it's almost unreachable today.
- `GameProjection.marketMarginAtPick` already freezes the market's
  home-relative implied margin at projection time (added for spread/total
  grading) — enough to derive a "market favorite" straight-up pick with no
  new ingest.
- `lib/accuracy/grade-game.ts` has `gradeGameProjection`
  (margin-sign-vs-actual-sign) and `gradePredictorSnapshot`
  (win-probability-vs-actual) as existing patterns for a win/loss grade.
- The `add-player-availability-signal` change (archived) added
  `TeamProjectionInput.unavailableScorers` and a `REDISTRIBUTION_LOSS_FACTOR`
  that reduces a team's blended offense when a qualifying scorer is frozen
  `OUT`. This runs *after* the base offense number is computed — whatever
  replaces the base offense number, this adjustment should still apply the
  same way, on top of it.

## Goals / Non-Goals

**Goals:**
- Replace the raw PPG blend with an opponent-adjusted rating so a team's
  projected offense/defense reflects who it actually played, not just how
  many points it scored.
- Make the spread/total confidence bar statistically reachable by deriving
  its variance estimate from the new model's own backtested error, not raw
  scoring noise.
- Keep the change simple/inspectable arithmetic — no ML, no fitted
  regression, consistent with the project's existing methodology stance.
- Preserve the `add-player-availability-signal` integration points
  (`unavailableScorers`) without requiring changes to that module.
- Add the market-favorite baseline cheaply, from data already stored.

**Non-Goals:**
- No change to player-prop projection methodology — that side already
  works as designed (bettable filter demonstrably improves hit rate).
- No blending of our model with ESPN's predictor or the market line into
  a single pick — this change produces an independently better *our-model*
  number; whether/how to ensemble it with ESPN or the market is a separate,
  evidence-gated decision for later.
- No true walk-forward backtest (computing what the model *would have*
  projected using only data available before each historical game) — see
  "Residual-based stdev" below for the simpler approximation used instead,
  and why.
- No neutral-site or schedule-strength adjustment beyond what the rating
  solve itself produces (e.g. no explicit rest/travel factors — those are
  a separate deferred signal per the original design.md).

## Decisions

### Rating methodology: league-wide iterative offense/defense solve (SRS-style), not Elo
Each team gets two numbers, both expressed as "points relative to league
average": an **offensive rating** and a **defensive rating**. Solved by
fixed-point iteration over every team in the league at once (not just the
two teams in a given matchup):

```
offRating[i] (next) = avg over team i's games in the window of
                         (pointsScored_in_that_game - defRating[opponent])
                       - leagueAvgPoints

defRating[i] (next) = avg over team i's games in the window of
                         (pointsAllowed_in_that_game - offRating[opponent])
                       - leagueAvgPoints
```

All ratings initialized to 0; iterate until the largest single rating
changes by less than 0.05 pts between iterations, capped at 20 iterations
(this is the same category of fixed-point solve as a standard Simple
Rating System, just split into separate offense/defense components instead
of one net-margin number, so an actual team *score* — needed for the total
— stays derivable, not just a margin).

- **Alternative considered: Elo.** Rejected — Elo update requires picking
  a K-factor and a margin-of-victory multiplier (both tunable, somewhat
  arbitrary parameters), and is inherently sequential/order-dependent
  (today's rating depends on the exact order games were processed in).
  SRS-style fixed-point iteration has no such tunable update-rate
  parameter and is order-independent — more inspectable, closer to the
  project's existing "simple, clamped constants" philosophy than Elo's
  "simple but path-dependent" one.
- **Alternative considered: a single net-margin rating (no offense/defense split).**
  Rejected — the page needs a projected *total* (home score + away score),
  not just a margin; a single net rating can't be decomposed back into two
  scores without another assumption. Splitting into offense/defense from
  the start avoids that problem and is barely more code.
- Computed over two separate windows — the existing last-10-games recency
  window, and the full season — each independently converged, then
  **blended 60/40 recent/season**, exactly the existing `RECENT_FORM_WEIGHT`
  convention applied to ratings instead of raw PPG. Reuses the existing
  ≥3-game qualifying bar: below it, a team's rating falls back to its
  season-only rating, same as today's `blend()` fallback behavior.

### Projected score: same output shape as today, different inputs
`projectedHomeScore = leagueAvgPoints + homeOffRatingBlended + awayDefRatingBlended + edge/2`
(and the symmetric away formula) — same structural shape as today's
`(homeOff + awayDef) / 2 + edge/2`, just with `homeOff`/`awayDef` now
being opponent-adjusted ratings plus the league average instead of raw
blended PPG. Home-court `edge` calculation is unchanged. The
`unavailableScorers` adjustment (`add-player-availability-signal`) still
subtracts its `REDISTRIBUTION_LOSS_FACTOR`-scaled loss from the blended
offense number *after* this, same call site, same formula — nothing about
that integration needs to change, since it only cares about "a team's
offense number," not where that number came from.

### Scope of the iterative solve: league-wide, computed once per sync cycle
`generateGameProjections` currently loads data per-game, for just the two
teams playing. The rating solve needs every team's recent/season schedule
and results at once. New module (`lib/projections/team-rating.ts`, pure,
no DB access, same pattern as `opponent-factor.ts`) takes a flat list of
every team's games (`{ teamId, opponentId, pointsFor, pointsAgainst }`,
already the shape `TeamRecentGame`-adjacent data comes in) and returns a
`Map<teamId, { offRating, defRating }>` for recent and season windows.
`ingest/generate-projections.ts` loads the league-wide game list **once**
per run (not once per game, as today's per-team queries effectively are)
and computes both rating maps before looping over scheduled games — a
straightforward within-script memoization, not a new persisted table,
since this is cheap to recompute every sync cycle from already-ingested
`Game`/`TeamGameStat` rows.

### Graceful degradation when league-wide data is thin
Early in a season (or in this dev dataset, where "season 3" has as few as
6 completed games for some teams), the iterative solve's opponent-strength
signal is itself built on very little evidence. Rather than withholding
every projection league-wide until data accumulates: if the league-wide
game count feeding a given window is below a minimum threshold (e.g. fewer
than 20 total league games in that window), skip the opponent-adjustment
step for that window and fall back directly to the plain recency/season
PPG average — the exact behavior that exists today. This degrades to the
old methodology smoothly rather than as a hard cutover, and never produces
*no* projection for a team that itself has qualifying history, matching
the "never fabricate, but don't needlessly withhold" precedent already set
by the per-team ≥3-game bar.

### Residual-based stdev: a pragmatic approximation, not a true walk-forward backtest
`marginStdev`/`totalStdev` become the **standard deviation of
(actual margin or total − what the current ratings would project)**,
computed over a trailing window of the league's last ~60-90 completed
games (a single shared, league-wide figure, not per-team/per-game —
same "one shared number, not fitted per matchup" precedent as
`opponent-factor.ts`'s league-average denominator). This is computed using
**today's** ratings applied retroactively to those past games, not each
game's own pre-game rating snapshot — a true walk-forward backtest would
require re-solving ratings as of every historical date, which is
materially more engineering for a next-level-of-polish improvement this
phase doesn't need to chase.
- **Known limitation, stated plainly**: this has mild lookahead bias — a
  team's current rating partially reflects the very past games being used
  to measure its own error, so the residual is likely a slight
  underestimate of true out-of-sample variance. Accepted for now because
  (a) it's still a materially tighter, more honest estimate than raw
  per-game scoring swings (which have no opponent-adjustment at all), and
  (b) the frozen/graded harness already in place will reveal, from real
  evidence, whether this approximation is good enough or needs the full
  walk-forward treatment later.
- **Alternative considered**: true walk-forward backtest (re-solve ratings
  using only data available before each historical game's date). Rejected
  for this change — meaningfully more implementation and runtime cost, and
  the frozen-projection/grading design already means this can be swapped
  in later as a new `method` version without touching anything else.

### Market-favorite accuracy baseline: computed live, no new storage
`marketMarginAtPick` is already frozen per `GameProjection` row and
`Game.homeScore`/`awayScore` are already stored once `FINAL`. A new pure
function (alongside `gradeGameProjection`/`gradePredictorSnapshot` in
`lib/accuracy/grade-game.ts`) — `gradeMarketFavorite(marketMarginAtPick,
actualHomeScore, actualAwayScore)` — grades "home favored" (`marketMarginAtPick
> 0`) vs. the actual winner, mirroring `gradeGameProjection`'s
sign-comparison shape. Computed at accuracy-read time (in
`/api/betting/accuracy`, alongside the existing `gameAccuracy`/
`predictorAccuracy` computations) rather than stored as new graded columns
on `GameProjection` — nothing about it is time-sensitive in the frozen
sense; it's pure arithmetic over two values that are already frozen/final.
- **Alternative considered**: grading the market favorite *against the
  spread* (always "pick the favorite to cover"). Rejected — a sportsbook
  line is specifically calibrated so each side covers close to 50% of the
  time; "the favorite covers" isn't a meaningful baseline the way "the
  favorite wins straight-up" is. Scoped to straight-up winner only.

## Risks / Trade-offs

- **[Early-season rating instability]** With few league-wide games, even
  the opponent-adjusted solve can be noisy. **Mitigation**: the graceful-degradation
  threshold above, plus the existing per-team ≥3-game qualifying bar.
- **[Residual-stdev lookahead bias]** Stated above — accepted as a
  reasonable approximation, revisit if grading shows it's materially
  understating variance (bettable picks hitting at a notably lower rate
  than their claimed confidence would imply).
- **[More compute per sync cycle]** League-wide iteration is a step up
  from today's two-teams-at-a-time loading, though still a fixed-point
  solve over ~30 teams' recent-game data (not a growing dataset) —
  expected to stay well within the existing sync cadence's time budget;
  confirm during implementation rather than assuming.
- **[Still may not beat ESPN]** Same honest risk the original v1
  methodology accepted — this is a principled upgrade, not a guarantee;
  the market-favorite baseline added here exists specifically so that if
  it doesn't, there's a clear, cheap second comparison point (beating the
  market) to learn from instead of just "still behind ESPN."

## Migration Plan

1. Add `lib/projections/team-rating.ts` (pure, league-wide iterative
   offense/defense solve) with its own unit tests, independent of
   `game-projection.ts`.
2. Update `lib/projections/game-projection.ts` to accept rating-based
   offense/defense inputs instead of raw blended PPG, preserving the
   `unavailableScorers` adjustment call site and `GameProjectionResult`
   shape unchanged.
3. Update `ingest/generate-projections.ts` to load league-wide game data
   once per run, compute both rating maps, and pass them into
   `generateGameProjections`; add the residual-based `marginStdev`/
   `totalStdev` calculation.
4. Add `gradeMarketFavorite` to `lib/accuracy/grade-game.ts`; wire into
   `/api/betting/accuracy` as a third baseline alongside `ourModel`/
   `espnPredictor`.
5. Bump the persisted `method` tag on new `GameProjection` rows (e.g.
   `v2-opponent-rating`) so grading/analysis can distinguish old and new
   methodology projections going forward, consistent with the original
   design's "method/version tag" extensibility story.
6. Rollback: `game-projection.ts`'s public shape is unchanged
   (`TeamProjectionInput`/`GameProjectionResult`), so reverting steps 1-3
   to the prior PPG-blend implementation requires no schema or call-site
   changes beyond those three files; step 4's new baseline is additive and
   can be left in place or removed independently.
