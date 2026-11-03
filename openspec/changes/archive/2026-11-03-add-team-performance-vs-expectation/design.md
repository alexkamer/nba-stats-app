# Design

## Context

See proposal.md - Why. The app already grades games against the market: `lib/accuracy/grade-cover.ts` returns a discrete COVER / NO_COVER / PUSH per side, and `ingest/compute-cover-records.ts` folds that into `TeamCoverRecord` counters. This change adds the continuous measure those counters discard (by how much the team beat or missed the line) and the explanatory context around it. `Odds.spread` is home-team-relative and favorite-negative, and holds the line in effect at tip-off once a game leaves `SCHEDULED` (the same "frozen at pick time" assumption the cover-record design relies on). The team page (`src/app/teams/[teamId]/page.tsx`) already uses a `TabPager` with a `TEAM_TABS` list and already receives per-game `odds` for final games; the Teams index (`src/app/teams/page.tsx`) is currently a conference-grouped grid with no data beyond team identity.

## Goals / Non-Goals

**Goals:**
- One authoritative per-team-per-game record of expected vs. actual margin, computed once as games go final.
- Reasons attached to each game are deterministic, explainable, and unit-testable, not generated text.
- Season and league views derive from the same rows, so the team tab and the leaderboard can never disagree.

**Non-Goals:**
- LLM-written narratives, in-game injury detection, playoffs, and multi-season browsing (rows are keyed by game so these are not precluded later).
- Changing `TeamCoverRecord`, `grade-cover.ts`, or how `Odds` lines are captured.
- A single blended "quality score". Cover margin and tags stay separate.

## Decisions

**Persist one row per team per game, not extra counters on `TeamCoverRecord`.** `TeamCoverRecord` is a running aggregate with an idempotency stamp on `Odds`; a cover margin sum there could not support a per-game list, a last-10 split, or tags without a second storage path. A per-game table supports all views by reading, and the aggregates (season average, favorite/underdog/home/away splits, leaderboard) are plain `AVG ... GROUP BY` over about 30 teams x 82 games, which is small enough to compute at read time. This also avoids a second idempotency marker on `Odds`.

- `TeamGamePerformance`: `gameId`, `teamId`, `seasonId`, `opponentTeamId`, `isHome`, `isFavorite` (derived from the spread's sign, null for a pick'em), `spread` (the team-relative line, so a favorite is shown as -13.5), `expectedMargin`, `actualMargin`, `coverMargin`, `label` (enum), `computedAt`. Unique on `(gameId, teamId)`; indexed on `(seasonId, teamId)`.
- `TeamGamePerformanceTag`: `performanceId`, `tag` (enum). A child table rather than a JSON column, following the repo's convention of typed columns for queried betting data (and SQLite has no scalar lists).

**Margin math lives in a pure function.** New `lib/accuracy/grade-performance.ts` exports `computeMargins(spread, homeScore, awayScore)` returning both teams' `{expected, actual, cover}` and `labelFor(coverMargin)`. It mirrors `gradeAtsCover`'s conventions (home expected margin is `-spread`) so the two can never contradict (cover margin > 0 iff COVER, and = 0 iff PUSH). Thresholds are named constants (strongly over/under at 15, over/under at 5; season averages use a ±1.5 band) so they can be tuned in one place; initial guesses of 7 and 2 were retuned against the dev database during implementation, where cover margins have a standard deviation of ~12.6 points, so ±7 labeled 57% of games "strong".

**Tags are pure functions over a small input struct, evaluated in the ingest script.** A `deriveTags(input)` function in `lib/accuracy/performance-tags.ts` takes pre-fetched facts (score timeline, halftime margin, max lead, availability rows with the team's top-N players by minutes, game and season-average FG%) and returns tags. Keeping DB access in the ingest script and logic in the pure function matches the `grade-cover.ts` / `compute-cover-records.ts` split and makes each rule testable with a literal struct.

| Tag | Rule (v1) |
|---|---|
| `STAR_OUT` | A top-3 player by season minutes for the team has `PlayerAvailability.status = OUT` for this game |
| `EARLY_BLOWOUT` | \|margin\| >= 20 at the end of the 2nd period (from `Play`) |
| `LATE_COLLAPSE` | Team led by >= 15 at some point and did not win (10 matched ~14% of team-games, too common to be notable) |
| `GARBAGE_TIME_SWING` | Cover result with 12 minutes left differs from final cover result, with the swing happening while the margin was already >= 15 |
| `SHOOTING_HOT` / `SHOOTING_COLD` | Game FG% differs from the team's season-to-date average by >= 6 percentage points |

The thresholds are v1 defaults, named constants, and listed here as the tuning surface. Each tag is omitted when its source data is absent (no `Play` rows, no availability snapshot), so missing data never produces a wrong tag.

**New ingest script `compute-team-game-performance.ts`, run after `compute-cover-records.ts`.** Finds `FINAL` regular-season games with a non-null `Odds.spread` and no existing `TeamGamePerformance` row, computes margins and tags, and inserts both teams' rows plus tags in one transaction. Idempotency comes from the `(gameId, teamId)` unique constraint plus the existence check, so there is no new stamp on `Odds`. Rows are immutable once written; a later correction to a score would not retroactively change them, which is acceptable because `sync-completed-games.ts` only finalizes settled games.

**Two read-side API routes.** `/api/teams/performance` returns the leaderboard (per-team average cover margin, graded game count, label, ranked) for the current regular season. `/api/teams/[teamId]/performance` returns summary and splits, the per-game rows (with tags and opponent display info), and accepts the same `year` query convention the team route uses. These are separate from the already-large `/api/teams/[teamId]` route so the Performance tab loads lazily and fails independently. The averages are computed in the route from the persisted rows.

**UI placement.** The Performance tab is added to `TEAM_TABS` and uses the existing `useTabQueryParam` deep linking so the leaderboard can link to `?tab=performance`. The leaderboard is a section on the Teams index above the conference grid, styled like the existing `SectionCard`, with team accent colors reused from the grid. The bar chart is a lightweight inline element or small SVG rather than a new charting dependency; whether the project already uses a chart library should be confirmed during implementation.

## Risks / Trade-offs

- **Sparse `Odds` coverage** (documented era gaps in the schema) means some teams will have far fewer graded games than others, so a league average over, say, 5 games is noisy. The leaderboard shows the graded game count next to every average; if it still reads as misleading, a minimum-games threshold can be added without a schema change.
- **Availability is a pre-game snapshot**, so `STAR_OUT` only catches players known to be out going in, not injuries that happen mid-game. The proposal states this as out of scope; whether `Play` descriptions or the ESPN summary can reveal in-game injuries is an open question worth a short spike.
- **Play-by-play completeness**: the tags that use `Play` depend on every game having its plays ingested, which is not verified here. If coverage is partial, those tags will be silently absent for some games, which is a safe failure but should be confirmed (task 1.3).
- **Investigation findings (tasks 1.1-1.4, against the dev database):** the regular-season filter value is `SeasonType.REGULAR`; about 14.3k regular-season final games have a recorded spread. `Play` rows exist for 30,969 of 31,000 final games, so play-based tags are available almost everywhere. `PlayerAvailability` only covers 40 games (mostly the current slate), so `STAR_OUT` will be rare until more history accumulates. Season minutes for "top 3 players" are summed from `PlayerGameStat.minutes` over the team's earlier games that season (`PlayerSeasonStat` only stores minutes inside a JSON blob). A search of play descriptions found one injury mention in the whole table, so in-game injury detection is not feasible from this data and stays out of scope.
- **Tag thresholds are guesses.** They are centralized constants and covered by unit tests, so tuning is cheap, but the first release may look noisy or sparse until adjusted against real data.
- **Label thresholds vs. line quality**: a 2-point band around zero treats half-point line differences as meaningful only at the margin; this is intentional (the label is a coarse summary and the number is always shown next to it).
- **Backfill**: running the script against existing `FINAL` games backfills the whole season in one pass; runtime is bounded by about 1,200 games per season.
