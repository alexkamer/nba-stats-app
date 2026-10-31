# Tasks

## 1. Fix full-bleed sections overlapping the sidebar

- [x] 1.1 Build a shared `FullBleed` component (`src/components/FullBleed.tsx`) implementing the corrected breakout math (`lg:mx-[calc(-50vw+6.5rem)] lg:w-[calc(100vw-13rem)]`), and verify its left edge lands flush with the sidebar's right edge at a `lg`-width viewport, not inside the sidebar.
- [x] 1.2 Replace the inline breakout markup in `src/app/games/[eventId]/page.tsx` (score header band and the gamecast 3-column grid) with `FullBleed`, and verify both render flush against the sidebar with no overlap at `lg`+.
- [x] 1.3 Replace the inline breakout markup in `src/app/teams/[teamId]/page.tsx`'s header band with `FullBleed`, and verify no sidebar overlap at `lg`+.
- [x] 1.4 Replace the inline breakout markup in `src/app/players/[athleteId]/page.tsx`'s header band with `FullBleed`, and verify no sidebar overlap at `lg`+.
- [x] 1.5 Verify all three pages still span the full viewport width (no sidebar) below `lg`, matching pre-fix behavior there.

## 2. Typography and color token revamp

- [x] 2.1 Replace Geist/Geist Mono with Inter (body) and Barlow Condensed (display) in `src/app/layout.tsx`, mapped to `--font-sans`/`--font-display` in `src/app/globals.css`, and verify via `tsc --noEmit` and a rendered page that both fonts load.
- [x] 2.2 Add a global `h1, h2, h3 { font-family: var(--font-display); }` rule in `globals.css`, and verify every page's headings pick up the display typeface without per-page edits.
- [x] 2.3 Replace the color token values in `globals.css`'s `:root`/`.dark` with the new palette (warmer paper background, ember accent, near-black dark mode), and verify both themes render correctly via screenshots on at least the home, betting, and a team page.
- [x] 2.4 Restyle `StatBlock` (display-font headline value, uppercase tracked label, flat `bg-surface-muted` card) and `Sidebar`/`SiteNav` (display-font wordmark, flat section links), and verify via screenshots in both themes.
- [x] 2.5 Bump page-title `h1`s (`Scoreboard`, `Bettor's Heaven`, `Teams`, `Players`, `News`, `NBA Standings`, team detail name) to the larger/bolder heading treatment, and verify each renders correctly.

## 3. Roster imagery on list pages

- [x] 3.1 Extend `ScoreboardGameCard` in `src/lib/espn-live.ts` to include `logoUrl`/`color` per team, falling back to the predictable CDN logo path when ESPN's scoreboard payload omits `logos`, and verify `/api/scoreboard` returns valid logo URLs for a sample date.
- [x] 3.2 Add team logos and a team-color gradient to the home page's scoreboard cards (`src/app/page.tsx`), and verify via screenshot in both themes.
- [x] 3.3 Add bigger logos and a team-color gradient background to the teams list page's cards (`src/app/teams/page.tsx`), and verify via screenshot.
- [x] 3.4 Add player headshots and a team-color accent stripe to the players list page's cards (`src/app/players/page.tsx`), and verify via screenshot, including a free-agent (no current team) card's graceful fallback.

## Workflow follow-up

- Archive this change once reviewed and confirmed against the live app.
