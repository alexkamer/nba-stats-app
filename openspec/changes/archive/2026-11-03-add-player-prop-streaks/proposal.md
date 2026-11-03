# Proposal

## Why

The Cover Story page already surfaces team-level betting trends (ATS/O-U streaks, prop hit-rate by stat type) but nothing at the player level. Bettors leaning on an Over player prop want to know whether the player is actually "hot" — on a run of games clearing a notable stat floor — before taking that side. Only Over picks carry this signal (a streak of clearing a floor supports betting the Over; it says nothing useful about an Under).

## What Changes

- Compute, for players with a live `OVER` player-prop pick on the next date that has any posted, whether they are on a notable streak against a fixed stat floor (10+ PTS, 6+ REB, 2+ AST) — either a 3+ consecutive game streak or a ≥90% hit rate over their last 10 games.
- Scope to the three single-count stat types with a natural fixed floor (`POINTS`, `REBOUNDS`, `ASSISTS`); combo and double/triple-double `PropStatType` values are out of scope for this change since no fixed floor was specified for them.
- Date selection: use today if any `OVER` prop exists for a scheduled/live game today; otherwise use the nearest upcoming date (today or later) that has at least one `OVER` prop posted, so the section isn't empty on a day with no games. If no upcoming `OVER` props exist at all, the section shows an explicit no-data state.
- Add a new "Player streaks" `SectionCard` to the Cover Story page (`src/app/betting/history/page.tsx`), rendered the same way as `TeamCoverRecordsSection`, listing qualifying players with their stat, floor, and streak-length or hit-rate.
- Add a new API route (e.g. `src/app/api/betting/history/player-streaks`) backing the section.

## Capabilities

### New Capabilities
- `player-prop-streak-tracking`: Computing, for a given date's `OVER` player-prop picks, which players are on a notable streak or high hit-rate against a fixed stat floor for `POINTS`, `REBOUNDS`, and `ASSISTS`.

### Modified Capabilities
- `betting-history-page`: Adds a "Player streaks" section to the Cover Story page, sourced from `player-prop-streak-tracking`.

## Impact

- **New read-only computation**: derives from existing `PlayerPropOdds` (side = `OVER`), `PlayerGameStat` (recent game log per player/stat), and `Game` (to find the relevant date) — no new schema/tables needed, this is a query, not a tracked/persisted record like the other Cover Story sections.
- **New API route** under `src/app/api/betting/history/player-streaks`.
- **Page change**: `src/app/betting/history/page.tsx` gains a `PlayerStreaksSection` component and `SectionCard`.
