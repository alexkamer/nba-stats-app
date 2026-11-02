# Tasks

## 1. Schema

- [x] 1.1 Add `TeamCoverRecord` model (per `teamId`/`seasonId`: ATS and O/U win/loss/push counts overall + home + away, and current streak columns for each) and add `coverRecordComputedAt` to `Odds`; run `prisma migrate dev` and verify the migration applies cleanly against the dev database
- [x] 1.2 Add `DailyStatLeader` (unique `date`) and `DailyStatLeaderEntry` (`dailyStatLeaderId`, `playerId`, `pointsReboundsAssists`, `hadTripleDouble`) models; run `prisma migrate dev` and verify the migration applies cleanly

## 2. Team cover-record computation (team-cover-record-tracking)

- [x] 2.1 Implement `lib/accuracy/grade-cover.ts`: pure functions `gradeAtsCover(spread, homeScore, awayScore)` and `gradeOverUnder(overUnder, homeScore, awayScore)` returning covered/not-covered/push per side; cover with unit tests for cover, non-cover, and push cases (including the zero-margin-equals-line push boundary)
- [x] 2.2 Implement `ingest/compute-cover-records.ts`: finds games with `status: FINAL`, a non-null `Odds.spread`/`overUnder`, and `Odds.coverRecordComputedAt: null`; grades each via 2.1; updates both teams' `TeamCoverRecord` rows (overall + home/away counters, recomputing each team's current streak from its most recent graded games in chronological order); stamps `coverRecordComputedAt`. Verify by running `npx tsx ingest/compute-cover-records.ts` twice against seeded final games with recorded odds and confirming counts are correct after the first run and unchanged after the second (idempotent)
- [x] 2.3 Add `compute-cover-records.ts` to `SCRIPTS` in `ingest/run-all-sync.ts`, immediately after `grade-predictions.ts`; verify `npx tsx ingest/run-all-sync.ts` runs it in that position without error

## 3. Daily stat leader computation (daily-stat-leader-tracking)

- [x] 3.1 Implement `lib/projections/daily-leader.ts`: pure function `findDailyLeaders(playerGameRows)` summing points+rebounds+assists per player and returning all tied top players, plus `hasTripleDouble(playerGameRow)` checking double-digit totals in at least 3 of points/rebounds/assists/steals/blocks; cover with unit tests for a single leader, a tie, and triple-double true/false cases
- [x] 3.2 Implement `ingest/compute-daily-stat-leaders.ts`: finds calendar dates with one or more `Game` rows not yet in `DailyStatLeader`, where every `Game` on that date is `status: FINAL`; aggregates that date's `PlayerGameStat` rows via 3.1 and writes a `DailyStatLeader` + `DailyStatLeaderEntry` row(s). Verify by running `npx tsx ingest/compute-daily-stat-leaders.ts` twice against seeded final games spanning a tie day and confirming both tied players are recorded, and a second run makes no changes
- [x] 3.3 Add `compute-daily-stat-leaders.ts` to `SCRIPTS` in `ingest/run-all-sync.ts`, after `sync-aggregates.ts`; verify `npx tsx ingest/run-all-sync.ts` runs it in that position without error

## 4. Prop hit-rate by stat type (prediction-accuracy-tracking, modified)

- [x] 4.1 Extend `lib/accuracy/compute-accuracy.ts` with a function that groups already-graded `PlayerPropProjection` rows by `statType` and returns a hit rate per type, reusing the existing hit-rate reduction; add unit tests covering multiple stat types and a stat type with zero graded picks (must not divide by zero / must report `null`)
- [x] 4.2 Update `src/app/api/betting/accuracy/route.ts` to include the per-stat-type breakdown in its response; verify via a manual request against a dev server with seeded graded props that the response includes a breakdown entry per represented `PropStatType`

## 5. API routes for the history page

- [x] 5.1 Add `src/app/api/betting/history/team-cover-records/route.ts` returning every team's current-season `TeamCoverRecord` (ATS/O-U win-loss-push, home/away splits, streaks), joined with team display info; verify via manual request against seeded data
- [x] 5.2 Add `src/app/api/betting/history/daily-leaders/route.ts` returning the current season's `DailyStatLeader` rows (date, leader(s), triple-double flag) plus a season crown tally (count of leader days per player, computed via `GROUP BY playerId` over `DailyStatLeaderEntry`); verify via manual request against seeded data including a tie day
- [x] 5.3 Add `src/app/api/betting/history/birthdays/route.ts` returning active players (`Player.active: true`) whose `birthDate` month/day match the current date; verify via manual request with a seeded player whose birth month/day is forced to today

## 6. Cover Story page UI

- [x] 6.1 Add `src/app/betting/history/page.tsx` with the team ATS/O-U records section (table or card grid per team, overall + home/away + streak), fetching from 5.1; include an explicit no-data state when no records exist yet; verify by loading the page against seeded data and against an empty dev database
- [x] 6.2 Add the King of the Court calendar section to the same page, fetching from 5.2, rendering a day-by-day view for the current season with the leader(s) and triple-double flag, plus the season crown tally; include the no-games/no-leader state for a date with no games; verify against seeded data including a tie day and an unplayed future date
- [x] 6.3 Add the today's-birthdays section, fetching from 5.3, including the explicit no-birthdays-today state; verify against a seeded player with today's birth month/day and against a day with none
- [x] 6.4 Add the prop hit-rate-by-stat-type section, fetching the breakdown from the updated `/api/betting/accuracy` route (4.2); verify it renders one row per represented `PropStatType` against seeded graded props
- [x] 6.5 Add a nav entry ("Cover Story") to `src/components/Sidebar.tsx`'s `SECTIONS` and confirm it also appears in `SiteNav.tsx`'s mobile menu (which reads from the same `SECTIONS` list); verify by checking the link renders and navigates to `/betting/history` on both desktop sidebar and mobile hamburger menu

## 7. Integration verification

- [ ] 7.1 Run `npx tsx ingest/run-all-sync.ts` end to end against the dev database and confirm `compute-cover-records.ts` and `compute-daily-stat-leaders.ts` both run without error in their wired positions, then load `/betting/history` and confirm all four sections render real data (or their no-data state) with no console/server errors

## 8. King of the Court day detail leaderboard

- [x] 8.1 Fix the calendar cell's player label to use a true last-name extraction (strip trailing suffixes like Jr./Sr./II/III/IV) instead of naively splitting on the last space; verify a player like "Jaren Jackson Jr." renders "Jackson", not "Jr."
- [x] 8.2 Add a visible legend for the 🔥 triple-double marker near the calendar (not just a hover title); verify it renders and the marker's meaning is visible without hovering
- [x] 8.3 Add `src/app/api/betting/history/daily-leaderboard/route.ts` (`date` query param) returning every player's points+rebounds+assists total and triple-double flag for that date's games, ranked highest to lowest, computed live from `PlayerGameStat` (no new storage — mirrors the birthdays route's live-query pattern); verify via manual request against a seeded date with multiple players
- [ ] 8.4 Add `src/app/betting/history/king-of-the-court/[date]/page.tsx` rendering the full ranked leaderboard for that date from 8.3, with a no-games/no-data state; verify by loading it for a date with games and a date with none
- [ ] 8.5 Make each calendar day cell with a recorded leader a link to `/betting/history/king-of-the-court/[date]`; verify clicking a day navigates to its leaderboard

## 9. Today strip

- [x] 9.1 Add a `TodayStrip` component above the page's sections that derives highlight chips from already-fetched data (no new API routes): the most recent King of the Court day's leader(s), the team with the longest current |ATS or O/U streak| above a notability threshold, today's birthdays, and any triple-double from the most recent King of the Court day; each chip omitted when its underlying data has nothing noteworthy; verify it renders the expected chips against seeded data and renders nothing when no section has anything noteworthy

## 10. On this day

- [x] 10.1 Add `src/app/api/betting/history/on-this-day/route.ts`: a raw SQLite query (`strftime('%m-%d', ...)`) over `PlayerGameStat`/`Game`, excluding the current year, ranking by points+rebounds+assists, limited to the top 5, with team/opponent info and triple-double flag (reusing `hasTripleDouble`); verify against real historical data for today's calendar date
- [x] 10.2 Add an `OnThisDaySection` to the Cover Story page rendering those top performances with a no-data state, and surface the top result as a chip in the `TodayStrip` (reusing the same query, no extra request); verify against real data
