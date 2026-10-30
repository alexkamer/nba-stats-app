# Design

## Context

See proposal.md - Why. Today there is no theme system at all: `src/app/globals.css` only defines font variables, and every page/component hardcodes dark-only Tailwind classes (`bg-neutral-950`, `text-neutral-100`, `border-neutral-800`, etc.) across 11 files (~624 occurrences, concentrated in the three `[param]` detail pages). There is no `dark` class usage, no CSS variables, no toggle, and no theming library in `package.json`. ESPN team data (`color`/`alternateColor` hex strings, no leading `#`) is already fetched and typed in `src/lib/espn-teams-list.ts`, `src/lib/espn-player-profile.ts`, and `src/lib/espn-live.ts`.

## Goals / Non-Goals

**Goals:**
- Establish a token-driven theme system (not a one-off palette swap) that both current and future UI can build on.
- Make light the default, dark fully supported and persisted.
- Wire existing ESPN team colors into page-level accents without new data fetching.
- Use this rework as a styling refresh opportunity (surface/card treatment, typography), not a mechanical color inversion.

**Non-Goals:**
- No changes to data fetching, API routes, or ESPN ingestion logic.
- No per-user server-side theme storage (client-side persistence only).
- No theming beyond color tokens (e.g. no layout restructuring, no new pages).

## Decisions

### Theme mechanism: `next-themes` + Tailwind v4 `@theme` CSS variables
Use `next-themes` for the `dark` class toggle, system/no-flash handling, and localStorage persistence, paired with Tailwind v4's CSS-variable-based `@theme` block in `globals.css` defining `--background`, `--foreground`, `--surface`, `--border`, `--accent` (and muted/subtle variants) with light values as the base and dark overrides under `.dark`.
- **Alternatives considered**: hand-rolled React context + `localStorage` — rejected because `next-themes` already solves the flash-of-wrong-theme problem (via an inline script before hydration) and is a well-worn, tiny dependency; reinventing it adds risk for no benefit.

### Default theme: light, with persisted override
`next-themes` is configured with `defaultTheme="light"` and `enableSystem={false}` — the spec calls for light-by-default for new visitors, not OS-preference-based default, so system detection is explicitly disabled to avoid surprising a visitor whose OS prefers dark.

### Token rewrite strategy: semantic tokens, not shade-for-shade mapping
Rather than defining `--neutral-950-equivalent` tokens and doing a mechanical find-replace, define a small set of semantic tokens (`background`, `foreground`, `surface`, `surface-muted`, `border`, `accent`, `accent-foreground`) and manually re-derive each of the ~624 occurrences to the semantically correct token. This is slower than regex replace but is what makes the "visual refresh" goal (proposal.md) possible, and avoids baking today's ad-hoc gray choices into the new system.
- **Alternatives considered**: scripted regex replace of `gray-900`→`background`, etc. — rejected; it would preserve the current design's inconsistencies (e.g. the same visual role using different gray shades in different files) rather than fixing them.

### Dynamic accent: computed per-page, not globally, via a small color-contrast guard
Team/player/game pages compute their accent at the page/layout level (server or client component wrapping the page) by reading the fetched team's `color`/`alternateColor`, applying a contrast check against the active theme's background, and falling back to the neutral brand accent when the color is missing or fails a minimum contrast threshold. This logic lives in one small shared utility (e.g. `getTeamAccent(color, theme)`), not duplicated per page.
- **Alternatives considered**: CSS custom property set directly from inline style per page with no contrast guard — rejected because several NBA team colors (e.g. very light yellows) are illegible on a light background without adjustment, and the spec (team-accent-theming) explicitly requires graceful fallback.

### Game pages: dual accent via CSS custom properties, not two parallel class sets
Game detail pages set two CSS custom properties (`--accent-home`, `--accent-away`) scoped to the page root, and components reference whichever is relevant (e.g. a box score column uses `--accent-home` or `--accent-away` depending on which team's data it renders), rather than maintaining duplicated light/dark/home/away class variants.

## Risks / Trade-offs

- **[Risk] Manual, semantic (non-regex) rewrite of 624 class occurrences across 3 large detail pages is time-consuming and error-prone.** → Mitigation: rewrite and visually verify one page at a time (games, teams, players, then the smaller files), running the app locally after each to catch regressions before moving to the next.
- **[Risk] Some ESPN team colors have poor contrast in one theme (e.g. dark yellow on dark background, or vice versa).** → Mitigation: contrast-guard fallback to neutral accent, defined as a requirement in team-accent-theming spec.
- **[Risk] `next-themes`' inline no-flash script requires the root layout to allow a client script before hydration; may need `suppressHydrationWarning` on `<html>`.** → Mitigation: standard, documented `next-themes` App Router setup; low risk, well-trodden path.

## Open Questions

- Exact token palette values (specific hex/oklch values for background/surface/accent in both themes) — left to implementation/visual iteration, does not change the spec or task breakdown.
