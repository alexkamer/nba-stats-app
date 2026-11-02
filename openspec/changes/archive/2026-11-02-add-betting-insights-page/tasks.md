# Tasks

## 1. Schema

- [x] 1.1 Extend `Odds` (prisma/schema.prisma) with nullable `openSpread`, `openOverUnder`, `openHomeMoneyline`, `openAwayMoneyline` columns; add `PlayerPropOdds` (gameId, playerId, statType, side [over/under], line, odds, openLine, openOdds, provider, lastUpdated, unique on gameId+playerId+statType+side), `PredictorSnapshot` (gameId unique, homeProjection, awayProjection, homeWinProb, awayWinProb, capturedAt), `GameProjection` (gameId unique, projectedHomeScore, projectedAwayScore, projectedMargin, method, createdAt, plus nullable gradedCorrect/gradedMarginError/gradedAt), `PlayerPropProjection` (gameId, playerId, statType, projectedValue, method, createdAt, plus nullable gradedCorrect/gradedActualValue/gradedAt, unique on gameId+playerId+statType). Verify with `npx prisma migrate dev --name add_betting_projection_tables` applying cleanly and `npx prisma generate` succeeding.

## 2. ESPN client additions

- [x] 2.1 Add `gameOdds(eventId)` and `gamePropBets(eventId, providerId, page)` builders to `lib/espn/endpoints.ts` targeting the core API's `.../events/{id}/competitions/{id}/odds` and `.../odds/{providerId}/propBets` resources (confirmed shape: open/current spread/overUnder/moneyline, and paginated athlete-linked prop entries). Verify with `npx tsc --noEmit` and a manual `fetchEspnJson` call against a live scheduled game id matching the expected shape.
- [x] 2.2 Define the prop-type allowlist (the stat types the page will surface: points, rebounds, assists, 3PM, steals, blocks, the point/rebound/assist combos, double-double, triple-double) as a shared constant, e.g. `lib/espn/prop-types.ts`, mapping ESPN's `type.name` strings to an internal `statType` enum. Verify with a unit test asserting each allowlisted ESPN name maps to the expected internal type and an unlisted name maps to `null`.

## 3. Odds/props/predictor ingest

- [x] 3.1 Update `ingest/mappers/odds.ts` to map the core API odds resource (open + current spread/overUnder/moneyline) instead of `summary`'s `pickcenter`, preserving the existing `favoriteTeamId` derivation. Add `ingest/__fixtures__/core-odds.json` and `ingest/mappers/odds.test.ts` verifying open and current values map correctly, including the case where a field is missing.
- [x] 3.2 Add `ingest/mappers/player-props.ts` mapping a page of `propBets` items (filtered through the 2.2 allowlist) into `PlayerPropOdds` upsert inputs, one row per side. Add `ingest/__fixtures__/prop-bets.json` and `ingest/mappers/player-props.test.ts` verifying filtering (disallowed types dropped) and over/under side mapping.
- [x] 3.3 Add `ingest/mappers/predictor.ts` mapping `summary`'s `predictor` field into a `PredictorSnapshot` upsert input. Add a fixture and `ingest/mappers/predictor.test.ts` verifying the mapping and the case where `predictor` is absent (returns `null`).
- [x] 3.3b Discovered during implementation: `ingest/mappers/game.ts`'s `isIngestableFinalGame`/`mapGame` only ever upsert completed games, so `Game.status` is never `SCHEDULED` today — nothing for betting-odds-ingest to attach to. Extend them to also upsert not-yet-completed scoreboard events with `status: "SCHEDULED"` (period/scores/venue null as applicable), relying on the existing upsert-by-`espnId` pattern so the completed-games sync naturally flips a row to `FINAL` once it finishes. Verify with a unit test covering a scheduled event (upserts with `status: "SCHEDULED"`) and a completed one (unchanged behavior, `status: "FINAL"`).
- [x] 3.4 Add `ingest/sync-betting-odds.ts`: for games with `status = SCHEDULED` (or not yet final), fetch and upsert `Odds` (open/current) and paginate+upsert `PlayerPropOdds` via 3.1/3.2; fetch and insert `PredictorSnapshot` only when one doesn't already exist for that game (3.3). Follow the self-healing/idempotent pattern used by `ingest/sync-completed-games.ts`. Verify by running `npx tsx ingest/sync-betting-odds.ts` against today's scheduled games and confirming rows appear, then re-running and confirming no duplicate rows (unique constraints hold, predictor snapshot untouched).
- [x] 3.5 Add `sync-betting-odds.ts` to the `SCRIPTS` list in `ingest/run-all-sync.ts`, ordered before the projection-generation step added in Section 4. Verify by running `npx tsx ingest/run-all-sync.ts` end-to-end without errors.

## 4. Projection engine

- [x] 4.1 Add `lib/projections/game-projection.ts`: a pure function computing a projected margin/winner for a game from both teams' `TeamSeasonStat` and recent `TeamGameStat` rows (recency-weighted blend), including a home/away split derived by filtering each team's `TeamGameStat`/`Game` rows by home vs. away, and returning `null` when either team lacks qualifying history. Add unit tests covering: a clear favorite case, a near-even case, and the insufficient-data case.
- [x] 4.2 Add `lib/projections/player-prop-projection.ts`: a pure function computing a projected value for a player's tracked stat from `PlayerSeasonStat` and recent `PlayerGameStat` rows (recency-weighted blend, adjusted for recent minutes trend), returning `null` when the player lacks qualifying history. Add unit tests covering a normal case and the insufficient-data case.
- [x] 4.3 Add `ingest/generate-projections.ts`: for each scheduled game without a `GameProjection`, compute and freeze one via 4.1 (tagging `method`); for each `PlayerPropOdds` row without a matching `PlayerPropProjection`, compute and freeze one via 4.2. Skip (not fabricate) when the underlying function returns `null`. Verify by running it against dev data and confirming projections are created only where both inputs exist, and that re-running does not recompute/overwrite already-frozen rows.
- [x] 4.4 Add `generate-projections.ts` to `ingest/run-all-sync.ts` after `sync-betting-odds.ts`. Verify the full sync run still completes without errors.

## 5. Accuracy grading

- [x] 5.1 Add `lib/accuracy/grade-game.ts` and `lib/accuracy/grade-prop.ts`: pure functions comparing a frozen `GameProjection`/`PredictorSnapshot` and `PlayerPropProjection` against a game's final result, returning correctness and error magnitude. Add unit tests covering a correct pick, an incorrect pick, and a push/tie case.
- [x] 5.2 Add `ingest/grade-predictions.ts`: for games that just became `FINAL`, grade any ungraded `GameProjection`, `PredictorSnapshot`, and `PlayerPropProjection` rows via 5.1 and persist the graded columns; leave projections for non-final games untouched. Wire it into `ingest/run-all-sync.ts` to run after `sync-completed-games.ts` and `sync-aggregates.ts` (so final box scores/player stats are already ingested). Verify with a test using a synthetic finished game plus known projection rows, asserting the expected graded values are written and an in-progress game's rows are left ungraded.
- [x] 5.3 Add `lib/accuracy/compute-accuracy.ts`: aggregates graded rows into a per-source (our model, ESPN predictor) hit rate over a given window (e.g. season-to-date). Add a unit test with a small synthetic set of graded rows asserting the computed hit rates, and an empty-input case returning a defined "no data" result rather than dividing by zero.: aggregates graded rows into a per-source (our model, ESPN predictor) hit rate over a given window (e.g. season-to-date). Add a unit test with a small synthetic set of graded rows asserting the computed hit rates, and an empty-input case returning a defined "no data" result rather than dividing by zero.

## 6. API routes

- [x] 6.1 Add `src/app/api/betting/upcoming/route.ts` returning scheduled games with their `GameProjection`, market `Odds`, `PredictorSnapshot`, and top `PlayerPropProjection`s. Verify by hitting the route against the dev server and checking the response shape, plus the case with zero qualifying games returning an empty list (not an error).
- [x] 6.2 Add `src/app/api/betting/accuracy/route.ts` returning the 5.3 accuracy summary per source. Verify similarly, including the no-graded-data case.

## 7. Page and navigation

- [x] 7.1 Add `src/app/betting/page.tsx`: lists upcoming games with our pick vs. the market line, ESPN's predictor shown as a separate reference, player prop leans, and the accuracy scoreboard, with an explicit empty state when there's nothing to show. Verify by running `npm run dev`, visiting `/betting`, and confirming it renders without console errors against both real current data and (by temporarily clearing relevant tables or mocking the fetch) the empty state.
- [x] 7.2 Add a "Betting" link to the nav in `src/app/layout.tsx` pointing at `/betting`. Verify the link appears in the header and navigates correctly.
- [x] 7.3 Run `npm run lint` and `npx tsc --noEmit` across the full change and fix any reported issues.

## Workflow follow-up

- Archive the change after review once it's running in practice against live scheduled games.
- After a few days of real data, check the accuracy scoreboard renders sensibly with genuinely graded games (not just the empty state).
