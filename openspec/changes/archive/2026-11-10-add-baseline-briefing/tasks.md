# Tasks

## 1. Data layer

- [x] 1.1 Add a `BriefingSummary` Prisma model (`date: String @unique`, `text: String`, `generatedAt: DateTime`) and run a migration; verify `npx prisma migrate dev` succeeds and the table appears in the generated client.
- [x] 1.2 Add a top-5-by-points-for-a-date query helper (e.g. `src/lib/briefing/top-scorers.ts`) over existing `PlayerGameStat`/`Game`, no new model; verify a unit test against a seeded date returns exactly the 5 highest-point rows ordered descending, ties broken deterministically.
- [x] 1.3 Add a "final games for a calendar date" query helper reused by both the yesterday's-scores section and the past-date slate-recap section; verify a unit test confirms it returns only `FINAL`-status games for the given local date.

## 2. Briefing data assembly route

- [x] 2.1 Add `GET /api/briefing?date=YYYY-MM-DD`, validating the date against the local-day convention and rejecting (404/400) any date later than today; verify a test confirms a future date is rejected and today's date (passed explicitly or omitted) resolves to the current local date.
- [x] 2.2 Implement today-vs-past section selection: for today, include headlines, injuries, standings, and tonight's schedule; for a past date, include only yesterday's-scores, top-performers, that-date's-own-slate, and Best Bets, omitting the current-moment sections entirely; verify a test asserts the omitted sections are absent (not empty) from a past date's response payload.
- [x] 2.3 Wire yesterday's-scores and top-performers sections (daily leader/triple-double + top-5-by-points from task 1.2) into the route for the date immediately before the viewed date; verify a test with a seeded "no games that day" date returns the documented no-data shape instead of an empty array.
- [x] 2.4 Wire the headlines, injury-report, and standings sections into the route for today only, reusing the existing news/`PlayerAvailability`/standings read paths; verify a test confirms these three keys are present when `date` resolves to today and absent otherwise.
- [x] 2.5 Wire tonight's-schedule (today) and that-date's-own-slate (past dates) sections, including system pick vs. market line where a `GameProjection` exists; verify a test for a date with no games returns the documented no-games message for that section.
- [x] 2.6 Wire the Best Bets section: embed the viewed date's Initial-view selection (reusing `best-bets-selection`'s existing selection function) and compute the prior date's graded record via the existing `prediction-accuracy-tracking` grading logic for the callback line; verify a test confirms the callback's record matches a manually-computed hit count for a seeded prior date.

## 3. Summary generation

- [x] 3.1 Add `ANTHROPIC_API_KEY` to local `.env` (never committed) and a server-only Anthropic SDK client wrapper that reads it from `process.env`; verify the wrapper throws a clear error if the key is unset, and that `git status`/`git diff` show no secret value added to any tracked file.
- [x] 3.2 Implement the lazy generation step inside the briefing route: if a date's games are final and no `BriefingSummary` row exists, assemble the computed digest facts (game count, scores, top performer, triple-double flag), call the Haiku-tier model once, and persist the result; verify a test that a second request for the same date does not trigger a second mocked model call.
- [x] 3.3 Handle generation failure/timeout by omitting the summary field from the response rather than erroring the whole route; verify a test with a mocked failing call still returns a 200 response with the rest of the briefing payload intact and no `summary` field.
- [x] 3.4 Guard against generating for a date with no final games yet; verify a test for today's date before any games are final confirms no `BriefingSummary` row is created and no model call is made.

## 4. Page UI

- [x] 4.1 Add `src/app/briefing/page.tsx` (today) and `src/app/briefing/[date]/page.tsx` (past dates), both rendering a shared single-column briefing component fed by the task 2 route; verify loading `/briefing` and `/briefing/<a known past date>` in the dev server renders without console errors.
- [x] 4.2 Build the single-column section components (scores, top performers, headlines, injuries, standings, schedule/slate, Best Bets + callback, summary line), each with its own documented no-data fallback; verify each section's empty state renders correctly against a seeded no-data date.
- [x] 4.3 Add prev/next-day navigation controls, disabling/hiding the next-day control on today's briefing; verify manually that paging from a past date moves one calendar day at a time and that today's view has no next-day control.
- [x] 4.4 Confirm the page stays single-column (no multi-column grid) at desktop widths, distinct from the home page's `SectionCard` grid; verify by viewing the page at a desktop viewport width.

## 5. Navigation and shell integration

- [x] 5.1 Add a "Baseline Briefing" entry to the primary navigation (sidebar + mobile hamburger menu) per `app-shell-navigation`; verify the link appears in both the desktop sidebar and the mobile menu and navigates to `/briefing`.
- [x] 5.2 Add breadcrumb support for `/briefing` and `/briefing/[date]`, per `app-shell-navigation`'s existing breadcrumb requirement; verify breadcrumbs render correctly for both today's and a past date's briefing.

## 6. Integration verification

- [x] 6.1 End-to-end check: seed a past date with full data (games, box scores, Best Bets, grading) and confirm `/briefing/[that-date]` renders every recap-only section correctly while omitting the current-moment sections; verify by running the dev server and inspecting the rendered page.
- [x] 6.2 Confirm no secret values are present in any file tracked by git before this change is considered done; verify via `git status`/`git diff` review and that `.env` remains untracked.

## Workflow follow-up

- Archive this change once implementation and verification above are complete and reviewed.
