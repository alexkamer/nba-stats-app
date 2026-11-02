# How Predictions Are Made (Betting Insights)

This covers the `/betting` page: how our own projections are computed, how
they're compared to the market and to ESPN's own predictor, how "confident"
picks are chosen, and how everything gets graded once games finish. No ML
model — everything below is a small, inspectable statistical blend, by
design (see `openspec/changes/add-betting-insights-page/design.md`).

## Data sources

- **Market odds & player props**: ESPN's free core API, single-provider
  resource (`sports.core.api.espn.com/.../odds/{providerId}` and
  `.../odds/{providerId}/propBets`, provider `100` = DraftKings). Carries
  both the opening and current line. See `lib/espn/endpoints.ts` and
  `ingest/mappers/odds.ts` / `ingest/mappers/player-props.ts`.
- **ESPN's own predictor**: `summary`'s `predictor` field — win probability
  only, despite the field name `gameProjection`. Captured once per game,
  since ESPN doesn't retain it after the game goes final
  (`ingest/mappers/predictor.ts`).
- **Everything our own model uses** (season stats, recent game logs, box
  scores) is data already ingested for the rest of the app — no new source.

## Pipeline order (`ingest/run-all-sync.ts`)

1. `sync-betting-odds.ts` — discovers upcoming games, upserts market odds
   and player prop odds, captures the one-time ESPN predictor snapshot.
2. `generate-projections.ts` — computes and **freezes** our own projections
   (below) for any scheduled game/prop that doesn't have one yet.
3. `grade-predictions.ts` — for games that just went `FINAL`, grades every
   frozen projection against the actual result.

Projections are written once and never recomputed — "frozen pre-game" is
load-bearing: it's what keeps grading honest (no hindsight) and what lets
the market line move after we've made our pick without us quietly
re-pricing it.

**Game projections can be created before a market line exists** — a game
gets discovered and projected as soon as it's `SCHEDULED`, which can be a
day or more before DraftKings posts a spread/total for it. In that case
`marketMarginAtPick`/`marketTotalAtPick` come back `null` and no spread/total
pick is ever graded (there was nothing to pick against). `generate-projections.ts`
also runs a `backfillMissingMarketLines()` pass every cycle that fills in
the market line — and recomputes `spreadBettable`/`totalBettable` — for any
still-`SCHEDULED` projection missing one, once the line is posted. This is
still pre-game, so it doesn't violate the no-hindsight rule; it only ever
catches a pick up to a line that was always going to arrive before tip-off.
Player prop projections don't have this gap: `generatePlayerPropProjections`
is driven directly off existing `PlayerPropOdds` rows, so a prop projection
is never created without a line in the first place.

## Game projections (`lib/projections/game-projection.ts`)

For each team: blend season points-per-game / opp-points-per-game with a
recency-weighted average of their last 10 final games — 60% recent form /
40% season average, and only once there are ≥3 recent games (below that,
season average alone). Projected score = average of (this team's blended
offense, the opponent's blended defense), plus a home-court edge. That edge
comes from each team's own recent home-vs-away scoring margin split,
falling back to a flat +2.0 pts if there isn't enough of a split to compute.

This is the only place opponent strength enters a game prediction — it's
baked into "the opponent's blended defense" term, not a separate factor.

Returns `null` (no projection created) if either team has no season stat
and no recent games — never fabricated.

## Player prop projections (`lib/projections/player-prop-projection.ts`)

Same recency blend (60% recent / 40% season, same ≥3-game threshold) on the
player's raw per-game value for the tracked stat, then two adjustments
applied in sequence:

1. **Minutes trend** — last-3-games average minutes vs. the whole recent
   window, as a multiplier clamped to 0.7×–1.3× (so one blowout/garbage-time
   game can't swing the projection).
2. **Opponent factor** (`lib/projections/opponent-factor.ts`) — how much
   more/less than league average the specific opponent tends to allow in
   that stat, derived from already-ingested `TeamGameStat` rows (what a
   team "allowed" in a game is just what its opponent put up that game).
   Clamped to 0.85×–1.15×, and neutral (1×) for any team with fewer than 5
   games of history. Not computed for `DOUBLE_DOUBLE`/`TRIPLE_DOUBLE` — those
   are per-player achievement flags, not a stat a team "allows" in the same
   sense.

Returns `null` (no projection created) if the player has no season average
and no recent games for that stat.

**Tracked stat types**: points, rebounds, assists, 3PM, steals, blocks, the
points/rebounds/assists combos, and double-double/triple-double
(`lib/espn/prop-types.ts`). Quarter/half markets and milestone props
(e.g. "30+ points") are deliberately not ingested.

## What isn't modeled

No injury/availability data, no starting-lineup confirmation, no
days-of-rest adjustment, and home/away is only a factor for game
projections, not player props. These were deliberately deferred (see
project discussion) as a second pass — adding them would mean a new ingest
path (injuries/lineups) or a cheap but lower-impact signal (rest), not a
change to the blending approach above.

## Confidence / "bettable" picks (`lib/projections/confidence.ts`)

A projection beating the line by a little is not the same as beating it by
a lot, and raw over/under correctness treats them identically. Instead:

- `computeStdev` — population standard deviation of the player's (or, for
  games, the pooled home+away) recent per-game values for that stat/margin/
  total.
- `computeEdgeRatio` — `|projection − line| / stdev`: how many standard
  deviations of edge the pick has. `null` with no line or no variance
  estimate.
- `isBettable` — true once that ratio clears **0.75** (`BETTABLE_EDGE_STDEV_MULTIPLIER`).

This "confidence" number is what the page shows (e.g. `1.4σ`) and what
gates the orange-dot indicator and the Recommended Picks table. It's
computed and frozen once, same as the projection itself.

For **player props**, the stat's own stdev is computed from the same
recent-games window as the projection. For the **game spread/total**, the
stdev is pooled from both teams' recent scoring-margin (spread) or
scoring-total (total) variance via `combineStdev` — `sqrt((a² + b²) / 2)`.

### The spread pick is NOT "whoever we think wins"

A team can be our own projected winner and still be the side we'd fade
against the market line — e.g. market has a team at -14.5, we project them
to win by only 6.4: the value side is the underdog getting +14.5, not the
favorite. `spreadValueSide` (in `src/app/betting/page.tsx`) picks the side
by comparing our margin to the market's *implied* margin
(`-Odds.spread`), not by the sign of our own margin. Only marked when
`isBettable` clears the bar; otherwise both sides render plain, since
there's no confident recommendation to make either way.

## Grading (`ingest/grade-predictions.ts`, `lib/accuracy/*`)

Runs once a game reaches `FINAL`. Four independent things get graded per
game/prop — they are different bets and can disagree with each other:

| Metric | What it answers | Function |
|---|---|---|
| Winner (straight-up) | Did our favored side actually win? | `gradeGameProjection` |
| Spread (ATS) | Did the side we'd bet actually cover the market line? | `gradeSpreadCoverage` |
| Total (O/U) | Did the side we'd bet on the total actually hit? | `gradeTotalCoverage` |
| Player prop | Did the player's actual stat land on our side of the line? | `gradePlayerProp` |
| ESPN predictor | Did ESPN's favored side win? | `gradePredictorSnapshot` |

Spread/total grading compares against the market line **as it was when the
projection was frozen** (`GameProjection.marketMarginAtPick`/
`marketTotalAtPick`), not whatever the market has moved to since — the same
"never recompute" principle as the projection itself.

A push (projection or actual result lands exactly on the line) grades as
`null`, excluded from both the numerator and denominator of the hit rate
(`lib/accuracy/compute-accuracy.ts`) rather than counted as a loss.

Accuracy is tracked both overall and filtered to only the `bettable`
picks (`/api/betting/accuracy`'s `bettableProps`/`bettableSpread`/
`bettableTotal` buckets) — a near-miss on a low-edge pick shouldn't drag
down the number that represents our actual recommendations.
