# Proposal

## Why

The current shell (a 13rem left sidebar plus a top bar, a centered max-width content column, and a breadcrumb row) was built for a handful of pages and now fronts betting, briefing, and team-performance surfaces that want denser, more varied layouts. The owner has an inspiration image (`frontend-inspo.jpg`, a Scores24-style layout) and wants to see several concrete directions side by side before committing, rather than deciding from sketches.

## What Changes

- Create a separate git worktree at `../nba-stats-app-template` on branch `template-redesign`, so `main` and its dev server stay untouched.
- In that worktree only, add five switchable layout drafts selected by a `?layout=a|b|c|d|e` query param:
  - **A Scores Rail**: sidebar with a live-games list, entity header with tab strip, dense stat tiles, right rail.
  - **B Ticker + Top Nav**: scrolling score ticker, top nav, full-width content.
  - **C Command Palette + Icon Rail**: icon-only sidebar, Cmd+K search-first navigation, single column.
  - **D Dashboard Grid**: widget cards for games, best bets, King of the Court, standings, and streaks.
  - **E Editorial**: magazine-style header, hero story, generous whitespace.
- Each variant is a complete UI revamp with its own palette, typography, shape and density, built to professional front-end quality, not a layout-only skin.
- Apply each variant to the shell plus two reference pages (home `/` and a team page `/teams/[teamId]`) using real data.
- Drafts are throwaway. Nothing is merged to `main` as part of this change. After the owner picks a direction, a follow-up change folds the winner into `app-shell-navigation` and `visual-identity`.
- No **BREAKING** changes to `main`.

## Capabilities

### New Capabilities
<!-- None: drafts are throwaway and define no durable behavior. -->

### Modified Capabilities
<!-- None: no spec changes until a direction is chosen, per the owner's instruction. The follow-up change will modify `app-shell-navigation` and `visual-identity` (and likely `full-bleed-content-layout` and `ui-theming`). -->

This change sets `skip_specs: true`.

## Impact

- **Code:** only the `template-redesign` worktree: `src/app/layout.tsx`, `src/components/AppShell.tsx`, `Sidebar.tsx`, `TopBar.tsx`, `SiteNav.tsx`, `Breadcrumb.tsx`, the home page `src/app/page.tsx`, the team page `src/app/teams/[teamId]/page.tsx`, plus new layout components. Tokens in `globals.css` may gain variant-scoped overrides.
- **Data/APIs:** variants read existing API routes and the existing Prisma SQLite database. Variant A's live-games sidebar and variant B's ticker need scoreboard data available in the shell on every page, which is new shell-level data fetching.
- **Dependencies:** none expected (Tailwind 4, lucide-react, and TanStack Query are already present). Cmd+K may reuse `SiteSearch`.
- **Environment:** `.env` and `prisma/dev.db` are gitignored, so the worktree must be given its own copy or link of them, and the drafts run on a different dev port (such as 3001).
- **Main branch:** unaffected until the owner picks a winner.
