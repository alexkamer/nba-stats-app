# Design

## Context

See proposal.md - Why. Today, both `BestBetsStrip` (`src/app/betting/page.tsx:406-454`) and the accuracy aggregation (`src/app/api/betting/accuracy/route.ts:87-103`) independently flatMap every bettable `PlayerPropProjection` row for a day, sort by `edgeRatio = |projectedValue - line| / stdev` descending, and slice to `BEST_BETS_PER_DAY` (8, from `lib/projections/confidence.ts:24`). Neither implementation is aware that multiple `PropStatType` rows for the same player on the same day (e.g. `POINTS` and `POINTS_REBOUNDS`) are correlated outcomes, and neither limits how many of the day's slots one player can occupy.

## Goals / Non-Goals

**Goals:**
- One shared function that both call sites use for selecting a day's Best Bets, so they cannot drift apart again.
- Deduplicate strictly by `playerId`: a player contributes at most one prop to a given day's selection, keeping their highest-`edgeRatio` bettable prop.
- No backfill: if deduplication leaves fewer than 8 picks for a day, show fewer than 8.
- Recompute the historical "Best Bets" accuracy record end-to-end under the new rule.

**Non-Goals:**
- Diversifying across players on the same team/game ("one pick per game" or similar) — out of scope, not requested.
- Changing how edge ratio itself is computed, or introducing EV/odds-weighted ranking — out of scope.
- Explicit modeling of which stat-type pairs are correlated (e.g. POINTS vs POINTS_REBOUNDS) beyond the per-player cap — the per-player dedupe handles the reported problem without needing a correlation matrix.
- Changing `BEST_BETS_PER_DAY` itself (stays 8 as a target/ceiling, not a guarantee).

## Decisions

**Shared selection function, not shared endpoint.** Add a pure function (e.g. `selectBestBets(props: BettableProp[], limit: number): BettableProp[]`) in a new module under `lib/betting/`, taking the day's bettable props and returning the deduplicated, ranked, limit-capped selection. Both `BestBetsStrip` (client-side, already has the day's props in hand) and `/api/betting/accuracy` (server-side, bucketing many days) call it per day. Keeping it a plain function (not a new API route) avoids an extra network hop for the client strip, which already has the data it needs.

Alternative considered: move selection server-side only and have the client fetch pre-selected picks. Rejected — larger change to the data-fetching shape of the page than this proposal's scope, and the accuracy route already needs its own per-day loop over historical data, so a shared pure function serves both without restructuring either call site's data flow.

**Dedupe by keeping max-edge-ratio prop per player, applied after sort.** Sort all candidates by `edgeRatio` descending, then walk the sorted list keeping the first (highest-edge) prop seen for each `playerId` and dropping subsequent ones for the same player, then take the top `limit` of what remains. This is equivalent to "group by player, keep max edge ratio, re-sort, slice" but avoids a second sort pass.

**Ties at the per-player dedupe step.** If a player has two props with exactly equal edge ratio, keep whichever is encountered first in the stable sort (JS `Array.prototype.sort` is stable per spec); this is a rare floating-point coincidence, not worth special-casing.

**Historical record recomputation.** The accuracy route's existing per-day bucketing loop (`accuracy/route.ts:87-103`) is modified to call the shared function per day instead of its own inline sort/slice. Since this changes which rows count as "Best Bets" on every past graded day, the resulting `bestBetsAccuracy` hit rate and graded count will differ from what was previously displayed — this is intentional per the proposal's BREAKING note, not a bug to guard against.

## Risks / Trade-offs

- **The displayed historical record will visibly change (up or down) the moment this ships.** → Mitigation: none needed functionally, but worth a one-line release note or changelog entry so a returning user doesn't think the record was reset or corrupted.
- **Some nights will show fewer than 8 Best Bets, which is a new UI state.** → Mitigation: `BestBetsStrip` already needs to render whatever length array it gets; confirm it degrades gracefully (no hardcoded assumption of exactly 8 items) as part of implementation.
- **Per-player dedupe doesn't catch correlation across different players on the same team/game** (e.g. two teammates in the same blowout). → Accepted as a Non-Goal; the reported problem is specifically the same-player case.
