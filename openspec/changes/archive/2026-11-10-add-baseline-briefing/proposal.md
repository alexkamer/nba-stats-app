# Proposal

## Why

Right now a user has to visit several pages (scoreboard, standings, news, betting) to piece together "what happened last night and what's worth watching tonight." A single minimalist, newsletter-style page — read top to bottom once a day — gives that recap/preview without the live-dashboard density of the home page.

## What Changes

- Add a new standalone page, **Baseline Briefing**, at `/briefing` (today) and `/briefing/[date]` (past days), paged with prev/next-day controls — no separate archive index.
- Page is single-column and date-scoped: yesterday's final scores, top performers (existing daily PRA leader/triple-double callout plus a plain top-5-by-points list), headlines, tonight's injury report, a static (non-historical) standings snapshot, tonight's schedule with system picks vs. market line, and an embedded Best Bets (Initial view) strip with a "yesterday's Best Bets record" callback.
- Archive is recap-only: for a past date, only inherently date-scoped sections render (scores, top performers, schedule-that-was, Best Bets + grading); standings, injuries, and headlines are omitted on past-day views rather than showing today's live data under a stale date.
- Add a new primary-navigation entry for the page, per the existing app-shell-navigation pattern.
- Add a once-per-day, agent-generated one-line summary of the day's games (e.g. "14 games, 1 triple-double, 3 OT finishes"), generated from already-computed digest facts (not raw box scores) by a small locally-hosted model via Ollama, persisted on first generation for that date and reused on every later view of the same date rather than regenerated per request.
- No new secret is needed for the summary generation call — it runs against a local Ollama server, not a cloud API.

## Capabilities

### New Capabilities
- `daily-briefing-page`: the Baseline Briefing page itself — the `/briefing` and `/briefing/[date]` routes, which sections appear for today vs. a past date, prev/next-day navigation, and the page's navigation entry.
- `briefing-summary-generation`: the once-per-calendar-date, agent-generated one-line recap summary — what it's given as input, when it's generated, and that it's persisted and reused rather than regenerated on every view.

### Modified Capabilities
(none — the page composes existing capabilities such as `best-bets-selection`, `prediction-accuracy-tracking`, `daily-stat-leader-tracking`, and `player-availability-tracking` as read-only consumers, without changing their requirements. `app-shell-navigation`'s existing navigation/breadcrumb requirements already apply to this new page without needing a requirement change.)

## Impact

- New routes: `src/app/briefing/page.tsx`, `src/app/briefing/[date]/page.tsx`, and a backing API route (or routes) to assemble a date's briefing data server-side.
- New Prisma model to persist the per-date generated summary line (date key, text, generated-at).
- Generation calls a local Ollama server (no new npm dependency — a thin `fetch`-based client), used only by the summary-generation step.
- Optional env var `OLLAMA_HOST`, only needed if Ollama isn't reachable at its localhost default. No secret/API key required at all.
- New top-5-by-points-for-a-date query over existing `PlayerGameStat`/`Game` data (no new model).
- Sidebar/mobile nav gains one new top-level entry (per `app-shell-navigation`).
- No schema or behavior changes to existing capabilities.
