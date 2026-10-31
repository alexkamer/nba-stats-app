# Proposal

## Why

Bettor's Heaven (`betting-insights-page`) surfaces today's recommended picks, but gives no way to inspect *why* a player prop looks the way it does — a bettor has to take the lean on faith. A dedicated research view, in the spirit of tools like LineMate, lets a bettor drill into a specific player's prop and see the game-by-game history behind it before deciding.

## What Changes

- Add a new page (reached from each player prop row on `/betting`) showing, for one player's tracked prop on today's slate: a chart of their recent game-by-game actual values for that stat, colored against today's market line, plus our own model's projected value for comparison.
- Show hit-rate summaries over last 5 / last 10 / last 20 / this season, and filters for all games / home / away / games against today's specific opponent.
- Scope strictly to players who have at least one live `PlayerPropOdds` line today — this is a drill-down on the existing picks pipeline, not a general player-stats browser (that already exists on the player detail page's Game Log tab).
- When the player has more than one tracked stat today (e.g. points and rebounds both have lines), let the page switch between them without navigating away.
- No new data ingestion: the page reads `PlayerGameStat` (history), `PlayerPropOdds` (today's line), and `PlayerPropProjection` (our lean), all already populated by the existing betting-insights sync job.

## Capabilities

### New Capabilities
- `player-prop-research-page`: The user-facing research page — per-player, per-stat game history chart, hit-rate summaries, and home/away/opponent filters, linked from each prop row on the betting page.

### Modified Capabilities
(none — this change only reads existing data; `betting-insights-page`, `betting-projections`, and `betting-odds-ingest` are unaffected)

## Impact

- **New page**: `src/app/betting/research/` (or similar), client-rendered, following the existing `/betting` page's query/fetch conventions.
- **New API route(s)** under `src/app/api/betting/` to serve one player's game history + today's line/projection for a given stat, joined with opponent/home-away context.
- **Betting page** (`src/app/betting/page.tsx`): add a research link/icon on each player prop cell/row.
- **Charts**: follows the existing hand-rolled SVG chart convention already used on the game detail page (`GameFlowChart`, `ProbabilityChart`) rather than introducing a new charting dependency.
- No schema or ingest changes.
