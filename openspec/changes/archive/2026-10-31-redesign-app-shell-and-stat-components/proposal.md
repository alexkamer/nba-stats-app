# Proposal

## Why

The app's visual language has grown ad hoc: three different pages each reimplement the same "label + big number + caption" stat tile (`HeroStat` on the player page, `AccuracyTile` on the betting page, `Stat` on the player page), team/player crests are rendered inconsistently (some `rounded-full`, most plain square `<img>`), and there's no breadcrumb or persistent section nav — just a flat top bar with five links. A sports-stats reference design (SCORES24) demonstrates a more systematic alternative: a responsive app shell (sidebar nav on desktop, collapsing to a top bar + hamburger on mobile) with a breadcrumb trail, plus one reusable stat-block pattern (headline number chip + optional comparison bar) and a unified circular badge treatment for team/player identity, applied consistently everywhere stats or entities are shown. Standardizing now, starting from the betting page where the closest existing analogs already live, turns incidental duplication into a shared, consistent vocabulary before more pages copy the one-off versions.

## What Changes

- Add a responsive app shell: persistent section navigation rendered as a left sidebar on desktop and collapsing to a top bar with a hamburger menu on mobile (replacing today's flat top-only nav), plus a breadcrumb trail shown above each page's content.
- Add a shared `StatBlock` component (headline number chip + label + optional comparison bar) to replace the duplicated `HeroStat`, `AccuracyTile`, and `Stat` implementations.
- Add a shared circular badge component for team/player crests and compact result indicators, replacing today's inconsistent mix of square and rounded `<img>` usage.
- Roll the new `StatBlock` and badge components out to the betting page first (replacing `AccuracyTile`, `ConfidenceMeter`, and crest `<img>` usage there), proving the components before adopting them on team, player, and game detail pages.
- **BREAKING**: None of this changes any API or data contract — it's presentation-only. No breaking changes to persisted data, routes, or external interfaces.

## Capabilities

### New Capabilities
- `app-shell-navigation`: Defines the persistent, responsive navigation shell (sidebar on desktop, top bar + hamburger on mobile) and the breadcrumb trail shown above page content.
- `stat-block-display`: Defines the shared stat-block pattern (headline number + label + optional comparison bar) used consistently anywhere the app shows a statistical figure.
- `entity-badge-display`: Defines the shared circular badge treatment used for team/player crests and compact result/status indicators.

### Modified Capabilities
(none — existing `team-accent-theming` and `ui-theming` specs govern color/theme tokens and are consumed as-is by the new components, with no change to their own requirements)

## Impact

- `src/app/layout.tsx`, `src/components/SiteNav.tsx` — replaced/restructured into the new app shell (sidebar + mobile top bar + hamburger).
- New shared components under `src/components/` (e.g. `StatBlock`, `CircularBadge`, `Breadcrumb`) extracted from page-local code.
- `src/app/betting/page.tsx` — `AccuracyTile`, `AccuracyStrip`, `ConfidenceMeter`, and team/opponent `<img>` crest usage migrate to the new shared components first.
- `src/app/players/[athleteId]/page.tsx` (`HeroStat`, `Stat`), `src/app/teams/[teamId]/page.tsx`, `src/app/games/[eventId]/page.tsx` — later adopters of the same components (follow-on, not required for this change's acceptance, but informs the component API design).
- No API, database, or route changes.
