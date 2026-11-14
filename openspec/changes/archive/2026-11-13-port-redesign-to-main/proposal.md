# Proposal

## Why

The `redesign-app-template` change produced a converged, reviewed design ("layout A", with B's standings/leaders presentation and C's Briefing theme) in the `template-redesign` worktree. It exists only behind a `?layout=` switcher and uncommitted, so `main` still ships the old shell. The owner has approved the direction; it now needs to become the app's one real look, without the throwaway draft scaffolding.

## What Changes

- Make the layout-A shell the app shell: wordmark, search, section links (Briefing, Scoreboard, Standings, Teams, News, Betting, Cover Story), a live "Tonight" list, a mobile bar, and a light/dark toggle. Remove the old sidebar/top bar.
- Replace the app's palette and typefaces with layout A's (Archivo display and body, new `--win`/`--loss` colors, flat surfaces). Light and dark variants.
- Recompose the pages: home, scoreboard, teams list, team (header and home tab), game (three states: not started, live, final), player, standings, news cards, betting (pick board with player-prop and game-pick sections, record tiles, King of the Court spotlight), and the Briefing (C's theme scoped to the Briefing pages).
- Remove the draft scaffolding: `?layout=` switcher, `LayoutProvider`, `StubShell`, variants B, C (shell/home), D and E, and the per-layout `html[data-layout]` CSS gating. Tokens move to the global theme; scoped flattening rules (`[data-game]`, `[data-player]`, `[data-team]`) become the normal styling or are folded into the components.
- Carry the fixes found along the way:
  - Games at halftime or end of period count as live, via a shared `src/lib/game-status.ts` (with test) used by `espn-schedule`, `espn-team-profile`, the home and scoreboard pages.
  - Player Splits tab no longer crashes when a category has no `splits`.
  - `/betting` table scrolls horizontally instead of overflowing phones.
  - The live game-flow chart no longer draws a fake "End of Game" 100% point (`isFinal`).
  - Player breadcrumb shows the player's name, not the raw id. News article breadcrumb gets the same fix.
  - Player scoring bars stay readable in dark mode when a team color is dark.
- `/api/betting/upcoming` gains an additive `recent` field per prop (last 10 completed results, oldest first) powering the last-10 boxes. **No breaking API change.**

## Capabilities

### New Capabilities
- `live-game-status`: what counts as an underway game (in progress, halftime, end of period) and how every surface labels a game as not started, live or final.

### Modified Capabilities
- `app-shell-navigation`: rail shell with a live "Tonight" games list and a mobile bar, replacing the sidebar and top bar.
- `visual-identity`: new typefaces, palette and flat-surface treatment, win/loss colors.
- `ui-theming`: the new tokens in light and dark, including accessible contrast for team accent colors in dark mode.
- `full-bleed-content-layout`: the game and player headers become contained cards; only the team header band stays full-bleed.

## Impact

- **Code:** `src/app/layout.tsx`, `globals.css`, the page files listed above, `src/components/` (shell, breadcrumb, new page components moved out of `components/templates/variants/a`), `src/lib/game-status.ts`, `espn-schedule.ts`, `espn-team-profile.ts`, `src/app/api/betting/upcoming/route.ts`, `BriefingContent.tsx`.
- **Data/APIs:** one additive field on `/api/betting/upcoming`; the shell polls the scoreboard every 30s for the Tonight list.
- **Dependencies:** none new (Archivo and the other draft fonts via `next/font/google`; drop unused fonts).
- **Process:** the source is uncommitted in `../nba-stats-app-template`. After the port, remove that worktree and the `template-redesign` branch, then archive `redesign-app-template`.
