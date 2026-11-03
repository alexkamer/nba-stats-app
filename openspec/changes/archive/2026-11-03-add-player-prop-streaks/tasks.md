# Tasks

## 1. Streak query logic

- [x] 1.1 Add a `lib/betting/player-prop-streaks.ts` (or similar) module with the fixed floor map (`POINTS: 10`, `REBOUNDS: 6`, `ASSISTS: 2`) and a function that resolves the relevant date (today, else nearest upcoming date with an eligible `OVER` prop) and returns the list of qualifying player/stat entries with streak length and last-10 hit rate; verify with a unit test covering: a player clearing the floor 3+ straight games, a player at ≥90% hit rate with a broken current streak, a player below both thresholds (excluded), and no eligible date found (empty result).
- [x] 1.2 Verify `PropSide.UNDER` props and non-eligible `PropStatType` values (combo/double-double/triple-double) are never evaluated, via a unit test asserting they're excluded from the eligible pool.

## 2. API route

- [x] 2.1 Add `GET /api/betting/history/player-streaks` in `src/app/api/betting/history/player-streaks/route.ts`, calling the module from 1.1 and returning the resolved date plus qualifying entries (player, stat type, floor, streak length, hit rate); verify by curling the route locally and confirming the shape matches what section 3 consumes.

## 3. Cover Story page section

- [x] 3.1 Add a `PlayerStreaksSection` component to `src/app/betting/history/page.tsx` (same `useQuery` + loading/error/empty pattern as `TeamCoverRecordsSection`), wrapped in a new `SectionCard title="Player streaks"`, rendering each qualifying player with headshot, stat, floor, streak length, and hit rate; verify by loading `/betting/history` locally with seeded data that has at least one qualifying player and confirming the section renders.
- [x] 3.2 Verify the no-data state (no qualifying streaks, or no upcoming eligible date at all) shows an explicit message rather than an empty or broken section, matching the page's existing no-data convention.

## Workflow follow-up

- Archive this change once the above is implemented and verified.
