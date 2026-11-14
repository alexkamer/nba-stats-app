# Tasks

All work happens in the `../nba-stats-app-template` worktree on branch `template-redesign`. Nothing is merged to `main`.

## 1. Worktree and environment

- [x] 1.1 Create the worktree with `git worktree add ../nba-stats-app-template -b template-redesign` from `main`; verify `git worktree list` shows it and the main checkout is still on `main`.
- [x] 1.2 Symlink `.env` and `prisma/dev.db` from the main checkout into the worktree, run `npm install` and `npx prisma generate` if needed; verify `npm run build` (or `npx tsc --noEmit`) passes unchanged.
- [x] 1.3 Start `npx next dev -p 3001` in the worktree; verify `http://localhost:3001/` renders the current design and `/api/scoreboard` and `/api/teams` return data.

## 2. Layout switching infrastructure

- [x] 2.1 Add `TemplateShell` and a `useLayout()` hook (query param, persisted to `localStorage`, baseline until mounted) and swap it into `src/app/layout.tsx`; verify `?layout=z` and no param both render the unchanged baseline shell.
- [x] 2.2 Add the floating `LayoutSwitcher` (baseline, A to E); verify clicking each option updates `?layout=` and survives navigating via a sidebar `<Link>` and a hard reload.
- [x] 2.3 Add scoped `[data-layout]` styling hook and ensure each shell sets `--sidebar-w` / `--sidebar-w-half`; verify an existing `FullBleed` page (such as a team page) stays aligned in a stub shell with and without a sidebar.
- [x] 2.4 Add `useScoreboardToday()` (shared hook with short `refetchInterval`, enabled only for A and B); verify in the Network tab that C, D, E and baseline do not poll the scoreboard.

- [x] 2.5 Load the variants' fonts with `next/font` and add the per-variant token blocks from design D8 (`html[data-layout="a".."e"]` overriding color, font and radius tokens); verify with screenshots that each layout switches palette and typeface on the same page, light text stays at WCAG AA contrast against its surface, and `base` is pixel-identical to before.

## 3. Shared presentation pieces

- [x] 3.1 Build the shared pieces the converged design uses instead of the originally planned set: `LeadersStrip` and `StandingsTable` (`variants/sections.tsx`), `L10Dots`, `LiveDot`, `Segmented` and `ThemeIconButton` (`variants/shared.tsx`), `Wordmark`, and the team page's stat `Tile`; verified by their use on A's home page, Briefing and team page in light and dark.

Dropped with variants D and E: `WidgetCard` and `HeroStory` (the original 3.2). `WinLossBar`, `EntityHeader` and `TabStrip` were not needed as separate pieces: the team header is `TeamHeaderA` and the existing `TabPager` stays.

## 4. Variants on the shell and home page

- [x] 4.1 Variant A (Scores Rail): sidebar with nav plus live "Today's games" list, optional right rail at `xl`, home page arrangement; verify at 1440px and 390px widths, light and dark.
- [x] 4.2 Variant B (Ticker + Top Nav): scrolling ticker from live scoreboard data, full top nav, full-width home page; verify the ticker animates, pauses on hover and shows real games.
- [x] 4.3 Variant C (Icon Rail + Cmd+K): icon-only rail, command palette opened with Cmd+K and from the rail search icon, single-column home page; verify searching for a team and a player navigates correctly by keyboard alone.
- [x] 4.4 Variant D (Dashboard Grid): home page as a grid of `WidgetCard`s (games, best bets, King of the Court, standings, streaks); verify each widget shows real data and the grid collapses to one column on mobile.
- [x] 4.5 Variant E (Editorial): masthead, hero story using the Daily Briefing headline, pull stats, generous whitespace; verify the hero shows the current briefing and falls back gracefully when none exists.

## 4b. Convergence on A (owner direction after reviewing the five drafts)

The owner picked A as the base, liked B's standings and league-leaders presentation, wants C's theme for the Briefing page, and dropped D and E (see design D9).

- [x] 4.6 Hide D and E from the layout switcher and the variant registry (keep their files so they can be restored); verify the switcher shows only Current, A, B and C and `?layout=d` / `?layout=e` fall back to the baseline.
- [x] 4.7 Extract B's league-leaders strip and conference standings tables into shared sections and use them in A's home page in place of A's tabbed leaders and compact standings; verify A's home at 1440px and 390px in light and dark with real data, and that B's home is unchanged.
- [x] 4.8 Scope C's theme (porcelain surface, cobalt accent, Geist type, generous whitespace) to the Briefing pages (`/briefing` and `/briefing/[date]`) inside A's shell, leaving A's rail on A's tokens; verify both pages in light and dark at desktop and mobile widths, with the date navigation and summary still working.

- [x] 4.9 Recompose the Briefing in C's voice for layout A (one reading column, large quiet type, big numerals, no card chrome; injury list collapsed to the first 12 with a Show all control), reading the same `/api/briefing` payload and keeping the existing page for every other layout; verify `/briefing` at 1440px and 390px in light and dark, that the baseline Briefing still renders with no console errors, and that all sections and the Earlier/Later date links still appear.

## 5. Team page

- [x] 5.1 Apply A (with B's tile and table treatment where it fits) to the team page: entity header, tab strip, dense stat tiles with bars, recent-games strip; verify existing `TabPager` tabs, season picker and team accent color still work.

## 6. Review pass

- [x] 6.1 Walk the converged design (A) and the baseline on `/`, a team page and `/briefing`, in light and dark, at desktop and mobile widths; verify no console errors or hydration warnings, and fix only blocking issues.
- [x] 6.2 Capture a screenshot set per page (desktop and mobile) for the owner's review; verify the files exist and open.
- [x] 6.3 Hand the owner the running URL (`http://localhost:3001/?layout=a`) and a short note on what was kept from each draft, then record the owner's feedback for the follow-up change.

## 7. Recompose the remaining pages (owner direction: every page before the port)

The owner chose to recompose every page before porting anything into `main`, so the port change waits for this group. Each page keeps its data and behavior and is recomposed for layout A the same way the home page, Briefing and team page were (a draft-only switch in the page, the existing page untouched for every other layout). Verify each at 1440px and 390px in light and dark with no console errors, and that its existing interactions still work.

- [x] 7.1 Scoreboard (`/scoreboard`): game cards in a grid with scores, status and a clear way to open the game, box score and play-by-play; date navigation unchanged.
- [x] 7.2 Standings (`/standings`): rebuilt presentation for layout A with every view, grouping, column and season option kept. One header with the title and season picker and two filled segmented controls (Standings / Expanded / Vs. Division / NBA Cup, and League / Conference / Division) in place of two outlined bars. Each group is a flat table with a title bar and a shaded header; the team column (rank, logo, name, abbreviation on phones) stays in place while the stats scroll sideways; columns have fixed shared widths so tables line up with one another; the top six in a conference show their rank in the accent color with the dotted and solid play-in lines kept and explained under the tables; streak is a colored W or L, last ten is blocks plus the record, and differentials are colored by sign. The NBA Cup tables use the same component. Verified for Standings, Expanded, Vs. Division by division, and the NBA Cup at 1440px, and the default view at 390px; no page-level overflow at 1440, 1024, 768 or 390px. Not checked in dark mode.
- [x] 7.3 Game page (`/games/[eventId]`): recomposed for layout A around the three states a game can be in (not started, live, final), told apart by the data (a Preview exists, the game came from the database or its status reads Final, otherwise live). One new header for all three: tip-off time and the market line with "Not started"; a live score with a pulsing status chip and clock; a final score with the winner emphasized. State-specific tabs and bodies: Matchup/Preview/Odds and props before the game (projection and ESPN predictor, likely starters, injuries, game info); Live/Box score/Play-by-play/Team stats during it, with a live strip (win-probability bar, last play, "updated Ns ago") and the page refreshing itself every 15 seconds; Summary/Recap/Box score/Play-by-play/Team stats after it, with the recap headline, top performers, how the odds resolved and performance against the spread. Box score, play-by-play, team stats, recap and odds-and-props tabs reuse the existing components. Verified for not-started and final games at 1440, 1024, 768 and 390px with every tab, and tab switching keeps Box score selected. The live mode was first verified against a completed game rewritten into the live data shape, then against a real in-progress game (MIL @ ORL, early first quarter) once one was on the schedule: the score, clock and win probability moved while the page was open, it made refresh requests about every 15 seconds, and its sparse early-game data renders cleanly. That real game exposed a bug in the existing game-flow chart: it appends a synthetic "End of Game" point at 100% whenever the play feed's score trails the scoreboard, which is always true while a game is being played. Layout A now passes `isFinal` so the fallback only applies to finished games; the baseline keeps the old behavior (and still has the bug for live games), so the port should fix it there too. A polish pass then replaced the loud header (full-width team-color wash, pill chips, oversized scores) with a calmer one, and gave the page's older outlined cards one flat style and one title style through CSS scoped to the game page in layout A. Not checked in dark mode; halftime and between-period states have not been seen.
- [x] 7.4 Player page (`/players/[athleteId]`): recomposed for layout A. A calmer identity header (headshot on a team-tinted tile, name, team link, jersey and position, status, and a row of bio facts) beside four season tiles with league rank; one line for the next game that reads "Next game" with a preview link, or "Playing now" with a link to follow it when that game is underway. Overview: a flat season tile grid, a last-ten-games scoring chart (bars, dashed average, fainter bars below it, opponent and result under each), the career snapshot beside it, then the recent-games table and news. The other five tabs (Stats, Bio, Splits, Game Log, Advanced Stats) keep their content and inherit the styling; scoped CSS flattens their outlined cards. The breadcrumb now shows the player's name instead of the raw id (applies in every layout). Verified at 1440, 1024, 768 and 390px on every tab with no overflow, for a player whose team is playing now and one with an upcoming game. Not checked in dark mode.
- [x] 7.5 Teams list (`/teams`).
- [x] 7.6 News list and article (`/news`, `/news/[id]`).
- [x] 7.7 Betting (`/betting`): rebuilt from scratch as the "pick board" and now the page in layout A (the toggle and old arrangement were removed; the baseline layout keeps the original page). Record tiles; two tables, Game picks and Player props, each with its own filters (market and player search), a shared Best bets / Recommended / Everything switch, game, edge and sort controls, and rows that expand to a projection-versus-market number line; a graded edge chip and a Gap column in place of the old edge bar; King of the Court as a stepped podium with a ranked bar list; the full track record in a collapsed section. Edge is measured at the line the pick was made against, with the live-line edge in the row detail. Each prop row also shows the player's last ten games against the pick's line as green/red boxes with a hit count, backed by a new additive `recent` field on each prop in `GET /api/betting/upcoming` (the port must include that route change). The full table needs about 1,060px of content, so it switches on at 1440px and narrower screens use the stacked rows. Verified at 1440, 1366, 1280, 1024, 768 and 390px in light mode with no overflow or console errors; not checked in dark mode.
- [x] 7.8 Betting history / Cover Story (`/betting/history`) and `/betting/history/king-of-the-court/[date]`.
- [x] 7.9 Betting accuracy bucket (`/betting/accuracy/[bucket]`) and player prop research (`/betting/research/[playerId]`).
- [x] 7.10 The team page's other tabs (Stats, Schedule, Performance, Roster, Depth, Injuries, Transactions): reviewed in layout A under the new header. They already read as finished (team leaders and a player table, a schedule with line and over/under columns, performance against the spread with a cover-margin chart, a depth chart, injuries, transactions by month) and none overflow at 1440px. Two inconsistencies fixed with CSS scoped to the team page in layout A: the older outlined cards are now flat like the rest of the layout, and the pale one-off reds and greens (the light red "Out" in Injuries, the pale green and red lines in Schedule, the performance figures) use the app's win and loss colors, which are dark enough to read on white. Not checked at phone widths or in dark mode.
Review notes (after recomposing 7.1, 7.5 and a small news tweak for 7.6): the standings, game, player, betting, Cover Story and accuracy pages already had strong layouts of their own and look consistent and finished under layout A through the shared tokens, shell and a large-title rule. A phone-width sweep of all 16 routes found two overflows (a betting table, 42px, which the baseline also has; and the research page's sticky bar, 4px, which was ours), both fixed. What is left open below is a decision for the owner: whether any of those pages should get a bespoke recomposition beyond what they inherit, and the unreviewed deeper tabs (game Gamecast/Preview/Odds, player tabs, standings views, team tabs other than Stats and Roster).

- [x] 7.11 Full pass: walk all 15 routes plus the Briefing date pages in light and dark at desktop and mobile widths; verify no console errors or hydration warnings and that the baseline layout is unchanged. Result: light and dark reviewed at 1440px, light at 1024, 768 and 390px; no overflow or console errors. Not verified: halftime and between-period states live, Expanded and League standings on phones. Known dark-mode weakness: dark team accents (for example Magic blue) are low contrast on the player scoring bars.

### Existing bugs found and fixed while building group 7 (the port must carry these to `main`)

- **Game status**: only `STATUS_IN_PROGRESS` was treated as "being played" by `src/lib/espn-schedule.ts`, `src/lib/espn-team-profile.ts`, and the home and scoreboard pages, so a game at halftime or between quarters (`STATUS_HALFTIME`, `STATUS_END_PERIOD`) was labeled not started (the player page said "Next game … Game preview" about a game in progress). One shared rule now lives in `src/lib/game-status.ts` (`isUnderway`, `isBreak`, with a unit test) and is used by all of them; a break shows its own text ("Halftime", "End of 1st Quarter") instead of a frozen clock.
- **Game flow chart** appended a fake "End of Game" point at 100% while a game was live (see 7.3).
- **Player Splits tab** crashed for every player because the feed's `byPosition` category has no `splits` list; guarded.
- **`/betting` table** overflowed phone widths in the baseline too; wrapped in a horizontal scroll container.

## Workflow follow-up

- The port also carries the one backend change made in this worktree: `recent` (last ten completed games per prop, oldest first, only games before the game in question) added to each player prop in `src/app/api/betting/upcoming/route.ts`.
- When group 7 is done, start a new change that modifies `app-shell-navigation` and `visual-identity` (and likely `full-bleed-content-layout` and `ui-theming`) and ports the converged design (A, with B's sections and the C-style Briefing, plus the recomposed pages) into `main`.
- Remove the worktree and `template-redesign` branch once the winner is ported; archive this change.
