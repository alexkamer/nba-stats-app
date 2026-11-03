# Design

## Context

`/games/[eventId]` (`src/app/api/games/[eventId]/route.ts`) serves finished games from Prisma (`status: "FINAL"`) and everything else — scheduled or in-progress — via `getLiveGameDetail`/`getGameSummaryExtras` in `src/lib/espn-live.ts`, both built on a single ESPN summary fetch (`site.api.espn.com/.../summary?event={eventId}`). That summary payload is typed narrowly today (`header`, `gameInfo`, `broadcasts`, `seasonseries`, `winprobability`, `plays`, `article`, `boxscore`, `pickcenter`). Verified directly against live ESPN responses for a scheduled game (both at kickoff -3h and 15 minutes past its scheduled tip, still `STATUS_SCHEDULED`): the full top-level key set is `boxscore, format, gameInfo, lastFiveGames, leaders, seasonseries, injuries, broadcasts, pickcenter, odds, againstTheSpread, predictor, winprobability, ticketsInfo, news, header, article, videos, wallclockAvailable, meta, standings` — there is no `rosters` field and no `$ref` link to any roster/lineup resource, and `boxscore.players` is simply absent pre-tipoff. ESPN's public summary endpoint has no starters source for a scheduled game, full stop; an earlier draft of this design assumed otherwise without checking live data.

Separately, `api/betting/upcoming/route.ts` already reads `GameProjection`, `PlayerAvailability`, odds, and `PlayerPropProjection`/`PlayerPropOdds` via Prisma for the full scheduled slate — this change reuses those same query shapes, scoped to one `gameId`, rather than inventing a new data path. `PlayerAvailability` (see `player-availability-tracking` spec) is populated for every scheduled game's full roster regardless of betting props, so it's a valid, already-correct source for the injury panel without a live ESPN injury call.

An earlier version of this change also read `PredictorSnapshot` (ESPN's own frozen "Matchup Predictor" win%) for the projection card's win probability, paired next to `GameProjection`'s own projected score. Found in testing against a real game: the two can visibly disagree in direction, because they're independent models captured at different times — `PredictorSnapshot` is a one-time snapshot frozen at capture (by design, for grading consistency) and can be days stale by the time a user looks at it, while `GameProjection` is computed fresh. For game 401909907, the frozen snapshot favored the away team to win while the fresh score projection favored the home team by 7 points - a real, visible contradiction, not a display bug. Fixed by deriving win% from `GameProjection`'s own `projectedMargin`/`marginStdev` instead (see Decisions) so the score and the win% can never disagree.

The `article` field in the same ESPN summary payload already powers the Recap tab's `extractRecap` (`src/lib/espn-live.ts`), which only accepts `article.type === "Recap"`. Live-verified: a scheduled game's `article` is `type: "Preview"` with the same shape (`headline`, `source`, `originallyPosted`, `story` as HTML) — the pregame counterpart to a recap, already present in the one summary fetch this page makes, just filtered out by the existing extractor's type check.

See proposal.md - Why / What Changes for motivation and scope.

## Goals / Non-Goals

**Goals:**
- Reuse the existing betting-projection, player-availability, and player-prop Prisma query shapes for a single game instead of duplicating logic.
- Source starting lineups from the team depth chart (the only lineup data actually available pre-tipoff), clearly labeled as projected.
- Reuse the existing article-extraction pattern (`extractRecap`) for the pregame preview article rather than writing a parallel implementation.
- Keep the live/final code paths (gamecast, recap, box score, play-by-play, team stats) completely unaffected — this change's tabs are additive and only active while scheduled.

**Non-Goals:**
- Not building or integrating a confirmed-starters data source; none exists in ESPN's public summary response for a scheduled game (verified above), so this change does not attempt to find or add one.
- Not building a new injury-detail data source (richer fields like injury type or estimated return date); the panel only surfaces the status/comment already captured by `PlayerAvailability`.
- Not changing how `GameProjection`/`PlayerAvailability`/`PlayerPropProjection` are computed or ingested.
- Not redesigning the betting projection methodology or its presentation on `/betting` itself.

## Decisions

**Win probability is derived from `GameProjection`'s own margin, not read from `PredictorSnapshot`.** `marginToWinPct` (new, in `lib/projections/confidence.ts`) converts `projectedMargin`/`marginStdev` into a home win probability via the standard normal CDF; away win% is `100 - homeWinPct`. Both numbers on the projection card now come from one model computed at one time, so they can never disagree in direction (see Context for why the predictor-based version did). Alternative considered: keep `PredictorSnapshot` but relabel/attribute it separately from the score — rejected as a weaker fix that leaves the contradiction visible instead of removing it, and the needed inputs (`projectedMargin`, `marginStdev`) already exist on `GameProjection` with no new query required.

**Lineups come from the team depth chart, always, not a fallback.** Call `getTeamDepthChart` for both teams, in parallel, whenever a game is scheduled, and show the resulting top five per team labeled as projected starters. There is no "confirmed" branch to fall back from, since no confirmed-starters data exists pre-tipoff (see Context). Alternative considered: a dedicated ESPN roster/lineup endpoint — rejected after live verification found none exists in the public API surface this app uses.

**One new server-side aggregation for the Preview payload, gated on scheduled status.** In the `/api/games/[eventId]` route, when the resolved status is scheduled, run the projection/predictor/availability queries (as before) plus one more for `PlayerPropProjection`/`PlayerPropOdds` joined to `player.displayName` and the pregame preview article extraction, and attach the result under a `preview` key on the response. For in-progress/final games this work is skipped entirely — no behavior change to existing tabs. Alternative considered: a separate `/api/games/[eventId]/preview` endpoint — rejected to avoid a second round trip and duplicated status/eventId resolution; the existing route already branches on status for its DB-vs-live split, so adding one more conditional block is simpler than a new route.

**The pregame preview article reuses `extractRecap`'s pattern as a sibling function, not a parameterized variant.** `extractPreviewArticle` in `espn-live.ts` mirrors `extractRecap` exactly except for the `type` check (`"Preview"` instead of `"Recap"`) and the returned field name — kept as two small functions rather than one parameterized one, since `RecapTab`/`ArticleTab` on the frontend already needs a human-readable "no X available" message distinct per tab, and conflating the two ESPN article types into one knob would obscure that each is only ever the right one for its own tab, never interchangeable.

**Tab visibility is a pure function of game status, computed client-side in `page.tsx`.** The tab set is swapped to `[gamecast, preview, odds]` when scheduled and to the existing `[gamecast, recap, boxscore, playbyplay, teamstats]` set otherwise; the `gamecast` and `preview` tab keys are reused across both sets but render different content depending on whether the game is scheduled (the pregame dashboard / preview article) or not (the live dashboard / post-game recap) — `odds` is a new tab key that only appears in the scheduled set, since live/final games already surface odds inline on the Box Score tab and this change doesn't touch that. No new status-transition handling is needed since the page already re-fetches/polls status for live games.

## Risks / Trade-offs

- [Depth chart may not reflect tonight's actual starters (injuries, matchup-based coaching decisions, recent rotation changes) since it's not game-specific] → Explicit "Projected" label on every lineup entry sets that expectation; the spec requirement is written around depth-chart data as the only source, not as a stand-in for a real confirmed lineup.
- [Depth-chart calls add 2 ESPN calls per scheduled-game page load] → Calls are parallelized; existing `fetchEspnJson` caching (already used by `getTeamDepthChart` elsewhere) applies here too.
- [`PlayerAvailability` rows depend on the periodic ingest job having run for this game] → Same staleness window the betting page already accepts; no new risk introduced by reusing it here.

## Migration Plan

Purely additive: new parsing/types, one new conditional query path gated on scheduled status, and client-side tab filtering. No schema or ingest changes, no data migration. Rollback is a revert of the `page.tsx`/route changes with no persisted-state cleanup required.
