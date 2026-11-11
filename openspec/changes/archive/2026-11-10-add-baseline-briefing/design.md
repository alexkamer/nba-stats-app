# Design

## Context

See `proposal.md` - "Why" / "What Changes" for motivation. Relevant existing conventions this builds on:

- No fixed "league timezone" exists anywhere in the codebase; the closest precedent (Best Bets day-keying in `src/app/api/betting/upcoming/route.ts`) just uses the server process's local `new Date()` to derive a `YYYY-MM-DD` day key. The briefing reuses that same convention rather than introducing an Eastern-time rule.
- `DailyBestBet` is the existing precedent for "frozen once, read many times" per-day state (`@@unique([date, playerId, statType])`, written once per day, never rewritten for a date once set). The generated summary line follows the same shape: one row per date, written once.
- The home page (`src/app/page.tsx`) is the precedent for assembling several existing read-only API routes client-side with TanStack Query and `SectionCard`. The briefing page follows the same data-fetching pattern but renders single-column instead of `SectionCard`'s grid, and is server-composed per date rather than always "today."
- No LLM SDK or API key exists anywhere in this project today (checked `package.json`, `.env`).

## Goals / Non-Goals

**Goals:**
- Reuse existing read-only data (scoreboard, `DailyStatLeader`, `PlayerAvailability`, news, standings, `DailyBestBet`, grading) without modifying any of those capabilities.
- Keep the generation call cheap and deterministic-per-date: one call per calendar date, ever, fed a small fact payload.
- Keep archived (past-date) views honest: never show current-moment data (standings/injuries/headlines) under a stale date label.

**Non-Goals:**
- No true point-in-time snapshot of standings/injuries/headlines (that's the "Option A" archive design explicitly rejected during exploration).
- No day-over-day standings deltas ("movers") — out of scope for this change.
- No personalization or per-user state.
- No retroactive backfill of past summaries for dates before this change ships — the summary table only starts filling in from the date this ships forward (same as any other "starts tracking from today" capability in this codebase, e.g. `TeamCoverRecord`).

## Decisions

### Date-scoped data assembly: one route, parameterized by date
`/briefing` and `/briefing/[date]` both render the same page component, with `/briefing` resolving to today's local date server-side (redirect or direct render — implementation detail for tasks.md) and `/briefing/[date]` validating the date is not in the future. A single backing API route (e.g. `/api/briefing?date=YYYY-MM-DD`) assembles the date's payload server-side by calling into existing lib functions (`daily-best-bets.ts`, standings query, news query, etc.) rather than the client fanning out to 7 separate endpoints like the home page does — this keeps "which sections apply to this date" (today vs. past) as one piece of server logic instead of duplicated per-section client conditionals.

**Alternative considered:** client-side composition via multiple `useQuery` calls (home page's pattern). Rejected because the today-vs-past section visibility rule is simpler to enforce once, server-side, than scattered across N client components each re-checking "is this today?".

### Recap-only archive via omission, not snapshotting
Past-date views simply don't request/render the current-moment sections (standings, injuries, headlines) rather than storing a historical copy of what those looked like on that date. This was the explicit "Option B" choice made during exploration — it keeps the archive cheap (no new snapshot tables for data that already changes constantly elsewhere) at the cost of those sections being unavailable for any past day, which is acceptable since the page's own framing is "recap of games," not "historical state of the league."

### Generated summary: new small table, one row per date
A new Prisma model (name TBD in tasks, e.g. `BriefingSummary`) stores `(date: String @unique, text: String, generatedAt: DateTime)`. Generation is triggered lazily — the backing API route checks for an existing row for the requested date; if absent and the date's games are final, it assembles the fact payload (game count, final scores, recorded `DailyStatLeader` entry, triple-double flag, top scorer) and calls the model once, persists the result, and returns it. This mirrors `getDailyBestBetSnapshot`/`lockInDailyBestBets`'s "read existing, else compute and lock in" shape in `src/lib/daily-best-bets.ts`.

**Alternative considered:** generate as part of a scheduled ingest job (like `sync-aggregates.ts`) instead of lazily on first request. Rejected for v1 because it adds a new cron dependency for a page that may not be visited for a given date at all (e.g. low-traffic archive dates) — lazy-on-first-request avoids paying the generation cost for dates nobody looks at, at the cost of the very first viewer of a date experiencing the generation latency. Acceptable given this is a non-blocking, decorative line (failure already degrades gracefully per the spec).

### Model choice and secret handling
Revised after implementation started: rather than a cloud API (Anthropic or Bedrock), generation calls a **local Ollama server** (`src/lib/ollama.ts`, `generateWithOllama`), using `llama3.2:3b` — the smallest/fastest model already pulled on this machine, plenty for a one-sentence summary from a tiny fact payload. This needs **no secret at all**: no API key, no AWS credentials, nothing to keep out of git — only an optional `OLLAMA_HOST` override (defaults to `http://localhost:11434`) if Ollama ever runs somewhere other than localhost. A cloud-hosted deploy of this app would need Ollama reachable from wherever it runs (or a different generation backend); that's out of scope for this change, which targets local dev.

Generation is called only from the backing API route / server-side generation step, never from the browser. Prompt wording is deliberately unambiguous for a small model: each game states its winner explicitly ("X beat Y, 124-114") rather than leaving win/loss direction for the model to infer from an "@" score line, and league-wide stat lines are explicitly framed as "not from any single game above" — both were added after real-model testing showed a 3B model would otherwise misattribute a stat line to the wrong game or misread which team won.

## Risks / Trade-offs

- **[Risk]** A past date's "that date's own slate" section and the "yesterday's scores" section on the *next* day's briefing both describe the same date's games, rendered by two different code paths. → Mitigation: both read through the same underlying final-games-for-date query; only presentation context (section heading, "yesterday" vs. "that night") differs.
- **[Risk]** Lazy first-request generation means the first visitor to an old, never-viewed archive date pays LLM latency synchronously. → Mitigation: spec already requires graceful omission on failure/timeout; the page is not blocked waiting indefinitely — generation failure/timeout simply means no summary line renders for that load (a retry on a later view can still succeed and persist it). In practice `llama3.2:3b` responds in under 1.5s locally, so this is a minor cost.
- **[Risk]** Local Ollama being down (not running, or the briefing is ever served from a host without it) makes generation fail every time, for every date, until it's back. → Mitigation: already covered by the same graceful-omission behavior — the page never errors, it just shows no summary line until Ollama is reachable again.
- **[Risk]** A small (3B) local model can still misread or omit facts even when none are fabricated outright. → Mitigation: the prompt states each game's winner explicitly and frames league-wide stat lines as standalone (not tied to a specific game) — both added after real-model testing surfaced exactly these failure modes; residual imperfect phrasing is acceptable for a purely decorative line that's never load-bearing.
- **[Trade-off]** Recap-only archive means a past day's briefing can never show "what injuries looked like that morning" after the fact. Accepted per the exploration decision — avoids a much larger snapshot-everything scope.

## Migration Plan

Purely additive: new routes, new table, new nav entry, new env var. No existing table, route, or capability is modified. Rollback is deleting the new routes/table/nav entry; no data migration risk to existing capabilities.
