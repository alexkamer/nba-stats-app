# Proposal

## Why

The game detail page at `/games/[eventId]` has five tabs (Gamecast, Recap, Box Score, Play-by-Play, Team Stats). Gamecast, Box Score, and Play-by-Play are fully built; Recap and Team Stats are both literal `"Coming soon."` placeholders. ESPN's own summary API — already fetched by this page for odds, win probability, and shot charts — carries everything needed to fill both in: a full recap article (`article.story`) and a 23-category team stat breakdown (`boxscore.teams[].statistics`), neither of which is currently extracted.

## What Changes

- Add a `getRecapArticle`-style extraction to the live ESPN proxy layer (`src/lib/espn-live.ts`) that pulls the post-game recap (headline, source, published date, body text) from the summary payload's `article` field, guarded to only surface it when `article.type === "Recap"` (a future/in-progress game may carry a pregame `"Preview"` article instead, or none at all).
  - The `story` field is HTML from a third party; it must be rendered as plain text (tags stripped, paragraph breaks preserved), never injected via `dangerouslySetInnerHTML`.
  - `article.images` are ESPN's generic recirculation thumbnails (frequently unrelated to the actual game), not a photo of the game — the Recap tab must not use them as a hero image.
- Add a team-stats-breakdown extraction alongside it that pulls every named stat (`boxscore.teams[].statistics[]`, e.g. FG, FG%, rebounds, fast break points, points in paint, largest lead, etc.) per team, keyed by their existing ESPN team id, using ESPN's own pre-formatted `displayValue`/`label` rather than re-deriving splits.
- Both extras flow through `GameSummaryExtras` (`getGameSummaryExtras`) the same way `headerExtras`/`winProbability`/`shots` already do, so they populate for both the `db`-backed and `live`-proxied branches of `GET /api/games/[eventId]`.
- Replace the `"Coming soon."` placeholder for the Recap tab in `src/app/games/[eventId]/page.tsx` with a headline/byline/body-paragraphs view, falling back to an empty-state message when no recap article is available.
- Replace the `"Coming soon."` placeholder for the Team Stats tab with a full away/home comparison table of all 23 stat categories, reusing the Box Score tab's existing table styling, falling back to an empty-state message when the game has no box score yet (scheduled/very-early-in-progress games).

## Capabilities

### New Capabilities
- `game-recap`: Fetching, sanitizing, and presenting a game's post-game recap article (headline, byline, body) on the game detail page, with correct empty-state behavior when no recap exists yet.
- `game-team-stats`: Fetching and presenting the full per-team statistical category breakdown (beyond the handful of persisted/summarized fields) on the game detail page's Team Stats tab.

### Modified Capabilities
_None — Gamecast, Box Score, and Play-by-Play are unaffected; no existing spec covers the game detail page today._

## Impact

- `src/lib/espn-live.ts`: new `extractRecap`/`extractTeamStatsBreakdown`-style functions, new types, extended `GameSummaryExtras` return shape.
- `src/app/api/games/[eventId]/route.ts`: no structural change expected — the extras already pass through `headerExtras`/`winProbability`/`shots` verbatim; the new fields ride along the same object.
- `src/app/games/[eventId]/page.tsx`: new `RecapTab`/`TeamStatsTab`-equivalent view sections; updated `ApiResponse`/`DbGame`/`LiveGame`/`HeaderExtras`-adjacent types to carry the new fields.
- No database schema changes — both extras are pulled live and never persisted, consistent with how `headerExtras`, `winProbability`, and `shots` are already handled for this page.
