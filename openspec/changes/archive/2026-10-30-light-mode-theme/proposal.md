# Proposal

## Why

The app currently has only one hardcoded dark color scheme — no CSS variables, no theme tokens, no toggle — spread as literal Tailwind classes (`bg-neutral-950`, `text-neutral-100`, etc.) across ~11 files. The user wants a light-first experience with a light/dark toggle, and wants this rework to also introduce a proper token-driven design system rather than a straight color inversion, including dynamic per-team accent colors sourced from data ESPN already provides.

## What Changes

- Introduce a CSS-variable-based theme system (Tailwind v4 `@theme` tokens: background, foreground, surface, border, accent) with light and dark value sets.
- Add a theme toggle (e.g. via `next-themes`), persisted across sessions, defaulting to **light** for first-time visitors.
- **BREAKING**: Replace all ~624 hardcoded dark-only Tailwind utility classes across `layout.tsx`, the three `[param]` detail pages (`games/[eventId]`, `teams/[teamId]`, `players/[athleteId]`), `standings`, `page.tsx`, `news`, `players`, `teams` index pages, `TabPager.tsx`, and `SectionCard.tsx` with references to the new semantic tokens.
- Add dynamic accent theming: team pages and player pages use the team's ESPN `color`/`alternateColor`; game detail pages use a split/dual accent (home vs away team colors); pages with no single team context (home, standings, players index, news) use a neutral fallback brand accent.
- Visual refresh of card/surface treatment and typography accompanying the new light palette (not a 1:1 color inversion of the current dark design).

## Capabilities

### New Capabilities
- `ui-theming`: Light/dark theme system — CSS variable tokens, toggle control, persistence, default-light behavior, and the token contract every page/component must use instead of hardcoded colors.
- `team-accent-theming`: Dynamic per-page accent color derived from ESPN team brand colors (team pages, player pages, split accent on game pages) with a neutral fallback where no single team context exists.

### Modified Capabilities
- (none — no existing specs in this project yet)

## Impact

- **New dependency**: `next-themes` (or equivalent small theme-context library).
- **Rewritten**: `src/app/globals.css` (theme tokens), `src/app/layout.tsx` (provider + toggle), and the ~11 files currently using hardcoded dark Tailwind classes.
- **Reused as-is**: existing ESPN team color fields already typed and fetched in `src/lib/espn-teams-list.ts`, `src/lib/espn-player-profile.ts`, `src/lib/espn-live.ts` — no new data fetching required.
- No API or data-layer changes; this is a frontend presentation-layer change only.
