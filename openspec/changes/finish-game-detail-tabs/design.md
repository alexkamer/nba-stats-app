# Design

## Context

`src/lib/espn-live.ts` already fetches one ESPN `/summary` response per game detail request and extracts several never-persisted "extras" from it (`headerExtras`, `winProbability`, `shots`) via `getGameSummaryExtras`, which both branches of `GET /api/games/[eventId]` (DB-backed and live-proxied) call identically. See proposal.md - Why for why the Recap and Team Stats tabs are still stubs despite the underlying data already being one fetch away.

The same `/summary` response (confirmed against `ingest/__fixtures__/summary.json`) carries:
- `article`: `{ type, headline, description, source, originallyPosted, story (HTML string), images[] }`. `images[0]` is ESPN's generic "trending" sidebar thumbnail, observed in fixture data to be unrelated to the actual game (e.g. an unrelated video teaser on a Knicks-76ers recap).
- `boxscore.teams[]`: `{ team: { id }, statistics: [{ name, label, abbreviation?, displayValue }] }`, 23 entries per team in the fixture, already formatted (e.g. `"46-86"`, `"53"`) — no need to re-derive splits the way `ingest/mappers/boxscore.ts` does for the 12 fields it persists.

## Goals / Non-Goals

**Goals:**
- Extract both the recap article and the full stats breakdown using the same "pulled live, never persisted, available to both DB- and live-sourced games" pattern already established for `headerExtras`/`winProbability`/`shots`.
- Keep the Recap tab's rendering strictly text-only (no HTML injection).

**Non-Goals:**
- Changing how the 12 fields already persisted in `TeamGameStat` are computed or stored — the full stats breakdown is an additional, separate, non-persisted field, not a replacement.
- Deep-linking recap body text to internal player/team pages — the source body's embedded links point to espn.com, not this app's routes, and are dropped along with all other markup.
- A "Full Story" outbound link to ESPN — out of scope for this change; can be added later from `article.links.web.href` if desired.

## Decisions

### Strip HTML from `article.story` to plain text rather than sanitizing and rendering it
**Why:** The field is prose from a third-party wire source (AP, via ESPN) delivered as an HTML string. Rendering it with `dangerouslySetInnerHTML` — even after allowlist sanitization — adds an XSS surface and a new sanitization dependency for a payload whose only structural content (`<a>` tags to espn.com) isn't actionable in this app anyway.
**Alternative considered:** Sanitize with an allowlist (e.g. permit only `<a>`, rewrite `target="_blank" rel="noopener"`) and render as HTML. Rejected: adds a dependency and an XSS-review burden for links that don't go anywhere useful in-app (they point to espn.com, not `/players/[id]`).
**Approach:** Strip all tags with a regex (keep inner text), then split on blank lines into paragraphs, trimming each. Same plain-text rendering style already used throughout this page (e.g. odds/game-info cards).

### Don't use `article.images` as a Recap hero image
**Why:** Observed in fixture data to be ESPN's generic cross-promotional thumbnail, not a photo from the actual game — showing it next to a specific game's recap would misrepresent it.
**Alternative considered:** Show `images[0]` as a hero banner, matching ESPN's own recap page layout. Rejected based on the fixture evidence that this field isn't reliably about the game in question.

### Render the full stats breakdown as a plain comparison table, not a bar chart
**Why:** The existing Gamecast sidebar `TeamStatsCard` already renders a bar-style comparison, but it hand-picks 5 stats chosen for having a natural 0-100 scale (percentages, or two counts that sum meaningfully). Several of the 23 raw categories (e.g. `largestLead`, `technicalFouls`) have no such natural scale, and ESPN pre-formats every value as a display string already. A plain table avoids inventing a bar-fill heuristic per stat name.
**Alternative considered:** Extend the bar-chart treatment to all 23 categories, classifying each as "pct" or "count" like the existing 5-row card does. Rejected as added classification complexity for categories where a bar doesn't add information (e.g. "Largest Lead: 12" doesn't benefit from a fill bar).

### Keep all 23 categories rather than curating a subset
**Why:** ESPN already supplies clean `label`s for each; curating risks arbitrarily dropping a stat a user cares about, and the full list matches ESPN's own Team Stats tab.
**Alternative considered:** Curate to a "core" subset similar to the Gamecast card. Rejected as redundant with that card, which already exists for the common case.

### Extraction functions live in `espn-live.ts`, threaded through the existing `GameSummaryExtras` return shape
**Why:** Matches the single-fetch-per-request pattern already in place; adding fields to the existing return object (rather than new separate fetches) avoids a second ESPN round-trip per game detail request.

## Risks / Trade-offs

- [Risk] ESPN may omit `article` or report a different `type` string for games with no recap (scheduled/very early in-progress games), leaving the extraction to guess at "no recap" vs. "recap not yet written." → Mitigation: treat anything other than an exact `type === "Recap"` match, or a missing `article`, as "no recap available" (explicit empty state, not a broken render) — matches existing fallback patterns on this page (e.g. the odds panel's "No odds available for this game.").
- [Risk] The regex-based tag strip could mishandle unusual markup (e.g. nested tags, HTML entities) and leave a malformed-looking paragraph. → Mitigation: low severity (a cosmetic artifact in recap text, not a security issue) given tags are already being discarded rather than interpreted; acceptable given the alternative (a sanitization dependency) is disproportionate for this one text field.
- [Risk] `boxscore.teams[]` statistic arrays could differ in category count/order between games (e.g. future ESPN schema changes) — zipping by array position would silently misalign labels and values. → Mitigation: zip each team's categories by `name` (the stable machine key), not by array index.

## Migration Plan

No data migration — both extras are additive, non-persisted fields on an existing live-fetched object. Deploys as a normal code change; no rollback concerns beyond reverting the commit.
