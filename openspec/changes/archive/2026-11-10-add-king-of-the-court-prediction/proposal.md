# Proposal

## Why

The app already predicts game winners/margins and individual player-prop stat lines before tip-off, but it has no pregame prediction for which player will put up the day's single highest combined points+rebounds+assists total across every game — a popular, harder-to-call bet type. (The existing "King of the Court" code in `lib/projections/daily-leader.ts` is the opposite direction: a *retrospective* tally of who actually led, computed only after all of a date's games go final, for the Briefing page's Top Performers section. This change adds the missing forward-looking counterpart.)

## What Changes

- Add a new pregame prediction: for each calendar date, a ranked leaderboard of candidate players by projected combined points+rebounds+assists, covering every player on every team playing that day who isn't frozen OUT — not just players with a posted market PRA prop line, so the prediction isn't silently limited to Vegas's own star list.
- Reuse the existing player-prop projection methodology (`lib/projections/player-prop-projection.ts`'s recency/season blend, minutes trend, opponent factor, and teammate-OUT role bump) unmodified — this is a new candidate-selection and orchestration path over that engine, not new projection math.
- Freeze the leaderboard once per date, computed by the same recurring ingest pass as `GameProjection`/`PlayerPropProjection`, and never recompute it afterward — consistent with those projections' "frozen pre-game, no hindsight" convention, rather than introducing a live-updating "Current" variant (there's no market line here to track drift against).
- Grade the frozen top-ranked prediction(s) once the date's actual leader is known (via the existing `daily-stat-leader-tracking` capability's `DailyStatLeader`), and add it as a new source in the running accuracy record.
- Display the leaderboard on the `/betting` page.

## Capabilities

### New Capabilities
- `king-of-the-court-prediction`: Generates and freezes, once per calendar date, a ranked leaderboard of candidate players by projected combined points+rebounds+assists across that date's games, covering every available (non-OUT) rostered player on a team playing that day.

### Modified Capabilities
- `prediction-accuracy-tracking`: Add grading of the King of the Court prediction against the actual recorded daily leader (`daily-stat-leader-tracking`), and include it as its own source in the running accuracy record.
- `betting-insights-page`: Add a King of the Court leaderboard section to the `/betting` page.

## Impact

- New Prisma model(s) to persist the frozen per-date leaderboard (candidate players, projected PRA, rank) and its graded outcome.
- `ingest/generate-projections.ts` (or a sibling script run in the same `ingest/run-all-sync.ts` step): new orchestration that iterates today's rosters instead of posted prop odds, reusing `projectPlayerStat`, `computeOpponentFactors`, and `computeTeammateRoleAdjustment`.
- `ingest/grade-predictions.ts`: new grading step keyed off `DailyStatLeader` once a date's games are all final.
- `/betting` page and its API route: new leaderboard section.
- Accuracy API/route: new source in the aggregate hit-rate record.
