# Design

## Context

See proposal.md for motivation. Relevant current state:

- `PlayerGameStat` holds one row per (game, player) with raw box-score numbers (points, rebounds, assists, etc.) going back to the 2003 season — already normalized, no ESPN round-trip needed to render history.
- `PlayerPropOdds` holds one row per (game, player, statType, side) for scheduled games only, with `line`/`odds`/`openLine`/`openOdds`. No historical line snapshots exist for past games (confirmed non-goal in `add-betting-insights-page`'s design), so "hit rate" for any past game can only ever be computed against *today's* line, not whatever the line was on that past night — this matches how LineMate itself presents the same kind of chart.
- `PlayerPropProjection` holds our own frozen projected value per (game, player, statType), linked 1:1 to a `PlayerPropOdds` row via `propOddsId`.
- `Game` carries `homeTeamId`/`awayTeamId`, enough to derive home/away and opponent-identity for any historical game a player appears in.
- The betting page (`src/app/betting/page.tsx`) already fetches `/api/betting/upcoming`, which assembles `UpcomingGame[]` with `playerProps: PlayerPropLean[]` per game — i.e., it already knows, for today, which (player, stat) pairs have a live line. The research page's link only needs `playerId` + `statType`; it does not need a new "does this player have a prop today" check of its own, since only props already rendered on the betting page link to it.
- Charts on this app are hand-rolled SVG (`GameFlowChart`, `ProbabilityChart` in `src/app/games/[eventId]/page.tsx`), not a charting library — this change follows that precedent rather than adding `recharts`/`visx`.

## Goals / Non-Goals

**Goals:**
- Serve one player's full relevant game history (points-in-time stat value, opponent, home/away) for a given stat, scoped to games where that stat was actually recorded.
- Compute hit-rate windows (L5/L10/L20/season) and home/away/opponent filters server-side (or in a thin API layer), so the client renders pre-shaped data rather than reimplementing the split logic the betting page's confidence math already touches.
- Reuse the existing `/api/betting/upcoming` response shape's player/stat identifiers so the research link needs no new lookup.

**Non-Goals:**
- No new ingestion, schema, or historical odds backfill — this change only reads existing tables.
- No support for players without a live prop today (see proposal's scope decision) — the route simply isn't linked to from anywhere else for such players, and directly visiting it with an unlisted player/stat shows the "no research available" state from the spec, not a 404.
- No cross-season weighting or possession/pace adjustments to the raw history — the chart shows actual recorded values as-is; any smarter weighting is what `PlayerPropProjection` already does upstream.

## Decisions

### New read-only API route: `/api/betting/research/[playerId]`
Returns, for a given `playerId` and `statType` query param: the player's game history for that stat (value, date, opponent, home/away, result), today's current `PlayerPropOdds` line/odds for that stat (if the game is still scheduled), the linked `PlayerPropProjection` value (if any), and the list of other stat types this player has a live line for today (to populate the stat-switch control). Hit-rate windows and the opponent/home-away filter are computed in this route from `PlayerGameStat` + `Game`, not duplicated on the client.
- **Alternative considered**: extend `/api/betting/upcoming` to embed full history inline. Rejected — that endpoint already assembles every upcoming game's full slate; embedding every tracked player's full game-by-game history there would bloat a payload that currently stays small by design.

### Route shape: `/betting/research/[playerId]?stat=POINTS`
Player id in the path (stable identity), stat as a query param (switchable in place without a new navigation, matching the spec's "switch stats without leaving the page" requirement). `gameId`/date of "today's" game is resolved server-side from the player's own next scheduled game, not passed by the caller, since the betting page always links from a specific upcoming game already.

### Hit-rate math reuses the existing over/under/push convention
A historical game counts as "over" if the recorded stat value is strictly greater than today's current line, "under" if strictly less, "push" if equal — the same three-way convention `totalLean`/`formatLine` already use on the betting page, kept consistent rather than inventing a new one.

## Risks / Trade-offs

- **[Line-at-the-time vs. today's line]** Hit rates are necessarily computed against today's line applied retroactively, not the line that existed on each historical night (data doesn't exist for the latter). **Mitigation**: this is explicit in the spec and matches the established product precedent (LineMate); no UI text should imply otherwise.
- **[Thin history for new/injured-return players]** A player with few recorded games this season makes L10/L20/season windows nearly identical and the opponent filter frequently empty. **Mitigation**: spec requires an explicit smaller-sample indicator and an explicit empty state rather than a misleading chart.
- **[Stat availability mismatch]** `PlayerPropOdds`/`PlayerPropProjection` use `PropStatType` enum values (including combo stats like `POINTS_REBOUNDS_ASSISTS` and booleans like `DOUBLE_DOUBLE`) that don't map to a single `PlayerGameStat` column. **Mitigation**: the research API route must derive combo/boolean stat values the same way the existing projection/confidence code already does (sum or boolean-threshold over the relevant `PlayerGameStat` columns), not introduce a second derivation.

## Migration Plan

1. Add the new API route (`src/app/api/betting/research/[playerId]/route.ts`) — additive, no schema change.
2. Add the new page (`src/app/betting/research/[playerId]/page.tsx`) with the SVG chart, hit-rate chips, and filter controls.
3. Add the research link on each player prop cell in `src/app/betting/page.tsx`.
4. Rollback: both are new, isolated files plus one additive link on an existing page; removing them fully reverts behavior with no impact on existing pages or data.
