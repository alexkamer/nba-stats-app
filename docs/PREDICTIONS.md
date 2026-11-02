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
- **ESPN's team injury report**: the same live endpoint already used on team
  pages (`src/lib/espn-team-injuries.ts`), mapped to a fixed status enum
  (`lib/espn/injury-status-mapping.ts`) and persisted per (game, player) —
  see "Player availability" below.
- **Everything our own model uses** (season stats, recent game logs, box
  scores) is data already ingested for the rest of the app — no new source.

## Pipeline order (`ingest/run-all-sync.ts`)

1. `sync-betting-odds.ts` — discovers upcoming games, upserts market odds
   and player prop odds, captures the one-time ESPN predictor snapshot.
2. `sync-player-availability.ts` — fetches both teams' injury reports for
   every scheduled game and upserts a `PlayerAvailability` row per rostered
   player (see "Player availability" below).
3. `generate-projections.ts` — computes and **freezes** our own projections
   (below) for any scheduled game/prop that doesn't have one yet, using
   whatever availability data step 2 has captured so far.
4. `grade-predictions.ts` — for games that just went `FINAL`, grades every
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

## Player availability (`lib/espn/injury-status-mapping.ts`,
`ingest/sync-player-availability.ts`)

A `PlayerAvailability` row per (game, player) — status is one of `OUT`,
`DOUBTFUL`, `QUESTIONABLE`, `PROBABLE`, `AVAILABLE`, mapped from ESPN's
free-text injury-report wording (an unrecognized string maps to
`QUESTIONABLE`, logged, never silently to `AVAILABLE`). A rostered player
with no injury-report entry is recorded `AVAILABLE` explicitly, so every
downstream lookup is a plain map read rather than a found/not-found branch.

Refreshed on every sync run while the game is still `SCHEDULED` — status
genuinely changes pre-tip (a `QUESTIONABLE` resolves one way or the other,
often hours before tip-off) — and never touched once the game is no longer
`SCHEDULED`, so grading and projections never see a post-tip-off change.
This feeds three things below: prop generation skips `OUT` players
entirely, the game projection discounts a team missing a key scorer, and
the teammate role-bump reacts to who's out tonight.

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

**Unavailable-scorer adjustment**: if a rostered player is frozen `OUT` for
the game, and his recent per-game scoring clears a minimum share of his
team's own recent scoring (so a deep bench player going out doesn't trigger
anything), his team's blended offense is reduced by his recent average
times a flat 0.7 redistribution-loss factor — the team is assumed to
recover 30% of his scoring through increased teammate usage, lose the rest.
This constant is an unvalidated placeholder (consistent with the rest of
this model's philosophy of simple clamped constants over a fitted one), not
a per-team/per-player empirical figure — revisit once graded evidence
with/without it exists.

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

A player frozen `OUT` for the game gets **no projection at all** — not
generated, not just hidden on the page (`ingest/generate-projections.ts`).
A missed game never has a `PlayerGameStat` row, so it's already excluded
from the recency window above with no extra filtering needed.

**Teammate role-bump** (`lib/projections/teammate-role-adjustment.ts`):
when one or more of a player's current teammates are frozen `OUT` tonight,
this season's games where *any* of those same teammates already missed are
pooled into one combined "games resembling tonight" sample; if there are
≥2 such games, the player's average stat value in them vs. his own
pre-adjustment baseline becomes one multiplier, clamped to 0.85×–1.3×,
applied on top of the two adjustments above. Below 2 qualifying games,
no adjustment (neutral 1×).

This is deliberately **one combined multiplier across every absent
teammate, not one multiplier per teammate chained together** — an early
version multiplied each teammate's independently-clamped multiplier
together, which compounds without bound when several teammates are out at
once (a realistic case for an injury-depleted roster): six absences each
clamped to ~1.3× still multiplied out to roughly 4.4×, turning a sane
projection into nonsense. Pooling the evidence first keeps the result
inside the same single clamp no matter how many teammates are out.

Returns `null` (no projection created) if the player has no season average
and no recent games for that stat.

**Tracked stat types**: points, rebounds, assists, 3PM, steals, blocks, the
points/rebounds/assists combos, and double-double/triple-double
(`lib/espn/prop-types.ts`). Quarter/half markets and milestone props
(e.g. "30+ points") are deliberately not ingested.

## What isn't modeled

No starting-lineup confirmation (availability status is not the same as a
confirmed starting five), no days-of-rest adjustment, no pace/possession
adjustment, no paid lineup/minutes vendor (e.g. Rotowire — ESPN's free
injury report is the only availability source, by design), and home/away
is only a factor for game projections, not player props. These are
deliberately deferred — adding them would mean a new ingest path (lineups,
rest, a paid vendor) or a different model shape (pace-adjusted efficiency),
not a change to the blending approach above.

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
