# Design

## Context

The prior change introduced a persistent `Sidebar` (`lg:w-52`, 13rem) at `lg` and above, replacing a flat top-only nav. Three detail pages (`games/[eventId]`, `teams/[teamId]`, `players/[athleteId]`) used a classic viewport-relative "full-bleed breakout" trick — `relative left-1/2 right-1/2 -mx-[50vw] w-screen` — to span their header bands past the page's centered `max-w-6xl` column. That trick only produces correct results when the column it breaks out of is itself centered in the full viewport, which was true before the sidebar existed and is no longer true at `lg` and above. See proposal.md - Why for the user-facing symptom (header bands overlapping the sidebar) and the decision to fix it alongside the "boring" visual feedback, since both are about how the content area's width now differs from the viewport.

## Goals / Non-Goals

**Goals:**
- Fix the full-bleed breakout math once, in one shared component, rather than patching three independent inline occurrences.
- Apply a new typography and color system at the token level (fonts, CSS variables) so it cascades across every page without per-page edits.
- Add imagery to the three most text-only list views (scoreboard, teams, players) using data already available or trivially derivable from existing API shapes.

**Non-Goals:**
- Redesigning per-page internal layouts (box score tables, play-by-play, shot charts) beyond the font/color token cascade — those pages' structure is unchanged.
- Changing `ui-theming`'s or `team-accent-theming`'s own requirements — this change adds new global tokens and imagery on top of both, consuming them as-is.
- A general-purpose "breakout to any arbitrary ancestor width" primitive — `FullBleed` is scoped specifically to the sidebar's known, constant width.

## Decisions

**`FullBleed`'s breakout math is derived algebraically from the sidebar's known constant width (13rem), not computed dynamically.** The original trick works because, with margin-left `-50vw` and `left: 50%`, the element's rendered left edge converges to `parent_center - 50vw`, which is `0` exactly when the parent is centered in the viewport. With the sidebar occupying the leftmost `S` (13rem at `lg`+, `0` below `lg`) of the viewport, the parent's center shifts to `50vw + S/2`, so the unmodified trick lands the breakout box's left edge at `S/2` — inside the sidebar, which is exactly the reported bug. Solving for the margin that instead lands the left edge at `S` (flush with the sidebar's right edge) gives `margin-left: calc(-50vw + S/2)` with `width: calc(100vw - S)`. Implemented as Tailwind arbitrary values (`lg:mx-[calc(-50vw+6.5rem)] lg:w-[calc(100vw-13rem)]`, since `S/2 = 6.5rem`). Below `lg` the original unmodified classes remain correct, since `S = 0` there (sidebar hidden, per `app-shell-navigation`).
  - Alternative considered: restructure page layout so full-bleed sections are direct children of `<main>` (never nested inside the centered column), avoiding breakout math entirely. Rejected for this change as a larger, riskier restructuring of three already-large page files for the same visual result; the algebraic fix is a minimal, localized diff.

**Sidebar width (13rem) is hardcoded in `FullBleed` rather than read from a shared constant.** `Sidebar.tsx` and `FullBleed.tsx` each hardcode `13rem`/`lg:w-52`. A future change to the sidebar's width must update both. Accepted as a two-file, easily greppable coupling rather than introducing a CSS-variable indirection for a value that changes rarely.

**Typography: Barlow Condensed (display) + Inter (body), both via `next/font/google`, mapped to `--font-display`/`--font-sans` theme variables in `globals.css`.** Chosen over keeping Geist because a condensed, heavier-weight face reads better for large stat numbers and headlines (the thing "pop" feedback was about), while Inter keeps dense tabular data (box scores, prop tables) legible at small sizes — a condensed face at body-text sizes would hurt readability. `h1`/`h2`/`h3` get `font-family: var(--font-display)` via a plain element selector in `globals.css`, so every page's existing headings pick it up without per-page edits (verified: Tailwind utility classes on those headings set `font-size`/`font-weight`, not `font-family`, so no specificity conflict).

**Color palette is a direct token value swap in `:root`/`.dark`, not a new token layer.** `--background`/`--foreground`/`--surface`/`--surface-muted`/`--border`/`--accent`/`--accent-foreground` already existed as the single source of color for every page (confirmed via `ui-theming`); changing their values in `globals.css` alone recolors the whole app. No component needed to change to pick up the new palette.

**Scoreboard imagery: derive logo URLs from a predictable CDN path keyed by abbreviation, rather than relying on ESPN's scoreboard payload.** ESPN's scoreboard endpoint's competitor shape doesn't include a `logos` array (confirmed against a live response), unlike the richer summary endpoint `LiveGameDetail` already reads from. Every stored team's `logoUrl` already resolves to `https://a.espncdn.com/i/teamlogos/nba/500/{abbreviation.toLowerCase()}.png`, and that pattern holds for all 30 teams with no exceptions (checked against the full `/api/teams` list) — so `getScoreboard` falls back to building that URL from the competitor's abbreviation when `logos` isn't present, rather than requiring a second API call per game.

**Players/teams list imagery reuses already-present API fields (`headshotUrl`, `currentTeam.color`, team `color`/`alternateColor`) — no backend change needed there.** Only the scoreboard needed an API extension; `/api/players` and `/api/teams` already returned everything the new card treatments need.

## Risks / Trade-offs

- **[Risk]** `FullBleed`'s derivation assumes `Sidebar` stays exactly `lg:w-52` and the content column's padding stays symmetric (`px-6` on `<main>`). Either changing without updating `FullBleed`'s `6.5rem`/`13rem` constants reintroduces the overlap. → Mitigation: `FullBleed.tsx`'s doc comment states the dependency explicitly; any future sidebar-width change should grep for `13rem`/`6.5rem` in `FullBleed.tsx`.
- **[Risk]** The scoreboard's logo-URL fallback assumes ESPN's abbreviation always matches the lowercase CDN slug. Verified true for all 30 current teams, but a relocated/rebranded franchise with a new abbreviation could break it silently (rendering a 404 image, caught by `CircularBadge`'s existing fallback-on-error). → Mitigation: `CircularBadge` already degrades to a placeholder on image load failure, so a mismatch fails gracefully rather than breaking the page.
- **[Trade-off]** Condensed display type at very small sizes (e.g. dense table headers) would hurt legibility, so the `h1`/`h2`/`h3`-only selector deliberately doesn't extend to smaller heading-like text (e.g. `text-xs font-semibold` section labels in game/player tabs), which keep the body typeface. Accepted as the correct legibility trade-off, not an oversight.

## Migration Plan

This change's code is already implemented and verified (typecheck, build, and live Playwright screenshots in both themes across the affected pages) prior to this document being written, as an iterative follow-up to the prior app-shell change. Remaining work is formalizing it as tracked tasks (tasks.md) for the record; no further rollout steps are needed. Rollback, if ever needed, is per-file: `FullBleed` usage, the font/color token changes, and each list page's imagery addition are independent and revertible without affecting the others.
