# Proposal

## Why

The app has a forward-looking betting page (`betting-insights-page`) for upcoming picks, but nothing retrospective: there's no view of how teams have actually performed against the spread/total this season, who's had the best individual games day by day, or other historical betting-adjacent context. This leaves season-long betting trends and daily highlights undiscoverable even though the underlying game, odds, and box-score data already exists.

## What Changes

- Add a new page, **Cover Story**, presenting historical betting and daily-highlight context for the current regular season:
  - Team ATS (against-the-spread) record: overall, home/away splits, current streak, push count.
  - Team over/under record: overall, home/away splits, current streak, push count.
  - "King of the Court" calendar: the player with the most combined points+rebounds+assists each day, with triple-doubles flagged, plus a season tally of most days led.
  - Active players' birthdays for the current day.
  - Player prop pick hit-rate broken down by stat type (points, rebounds, assists, etc.), season-to-date.
- Add a new ingest step that computes and persists, per team per season: ATS win/loss/push counts (overall and home/away) and current streak, and over/under win/loss/push counts (overall and home/away) and current streak, derived from `Odds` (the line in effect pre-tip-off) and each game's final score. Runs as part of the existing sync pipeline once games go final.
- Add a new ingest step that computes and persists, per calendar date, the player with the highest points+rebounds+assists total across that day's games, and whether any player recorded a triple-double that day.
- Extend the prediction-accuracy aggregate to also expose player-prop hit rate broken down by `PropStatType`, not just as a single aggregate.
- Add a nav entry for the new page.

## Capabilities

### New Capabilities
- `betting-history-page`: the Cover Story page itself — section layout, navigation entry, no-data fallback, and the player-birthday-of-the-day display (a direct read against `Player`, with no backing tracking capability of its own).
- `team-cover-record-tracking`: computes and maintains each team's season ATS and over/under records (overall, home/away, streaks, pushes) from odds and final scores.
- `daily-stat-leader-tracking`: computes and maintains, per calendar date, the player with the day's highest points+rebounds+assists total and whether a triple-double occurred that day.

### Modified Capabilities
- `prediction-accuracy-tracking`: the "Running accuracy record" requirement gains a breakdown by `PropStatType` for player-prop picks, in addition to the existing single aggregate.

## Impact

- **Schema**: new Prisma model(s) for team ATS/O-U season aggregates (or new fields on `TeamSeasonStat`) and a new `DailyStatLeader`-style model; a migration.
- **Ingest**: a new script (parallel to `ingest/generate-projections.ts`) wired into `ingest/run-all-sync.ts`.
- **API**: new route(s) under `src/app/api/betting/history/...` (or similar) to serve team records, the daily-leader calendar, today's birthdays, and the prop hit-rate breakdown.
- **UI**: a new page under `src/app/betting/history/` (or a sibling top-level route), plus a nav entry in `src/components/Sidebar.tsx` / `SiteNav.tsx`.
- **Existing code**: `lib/accuracy/` gains a stat-type-aware aggregation path; no change to existing grading logic.
