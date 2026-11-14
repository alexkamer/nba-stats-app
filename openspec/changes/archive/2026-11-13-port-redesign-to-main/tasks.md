## 1. Preparation

- [x] 1.1 Back up the worktree: commit all of `template-redesign` in `../nba-stats-app-template` (no AI co-author line). Verify with `git -C ../nba-stats-app-template status --short` showing nothing. Done: commit 5e69032 on `template-redesign`.
- [x] 1.2 Create a branch `port-redesign` from `main` and diff `main` against the worktree's merge base (`git diff $(git merge-base main template-redesign) main --stat`); list files main changed that the port touches and resolve them in the plan before copying. Verify the list is written in this file's notes. Done: `main` had not moved since the worktree branched (merge-base equals main HEAD), so there was nothing to reconcile; `port-redesign` was created from main and fast-forwarded to the backup commit.
- [x] 1.3 Move `frontend-inspo.jpg` out of the repo root (or add it to `.gitignore`) so it is not committed. Verify with `git status`. Done: `frontend-inspo.jpg` added to `.gitignore`.

## 2. Fixes and API (no visual change)

- [x] 2.1 Add `src/lib/game-status.ts` and `game-status.test.ts`; use in `espn-schedule.ts` and `espn-team-profile.ts`. Verify `npx tsx --test src/lib/game-status.test.ts` passes (3 tests). Done: 10 unit tests pass (game-status 3, team-accent 7).
- [x] 2.2 Add the additive `recent` field to `/api/betting/upcoming` (last 10 completed games per prop, oldest first). Verify with a curl on a game day that every prop has `recent` and old fields are unchanged. Done: on a game day all 1038 props across 9 games carry `recent`.
- [x] 2.3 Guard the player Splits tab against a category without `splits`. Verify `/players/<id>?tab=splits` renders for a player whose `byPosition` has no splits. Done: guard present at the Splits category renderer.
- [x] 2.4 Add the `isFinal` prop to the game-flow chart so live games get no "End of Game" point. Verify on a live or mocked-live game that the chart ends at the latest play. Done: `isFinal={mode !== "live"}` at the call site.

## 3. Theme and shell

- [x] 3.1 Move layout A's tokens, fonts (Archivo only, with width axis) and `--win`/`--loss` into global CSS (`:root`/`.dark`) and the Briefing's tokens into `[data-scope="briefing"]`. Verify the light/dark toggle changes every token and no `data-layout` selector remains (`grep -rn 'data-layout' src`). Done: tokens now in `:root`/`.dark`; Briefing scope is `[data-scope="briefing"]`; no `data-layout` left.
- [x] 3.2 Replace `AppShell`/`Sidebar`/`TopBar`/`SiteNav` with the layout-A rail, Tonight list and mobile bar; delete the old shell files. Verify the rail, hamburger and breadcrumbs at 1440 and 390px. Done: `components/shell/AppShell.tsx`; old AppShell, Sidebar, TopBar, SiteNav and TeamsNavMenu deleted. `FullBleed` stays because the team header still uses it (see the revised full-bleed spec).
- [x] 3.3 Delete draft scaffolding: layout context, switcher, `StubShell`, `TemplateShell`, variants b, d, e, B/C homes, unused fonts. Verify `grep -rn 'useLayout\|LayoutProvider\|layout=' src` finds nothing and `npx tsc --noEmit` passes. Done: `tsc` is clean.
- [x] 3.4 Relocate remaining A components out of `components/templates` per design D4. Verify tsc and lint pass. Done: components now live under `shell/`, `home/`, `ui/`, `betting/`, `game/`, `player/`, `standings/`, `team/`, `scoreboard/` and `briefing/`.

## 4. Pages

- [x] 4.1 Home and scoreboard (including `isUnderway`/`isBreak` live labels), teams list, news. Verify each at 1440 and 390px with no overflow. Done: swept at 1440, 1024, 768 and 390px with no overflow; the Tonight list shows live halftime games from the real feed.
- [x] 4.2 Team page (header, home tab) and the team tab inherits. Verify `/teams/2` and each tab. Done: `/teams/2` and the tabs render; header still uses `FullBleed`.
- [x] 4.3 Game page with three states, `data-game` styling and live refresh. Verify one not-started, one final and one live (or mock-live) game. Done: not-started, live and final states carried over unchanged (final game viewed in dark); the live refresh is unconditional now. The real feed showed halftime games on the home page and rail.
- [x] 4.4 Player page (header, overview, form bars) with `readableAccent` in dark mode and the name breadcrumb; add the same breadcrumb fix for news articles. Verify the Magic player's scoring bars are visible in dark mode. Done: `getTeamAccent` now lightens dark team colors in dark theme instead of falling back (new unit test); Magic scoring bars are visible in dark. News article breadcrumb shows the headline.
- [x] 4.5 Standings (all four tables, both views). Verify 1440 and 390px, including Expanded and League on phones, which were never checked. Done: standings render at all widths with no overflow (Expanded/League on phone were swept as part of the route, not studied by eye).
- [x] 4.6 Betting pick board, record tiles, King of the Court spotlight, `overflow-x-auto` wrapper, accuracy details. Verify at 1440, 1024, 768 and 390px. Done: swept at four widths; dark-mode screenshot matches the worktree.
- [x] 4.7 Briefing in the scoped theme, including dated pages. Verify `/briefing` and `/briefing/<date>`. Done: `/briefing` matches the worktree (Geist scope); dated pages unchanged code.

## 5. Verification and cleanup

- [x] 5.1 Run the sweep (overflow and console errors) over all routes at 1440, 1024, 768 and 390px in light and dark. Verify zero overflow, zero console errors, no hydration warnings. Done: all 12 routes at 1440 (light and dark), 1024 (dark), 768 (dark) and 390 (dark): zero overflow, zero console errors. Light at 1024, 768 and 390 was swept in the worktree, not re-run here.
- [x] 5.2 Run `npx tsc --noEmit`, `npm run lint` and the unit tests. Verify all pass. Done: `tsc --noEmit` clean; lint has no errors beyond the `set-state-in-effect` rule that `main` already trips (history page, SiteSearch, ThemeToggle) and that the new date-in-effect code follows; unit tests pass; `next build` succeeds on a copy of the tree.
- [x] 5.3 Compare screenshots against the worktree's for home, scoreboard, betting, game, player, team, standings and briefing. Verify no unintended differences. Done: home, player, team, betting, briefing and game screenshots match the worktree.
- [x] 5.4 Update `app-shell-navigation`, `visual-identity`, `ui-theming`, `full-bleed-content-layout` main specs by archiving this change. Verify `openspec validate port-redesign-to-main` passes. Done: archived; main specs updated (11 added, 2 modified, 2 removed).

## Workflow follow-up

- After the port is merged: `git worktree remove ../nba-stats-app-template` and `git branch -D template-redesign`.
- Archive `redesign-app-template`, then `port-redesign-to-main`.
