# Proposal

## Why

After the app-shell change (sidebar, stat blocks, badges) shipped, the app still felt like "just another boring sports page": same default font, same muted orange accent, flat list pages with no team logos or player headshots, and — more seriously — a real layout bug where the new sidebar overlapped the game/team/player header bands on every detail page. The sidebar broke an existing full-bleed CSS trick that assumed the page was centered in the full viewport; now that a persistent sidebar eats part of that viewport, every page using the trick needs fixing, not just the one page where it was first noticed. Addressing the bug and the "boring" feedback together, since both are about how content area width and the app's look actually need to account for the sidebar that now exists.

## What Changes

- Fix full-bleed header/grid sections on game, team, and player detail pages so they span the content area (right of the sidebar) instead of the full viewport, eliminating the sidebar overlap.
- Introduce a distinct visual identity: a condensed display typeface for headings and stat numbers (replacing the default font), a new accent color and warmer neutral background/surface palette, and flatter (border-less) card treatment for stat blocks and the sidebar.
- Add team logos and a team-color gradient to the home page's scoreboard cards and the teams list page (previously flat, logo-less or small-logo cards).
- Add player headshots and a team-color accent stripe to the players list page (previously text-only rows).
- Extend the scoreboard API to return each game's team logo URL and brand color, needed for the home page's new imagery (previously only abbreviation/name/score).

## Capabilities

### New Capabilities
- `full-bleed-content-layout`: Defines how a page section breaks out of the centered content column to span the full content area width, without overlapping persistent navigation chrome (the sidebar).
- `visual-identity`: Defines the app's typography (display vs. body typefaces) and color palette tokens used across all pages.
- `roster-imagery`: Defines where team logos and player headshots appear in list/card views (scoreboard, teams list, players list) and how they degrade gracefully when an image is unavailable.

### Modified Capabilities
(none — `team-accent-theming` and `ui-theming` still govern per-team accent selection and light/dark token switching exactly as before; this change adds new tokens and imagery on top without changing either spec's existing requirements)

## Impact

- `src/components/FullBleed.tsx` (new) — shared full-bleed breakout component; replaces inline viewport-breakout markup in `src/app/games/[eventId]/page.tsx`, `src/app/teams/[teamId]/page.tsx`, and `src/app/players/[athleteId]/page.tsx`.
- `src/app/globals.css`, `src/app/layout.tsx` — new font imports (Inter, Barlow Condensed) and color token values.
- `src/components/StatBlock.tsx`, `src/components/Sidebar.tsx`, `src/components/SiteNav.tsx` — restyled for the new typography/density.
- `src/app/page.tsx`, `src/app/teams/page.tsx`, `src/app/players/page.tsx` — card imagery additions.
- `src/lib/espn-live.ts` — `ScoreboardGameCard`'s `home`/`away` shapes gain `logoUrl`/`color`.
- No breaking changes to persisted data or routes; the scoreboard API response gains fields, it doesn't remove or rename any.
