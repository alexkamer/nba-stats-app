# Design

## Context

Today's shell is a single `<header>` in `src/app/layout.tsx` rendering `SiteNav` (a flat, five-link row that collapses behind a hamburger below the `sm` breakpoint) and a centered `max-w-6xl` `<main>`. There's no breadcrumb anywhere. Stat tiles are duplicated three times with near-identical markup (`HeroStat` in the player page, `AccuracyTile` in the betting page, `Stat` in the player page) and crest images are a mix of plain square `<img>` and ad hoc `rounded-full` + `object-cover` + `bg-surface-muted` usage repeated at different call sites. Theming (`ui-theming`) and per-team accent color (`team-accent-theming`) are both existing, stable specs that the new components must consume, not duplicate or bypass. See `proposal.md` - Why for the motivation.

## Goals / Non-Goals

**Goals:**
- Introduce one app shell layout (sidebar + mobile top bar/hamburger + breadcrumb) that every page renders through, replacing the current `SiteNav`-only header.
- Introduce one `StatBlock` component and one `CircularBadge` component, each used everywhere their respective spec applies, replacing the duplicated one-offs.
- Prove both new components on the betting page first, since it already has the closest existing analogs (`AccuracyTile`, `ConfidenceMeter`), before touching team/player/game pages.

**Non-Goals:**
- Migrating team, player, or game detail pages to the new components is not required for this change to be considered complete (tracked as follow-on work; the betting-page migration is what proves the API).
- No changes to `ui-theming` or `team-accent-theming` behavior - the new components consume existing tokens and the existing `accentColor` prop convention as-is.
- No new routes, no breadcrumb data source beyond what's already derivable from the existing route structure (no CMS-driven nav config).

## Decisions

**Sidebar breakpoint: `lg` (1024px), not `sm`.** A sidebar needs materially more horizontal room than a link row; collapsing it as late as `sm` (640px) would force the sidebar onto viewports too narrow to hold both it and content. `lg` is also a clean break from the existing `sm:` collapse used for today's flat nav, so the two can't be confused during rollout. Below `lg`, render the mobile top bar + hamburger (reusing the current `SiteNav` hamburger behavior, retargeted at the same section list the sidebar shows).

**Breadcrumb source: derived from the route path, not a separate config.** Every current route (`/teams/[teamId]`, `/players/[athleteId]`, `/games/[eventId]`, `/betting/research/[playerId]`) already encodes its hierarchy positionally. Deriving breadcrumb segments from the route plus the page's already-fetched entity name (team/player/game) avoids introducing a second source of truth for navigation structure that could drift from the actual routes.

**`StatBlock` API shape:** `{ label, value, caption?, comparison?: { pct: number; color? } }`. This directly generalizes the three existing tiles: `HeroStat`'s `rank` becomes `caption`, `AccuracyTile`'s `correct/graded` becomes `caption`, and `ConfidenceMeter`'s bar becomes the optional `comparison`. Keeping `comparison` optional (per the `stat-block-display` spec's "may show a comparison bar" requirement) means plain totals render with no bar, matching today's `Stat` component's simpler look.

**`CircularBadge` API shape:** `{ src?, alt, size, fallback?: ReactNode }`, rendering a fixed-size circular container with `object-cover` image or a neutral placeholder - sized via a small enum (`xs`/`sm`/`md`/`lg`) rather than arbitrary pixel props, so every call site picks from the same scale instead of reintroducing ad hoc sizes (today's code uses `h-4 w-4` through `h-14 w-14` inconsistently across similar contexts).

**Result/status marks (`BettableMark`, `ResultMark`) wrap in `CircularBadge` at a new `xs` size** rather than getting their own component, per the `entity-badge-display` spec's requirement that compact indicators share the identity-badge shape.

**Migration order: shell first, components second, betting-page swap third.** The shell change is purely additive to layout (no existing page markup depends on `SiteNav`'s internals beyond the import), so it can land without touching any page. The components are new files with no consumers until step three. Swapping the betting page's `AccuracyTile`/`AccuracyStrip`/`ConfidenceMeter`/`BettableMark`/`ResultMark` and crest `<img>`s to the new components is the only step that touches existing page behavior, and it's scoped to one file.

## Risks / Trade-offs

- **[Risk]** Moving crest images from unclipped squares to circular crops can clip non-circular logos (some team logos are wordmarks or non-circular marks) awkwardly. → Mitigation: use `object-cover` with a centered position (already the convention at the `rounded-full` call sites that exist today) and size the badge generously enough that typical NBA team logos (circular or near-square marks) aren't visibly cut off; spot-check all 30 team logos during the betting-page migration before rolling further.
- **[Risk]** Introducing a sidebar changes the page's available content width, which could reflow dense tables (standings, box scores) awkwardly even though this change doesn't touch those pages' internals yet. → Mitigation: keep `<main>`'s existing `max-w-6xl` content width unchanged and add the sidebar as additional width alongside it (not by shrinking the content column), so pages not yet migrated see no layout change in their content area.
- **[Trade-off]** Deriving breadcrumbs from route + entity name means a page with a genuinely non-linear hierarchy (none exist today) would need special-casing later. Accepted since no current route needs it.

## Migration Plan

1. Build the app shell (sidebar, mobile top bar/hamburger, breadcrumb) in a new layout component; swap it into `src/app/layout.tsx` in place of the current `<header>`/`SiteNav`-only arrangement. No other page changes required at this step.
2. Build `StatBlock` and `CircularBadge` as new files under `src/components/`, with no existing call sites changed yet.
3. Migrate `src/app/betting/page.tsx`'s `AccuracyTile`, `AccuracyStrip`, `ConfidenceMeter`, `BettableMark`, `ResultMark`, and crest `<img>` usage to the new components.
4. Validate visually in both light and dark themes (per `ui-theming`) and against at least one team's accent color (per `team-accent-theming`) before considering this change done.

Rollback is low-risk: each step is additive or scoped to one file, so any step can be reverted independently without affecting the others.
