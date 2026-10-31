# Tasks

## 1. App shell: sidebar, mobile top bar, breadcrumb

- [x] 1.1 Build a `Breadcrumb` component that derives its trail from the current route plus an optional page-provided entity name (team/player/game), and verify it renders the correct trail on `/`, `/teams/[teamId]`, `/players/[athleteId]`, `/games/[eventId]`, and `/betting/research/[playerId]` in a manual check.
- [x] 1.2 Build a sidebar nav component listing the app's top-level sections (Standings, Teams, Players, News, Betting), visible at `lg` and above, and verify it renders alongside page content without covering it at a `lg`-width viewport.
- [x] 1.3 Extend the existing mobile hamburger behavior (from `SiteNav`) to show below `lg`, replacing the sidebar with a top bar + hamburger that reveals the same section list, and verify the menu opens/closes correctly at a sub-`lg` viewport.
- [x] 1.4 Wire the sidebar, mobile top bar, and breadcrumb into `src/app/layout.tsx` in place of the current header-only `SiteNav`, keeping `<main>`'s `max-w-6xl` content width unchanged, and verify every existing route still renders its content at the same width as before.
- [x] 1.5 Verify the full shell (sidebar, mobile top bar, hamburger, breadcrumb) renders correctly in both light and dark theme by toggling the theme on at least one page of each route type.

## 2. Shared components: StatBlock and CircularBadge

- [x] 2.1 Build `StatBlock` with the `{ label, value, caption?, comparison?: { pct, color? } }` API from design.md, and verify it renders label+value with no comparison bar when `comparison` is omitted, and with a filled bar matching `pct` when provided.
- [x] 2.2 Verify `StatBlock` renders a `"—"` placeholder when `value` is null/unavailable, matching the `stat-block-display` spec's "Value is unavailable" scenario.
- [x] 2.3 Build `CircularBadge` with the `{ src?, alt, size, fallback? }` API and a fixed `xs`/`sm`/`md`/`lg` size scale, and verify it renders a circular `object-cover` image when `src` is provided.
- [x] 2.4 Verify `CircularBadge` renders a neutral circular placeholder at the correct size when `src` is omitted or fails to load.

## 3. Migrate the betting page to the new components

- [x] 3.1 Replace `AccuracyTile`/`AccuracyStrip` in `src/app/betting/page.tsx` with `StatBlock`, preserving the existing label/hitRate/correct-of-graded data mapping, and verify the accuracy strip renders identically (same figures) to before the swap.
- [x] 3.2 Replace `ConfidenceMeter` with `StatBlock`'s `comparison` bar, preserving the existing edge-ratio-to-percentage calculation and the bettable/non-bettable color distinction, and verify a pick row's confidence bar fills to the same proportion as before the swap.
- [x] 3.3 Replace `BettableMark` and `ResultMark` with `CircularBadge` at the `xs` size per design.md, preserving their existing hit/miss/high-confidence meaning, and verify both marks still render correctly on a graded and an ungraded pick row.
- [x] 3.4 Replace team/opponent crest `<img>` usage on the betting page (`TeamLabel` and any other crest call sites in `src/app/betting/page.tsx`) with `CircularBadge`, and verify logos render as circular badges with no visible clipping across a sample of team logos.
- [x] 3.5 Verify the fully migrated betting page in both light and dark theme, and against at least one team's accent color, confirming no regression in the existing accuracy/confidence/result data shown.

## Workflow follow-up

- Team, player, and game detail page migration to `StatBlock`/`CircularBadge` (`HeroStat`, `Stat`, and existing crest `<img>` usage) is tracked as follow-on work once the betting-page migration proves the component API, per design.md's Non-Goals.
- Archive this change after the betting-page migration has been reviewed and confirmed to match pre-migration behavior.
