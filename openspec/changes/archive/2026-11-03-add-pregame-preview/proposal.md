# Proposal

## Why

The game detail page (`/games/[eventId]`) renders the same tab set regardless of game status. For a scheduled game that hasn't tipped off, the gamecast, box score, play-by-play, team stats, and recap tabs have nothing to show and fall back to "not available yet" placeholder text or blank widgets. Meanwhile the app already computes projections, win probability, and player-availability status for scheduled games (for the `/betting` page), fetches a pregame preview article from the same ESPN call this page makes (already parsed for its post-game counterpart, the recap), and tracks player prop leans — none of it surfaces here. A visitor checking a game before tip-off gets a mostly-empty page instead of a useful preview.

## What Changes

- Replace the gamecast/recap/box score/play-by-play/team stats tab set with three tabs, shown only while a game's status is scheduled (not yet started), with Gamecast selected by default:
  - **Gamecast**: the same 3-column dashboard layout the live Gamecast tab uses, with pregame-appropriate cards in place of the live-only ones that have no data yet — a betting projection card (projected score/margin, win probability per team, both derived from the system's own `GameProjection`), a separate ESPN Predictor card (ESPN's own win-probability model, shown in its own container rather than merged into the projection card, since the two are independent models that can disagree), a starting lineups panel per team (depth-chart-based top five, labeled as projected — ESPN's summary data carries no confirmed-starters field pre-tipoff), an injury/availability panel per team (every rostered player's frozen pre-game `PlayerAvailability` status), the existing matchups (head-to-head/season series) card, and the existing venue/broadcast game-info card.
  - **Preview**: ESPN's own pregame preview article for this game (its `article.type: "Preview"`, the pregame counterpart to the post-game recap the Recap tab already shows), rendered the same way the Recap tab renders a finished game's recap.
  - **Odds**: the market odds table (spread/total/moneyline, already shown elsewhere on this page for live/final games) plus this game's player prop leans (reusing the betting-projections player-prop logic — projected value vs. line, over/under lean — scoped to this one game instead of the full day's slate).
- **BREAKING**: While a game is scheduled, the gamecast/recap/box score/play-by-play/team stats tabs from the live/final tab set are replaced by the three tabs above; they reappear once the game status moves to in-progress or final.

## Capabilities

### New Capabilities
- `game-pregame-preview`: The scheduled-game tab set on the game detail page (Gamecast, Preview, Odds) — its projection/lineups/availability dashboard, its pregame preview article, its odds-and-props view, and the tab-visibility rule that shows this set (replacing the live/final tabs) only while a game is scheduled.

### Modified Capabilities
(none — the existing `game-recap`, `game-team-stats`, `betting-projections`, and `player-availability-tracking` capabilities are reused as-is, not changed)

## Impact

- `src/app/games/[eventId]/page.tsx`: tab-bar visibility logic keyed off game status; a pregame Gamecast dashboard, a Preview article tab, and an Odds-and-props tab.
- `src/lib/espn-live.ts`: a pregame preview article extractor alongside the existing recap extractor (same underlying `article` field, filtered on `type: "Preview"` instead of `type: "Recap"`) — no new ESPN call.
- New server-side use of `getTeamDepthChart` (existing `src/lib/espn-team-depth-chart.ts`) as the sole lineup source (adds 2 ESPN calls per page load, only for still-scheduled games) — the ESPN summary response was verified to carry no starters/roster field pre-tipoff, so there is nothing to parse for a "confirmed" variant.
- New Prisma reads scoped to a single game: `GameProjection`, `PlayerAvailability` joined with player names, and `PlayerPropProjection`/`PlayerPropOdds` joined with player names — the same query shapes `api/betting/upcoming/route.ts` already uses, applied per-game instead of across the upcoming slate. Win probability is derived from `GameProjection`'s own margin/stdev (see design.md), not read from `PredictorSnapshot`.
- No schema changes and no new ingest jobs; all underlying data is already populated by existing ingest scripts for every scheduled game.
