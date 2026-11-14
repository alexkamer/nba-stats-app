# Design

## Context

See proposal.md for motivation. Current structure, observed in the code:

- `src/app/layout.tsx` composes `Providers` > `BreadcrumbProvider` > `AppShell` (client; owns sidebar collapsed state and the `--sidebar-w` CSS vars) > mobile `SiteNav` header + `<main>` with a centered max-width column and `Breadcrumb`.
- `Sidebar` / `TopBar` both render the shared `SECTIONS` list. `FullBleed` depends on `--sidebar-w` to stay flush with the sidebar edge.
- Pages are client components fetching from `/api/*` via TanStack Query (home: scoreboard, standings, news, league leaders; team page: `/api/teams/[id]` plus `TabPager` tabs).
- Theming is token-based (`--background`, `--surface`, `--surface-muted`, `--border`, `--accent`) with a `.dark` variant; display font is Barlow Condensed, body is Inter.
- `.env` and `prisma/dev.db` are gitignored, so a fresh worktree has neither.

## Goals / Non-Goals

**Goals:**
- The owner can open one URL, flip between five complete-looking layouts, and compare them on real data, for the shell, the home page, and a team page.
- Variants share data hooks, so the comparison is about layout and visual style, not data differences.
- `main` is untouched, and the winner can be ported later without untangling the drafts.

**Non-Goals:**
- No automated tests for visual drafts. Visual quality is NOT a non-goal: each variant is a complete UI revamp built to professional front-end standards (own palette, type, spacing, states, responsive, keyboard focus, reduced motion), not a wireframe skin.
- No changes to API routes, the Prisma schema, or ingest.
- No spec edits (`skip_specs: true`); those belong to the follow-up change after a pick.
- Other pages (betting, briefing, standings, games) are not redesigned; they render inside whichever shell is active, which is itself a useful signal.

## Decisions

### D1. Separate worktree, own port
Create the worktree with `git worktree add ../nba-stats-app-template -b template-redesign`, branching from current `main`. Symlink (or copy) `.env` and `prisma/dev.db` from the main checkout, run `npm install`, and start with `next dev -p 3001`.
*Alternatives:* a plain branch checkout (rejected: it would swap the owner's `main` working tree and dev server); reusing the existing empty `home-page` branch (rejected: a name that implies one page, not a shell comparison).
A symlink is preferred for `dev.db` so the drafts see freshly ingested data. Note that SQLite with two Next processes reading it is fine, but both must not run ingest at once.

### D2. One switch point: a `TemplateShell` client component
`layout.tsx` replaces `AppShell` with `TemplateShell`, which reads the active layout and renders one of five shell components (`ShellA` to `ShellE`) around `children`. With no or an unknown layout it renders the existing `AppShell`, so the current design stays reachable as the baseline.
*Alternatives:* separate route groups per variant (rejected: duplicates every page), or env var at build time (rejected: the owner wants to flip live).

### D3. Layout selection: query param, persisted
`?layout=x` is the entry point the owner asked for, but it is lost when navigating via `<Link>`. `TemplateShell` therefore reads `useSearchParams()`, writes the value to `localStorage` (`template-layout`) and a cookie-free client store, and falls back to the stored value when the param is absent. A small floating `LayoutSwitcher` pill (bottom corner, A-E plus "current") sets the param so flipping does not need URL editing. The first render uses the baseline until mounted, matching `ThemeToggle`'s pattern, to avoid hydration mismatches.

### D4. Page-level variation: recomposed per variant, shared data
The owner wants an identity of their own, not an ESPN-style shell, so variants are free to recompose the home and team pages instead of rearranging the existing sections. What stays shared is the data layer: `useHomeData()` (games, standings, leaders, headlines, today's briefing) and the existing team-page queries. Each variant owns its shell and its page compositions under `src/components/templates/variants/<id>/`, and `page.tsx` files render a variant composition when a draft layout is active and the existing page otherwise (so the baseline is untouched). Shared presentational atoms (`StatBar`, `ResultPill`, `GameStatus`) live in `src/components/templates/` and read tokens only.
*Alternatives:* fork the data code per variant (rejected: five copies of the same fetching); keep the existing section arrangement (rejected by the owner).

**Brand:** drafts use a placeholder wordmark, "Baseline" (taken from the existing Baseline Briefing feature), drawn as a lowercase wordmark with a baseline-rule mark, so each variant can look like its own product. The name is a placeholder and is easy to change.

### D5. Shell-level live data
Variants A (live-games sidebar) and B (ticker) need scoreboard data on every page. Add one shared `useScoreboardToday()` hook around the existing `/api/scoreboard` route with a short `refetchInterval`, mounted only when A or B is active, so C, D and E and the baseline pay no extra fetching.

### D6. Variant specifics (kept deliberately small)

| Variant | Shell | Home page | Team page |
|---|---|---|---|
| A Scores Rail | 13rem sidebar with nav + "Today's games" list; right rail (news, leaders) at `xl` | tiles + standings in main column | entity header, tab strip, dense stat tiles with bars, recent-games strip |
| B Ticker + Top Nav | score ticker strip, full top nav, no sidebar | full-width tables | header band, full-width tabs |
| C Icon Rail | icon-only rail, Cmd+K palette (reuses `SiteSearch` data) | single column, large numbers | single column, hover detail |
| D Dashboard Grid | slim nav; page body is a CSS grid of `WidgetCard`s | widgets: games, best bets, KOTC, standings, streaks | widgets per tab topic |
| E Editorial | wordmark masthead, top nav | hero story (Briefing headline) + pull stats | magazine header, prose-width sections |

Each variant is a full visual identity, not just a layout (see D8).

### D8. Per-variant visual identity via token overrides
`layout.tsx` loads every variant's fonts once with `next/font` (exposed as CSS variables). Each variant defines a token block scoped to `html[data-layout="x"]` that overrides the existing color tokens (`--background`, `--foreground`, `--surface`, `--surface-muted`, `--border`, `--accent`, `--accent-foreground`), the font roles (`--font-sans`, `--font-display`, `--font-mono`) and adds shape tokens (`--radius`, density). Shared pieces (`StatTile`, `WidgetCard`, tables) read tokens only, so one component set renders five identities. Baseline tokens are untouched. Win/loss semantic colors are separate tokens so accent and result colors never collide.

The palettes avoid the generic defaults (cream + terracotta; near-black + one neon; identical rounded cards with the same soft shadow):

| Variant | Concept | Palette (core) | Type | Shape and structure |
|---|---|---|---|---|
| A Scores Rail | Broadcast scoreboard, light | paper `#EAEEF3`, surface `#FFFFFF`, ink `#0D1626`, signal green `#097350`, loss red `#D6334A` | Archivo (width axis: condensed for numbers and headings, normal for body), tabular numerals | 6px radius, filled tiles with thin dividers, progress bars carry the data |
| B Ticker + Top Nav | Network sports desk | white `#FFFFFF`, ink `#101828`, ticker navy `#0A1730`, royal blue `#1F4FD8`, flag red `#C8102E` | Barlow Semi Condensed headings, Barlow body | square corners, a navy ticker band over a white page, strong rules instead of cards |
| C Icon Rail + Cmd+K | Quiet instrument panel | porcelain `#F6F6F4`, ink `#1A1A1A`, cobalt `#2742E8`, graphite `#6B6B66` | Geist Sans and Geist Mono (numerals only) | 10px radius, almost no borders, large numerals, whitespace does the grouping |
| D Dashboard Grid | Trading desk, dark | graphite `#16171A`, panel `#1F2024`, amber `#F2A33A` (light mode `#95580A`), up green `#34C38F`, down red `#F0616D` | IBM Plex Sans body, IBM Plex Mono for figures | 4px radius, 1px panel borders, dense grid with deltas and sparkline-style bars |
| E Editorial | Sports magazine | bone `#FBFAF7`, ink `#16120E`, hardwood `#9A5B24`, team color from the entity | Newsreader serif display and body, Inter Tight for data | no cards, hairline rules, 2-column prose measure under 70 characters |

Accents are used sparingly: one memorable element per page (A the live rail, B the ticker, C the palette, D the grid density, E the hero), everything else stays quiet.

### D9. Convergence after owner review
After seeing all five home pages the owner chose a direction: **A is the base**; **B's league-leaders strip and conference standings tables replace A's own leaders and standings**; **C's theme (porcelain, cobalt, Geist, large quiet type) becomes the look of the Briefing pages**; **D and E are dropped**. Consequences:
- B's two sections become shared components used by A (and still by B), so the converged page is not a fork of B.
- C's theme is applied per page, not per layout: a `data-scope="c"` wrapper carries C's color and font tokens around the Briefing content inside A's shell, while A's rail keeps A's tokens. Token blocks are selected by `html[data-layout="c"], [data-scope="c"]` so one definition serves both uses. The display font is re-pointed on the scope too, because `--font-display` resolves at `:root` and would not otherwise follow the scoped override.
- Team-page work (group 5) is done once, for A, instead of five times.
- Owner decision after the first convergence: every remaining page is recomposed for A before the port into `main` (tasks group 7), so the port is one change covering the whole app rather than a shell plus inherited pages.
- D and E stay in the worktree but are unregistered from the switcher, so they can be restored.

### D7. Mobile
Each variant must degrade to a usable single-column mobile layout (the owner's inspo image includes a phone view). Reuse the existing hamburger `SiteNav` below `lg` for A, B, D, E; C uses a bottom bar or the palette. Depth of mobile polish is "usable", not "finished".

## Risks / Trade-offs

- **Five variants is a lot of UI** → build in stages (home page for all five first, then the team page) so the owner gets something to react to early; drop or merge variants if the owner prunes.
- **`FullBleed` assumes `--sidebar-w`** → each shell must set `--sidebar-w` / `--sidebar-w-half` (0px where it has no sidebar), otherwise full-bleed sections misalign.
- **Hydration flashes from client-side layout choice** → render baseline until mounted; accept a brief swap in drafts.
- **Worktree missing `.env` / DB** → documented in D1 and a task verifies `/api/*` returns data before any UI work.
- **Shared SQLite file between two dev servers** → read-only usage in the drafts; do not run ingest from the worktree.
- **Drafts rot against `main`** → rebase `template-redesign` onto `main` before porting the winner.

## Migration Plan

Not applicable to `main` in this change. After the owner picks a direction: open a follow-up change that modifies `app-shell-navigation`, `visual-identity` (and likely `full-bleed-content-layout` and `ui-theming`), port only the winning variant from `template-redesign`, and remove the switcher, `TemplateShell` and losing variants. Rollback for this change is `git worktree remove ../nba-stats-app-template` and deleting the branch.
