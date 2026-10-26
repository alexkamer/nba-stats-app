# NBA Stats Webapp — Implementation Plan

Status: DRAFT — pending review
Derived from: SPEC.md (read that first — this doc assumes it)

## 1. Repo layout

```
nba-stats-app/
├── SPEC.md
├── PLAN.md
├── package.json                  # single Node project, npm workspaces not needed at this size
├── tsconfig.json
├── prisma/
│   └── schema.prisma             # §6 of SPEC.md, as real Prisma models
├── lib/
│   └── espn/
│       ├── client.ts             # THE single ESPN HTTP client — rate limiter, backoff, used by ingest/ AND src/lib/espn-live.ts
│       ├── endpoints.ts          # typed builders for every endpoint path (no hand-built URL strings elsewhere)
│       └── rate-limiter.ts       # token-bucket / p-limit wrapper, concurrency + min-interval config
├── ingest/
│   ├── lib/
│   │   ├── mappers/              # raw ESPN JSON -> Prisma input shapes, one file per entity
│   │   │   ├── team.ts
│   │   │   ├── player.ts
│   │   │   ├── game.ts
│   │   │   ├── boxscore.ts
│   │   │   ├── playbyplay.ts
│   │   │   ├── season-stats.ts
│   │   │   └── standings.ts
│   │   └── db.ts                 # shared PrismaClient instance for ingest scripts
│   ├── backfill.ts               # §7.1 — one-shot, re-runnable seed script
│   ├── sync-completed-games.ts   # §7.2 heartbeat job
│   ├── sync-reference-data.ts    # teams/venues/rosters/players daily job
│   ├── sync-aggregates.ts        # season stats + standings, run after sync-completed-games
│   └── run-all-sync.ts           # orchestrates the above in order, for a single cron entry
├── src/
│   ├── app/
│   │   ├── page.tsx                      # 5.1 scoreboard
│   │   ├── games/[eventId]/page.tsx      # 5.2 game detail
│   │   ├── teams/page.tsx                # 5.3 teams list
│   │   ├── teams/[teamId]/page.tsx       # 5.4 team detail
│   │   ├── players/page.tsx              # 5.5 players list/search
│   │   ├── players/[athleteId]/page.tsx  # 5.5 player detail
│   │   ├── standings/page.tsx            # 5.6 standings
│   │   └── api/
│   │       ├── scoreboard/route.ts       # live proxy path (today/future dates)
│   │       ├── games/[eventId]/route.ts  # branches: DB if final, live proxy if not
│   │       ├── teams/route.ts            # DB-backed
│   │       ├── teams/[teamId]/route.ts   # DB-backed
│   │       ├── players/route.ts          # DB-backed
│   │       ├── players/[athleteId]/route.ts # DB-backed
│   │       └── standings/route.ts        # DB-backed
│   ├── lib/
│   │   ├── db.ts                 # shared PrismaClient for the webapp (separate from ingest/lib/db.ts, same pattern)
│   │   ├── espn-live.ts          # thin wrapper over lib/espn/client.ts, used only by routes serving non-final games
│   │   └── types.ts              # shared response DTOs returned by our route handlers
│   └── components/
│       ├── GameCard.tsx
│       ├── BoxScore.tsx
│       ├── PlayByPlay.tsx
│       ├── TeamCard.tsx
│       ├── PlayerCard.tsx
│       ├── StandingsTable.tsx
│       └── DatePicker.tsx
└── .env                           # DATABASE_URL, etc. (gitignored)
```

## 2. Data fetching & rate-limiting strategy

ESPN's API is unofficial and undocumented — no published rate limits, no SLA.
We self-impose discipline rather than find out the hard way.

- **One client, used by everything.** Both the ingestion scripts and the
  webapp's live-proxy routes call ESPN exclusively through
  `lib/espn/client.ts`. There is no second code path that calls `fetch`
  against an ESPN URL directly. This matters because it's the only way a
  shared rate limiter actually limits *everything*, including a backfill run
  happening at the same time as live user traffic.
- **Concurrency limiter, not unlimited `Promise.all`.** All batch fetching
  (e.g. 1,230 games in a season backfill) goes through a `p-limit`-style
  gate (`lib/espn/rate-limiter.ts`), not a naive `for` loop (too slow) or
  unbounded `Promise.all` (too aggressive).
- **Backoff on failure.** 429/5xx responses trigger exponential backoff with
  jitter, honoring `Retry-After` if present. A request that keeps failing
  after a capped number of retries is logged and skipped (same "don't crash
  the whole job" rule as SPEC.md §8) — the next scheduled run picks it up.
- **Measured, not guessed (M2 results):** ran `ingest/burst-test.ts` against
  81 distinct real completed-game `summary` calls (box score + play-by-play)
  across 10 dates. Zero failures/429s at concurrency 5, 10, 20, or 30;
  per-request latency held flat through concurrency 10 (~145ms) and started
  creeping up past 20 (~180–245ms) — a soft sign of contention, not an
  actual limit we hit. **Chosen default: concurrency 10** — fast, with
  headroom before anything that looked like throttling.
  - Backfill estimate at this default: `(1,230 games ÷ 10) × ~145ms ≈ 18s`
    for a full season's worth of `summary` calls alone — confirmed accurate
    for the ESPN-fetching side specifically. **Revised in M4 below:** the
    real full backfill run took ~6 minutes, because bulk SQLite write
    volume (not ESPN latency) dominates for a one-time full-season load.
    ESPN responds quickly and in parallel without complaint at this
    concurrency — that part of the estimate held up fine.
  - Re-run `ingest/burst-test.ts` if ESPN's behavior ever changes
    noticeably (new failures, slower responses) — the number above reflects
    conditions on 2026-10-26, not a permanent guarantee.
- **Minimize call volume via bulk endpoints, not just concurrency.** Fast
  concurrency doesn't help if we're making calls we don't need:
  - Backfilling games walks the **scoreboard-by-day** endpoint (one call =
    every game that day across all teams), not per-team schedules — far
    fewer calls to discover what happened on a given day.
  - The active-athletes list is one bulk paginated call, not 500+ individual
    lookups, for building the player roster/search index.
  - Per-game `summary` calls (box score + play-by-play) are unavoidable —
    one per completed game — but these are exactly where the concurrency
    limiter matters most, since this is the bulk of backfill's request
    volume (~1,230/season).
  - Per-team/per-player season-stat and standings calls remain real ESPN
    calls (decided over self-aggregating from our own game data, to match
    ESPN's own reported numbers exactly) — these are O(30 teams) /
    O(~500 players), small compared to the games volume, so not worth
    optimizing away.
- **Estimating backfill wall-clock time:** once M2 gives us real per-request
  latency, wall-clock ≈ `(request count ÷ concurrency) × average latency`,
  plus backoff overhead for any throttled requests. We'll compute and share
  a real number before kicking off a full-season backfill (M4), rather than
  assuming it'll be fast.

## 3. Milestones (build order)

Each milestone should be independently runnable/testable before moving to the
next — we verify against real ESPN responses as we go, since field shapes
aren't documented.

### M0 — Project scaffolding
- `npx create-next-app` (TypeScript, App Router, Tailwind, src/ dir).
- Install Prisma, TanStack Query, `p-limit`; set up `.env` with
  `DATABASE_URL="file:./dev.db"` — no separate DB server/install needed.
- Verify: app boots, default Next.js page loads, `prisma db push` connects.

### M1 — Prisma schema
- Write `prisma/schema.prisma` with every model from SPEC.md §6
  (`datasource db { provider = "sqlite" }`).
- Run initial migration, creating `prisma/dev.db` locally.
- **Note (discovered during implementation):** Prisma 7 removed the
  `datasource.url` field from `schema.prisma` and the Rust query engine;
  SQLite now requires the `@prisma/adapter-better-sqlite3` driver adapter,
  a `prisma.config.ts` at the repo root holding the connection URL for
  Migrate, and `PrismaClient` is instantiated as
  `new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) })` rather
  than a bare `new PrismaClient()`. Every `db.ts` file in the repo layout
  (§1) that instantiates `PrismaClient` — `ingest/lib/db.ts` and
  `src/lib/db.ts` — must follow this pattern. The generator is
  `provider = "prisma-client"` with an explicit `output` path
  (`src/generated/prisma`, gitignored, regenerated via a `postinstall`
  script), not the old `prisma-client-js`.
- Verify: `prisma studio` shows all empty tables with correct columns/FKs;
  confirmed via a scratch create/read/delete smoke test against the real
  generated client and adapter.

### M2 — ESPN exploration spike + rate-limit tuning — DONE
- Built `lib/espn/client.ts` (fetch + limiter + backoff), `rate-limiter.ts`
  (`p-limit` wrapper + exponential backoff/jitter honoring `Retry-After`),
  and `endpoints.ts` (typed URL builders for every endpoint in SPEC.md §7).
- `ingest/explore.ts` hit scoreboard, summary, teams, team, roster,
  team-statistics, athletes list, athlete overview/gamelog, and standings
  for real NBA data; payloads saved to `ingest/__fixtures__/*.json`.
- `ingest/burst-test.ts` fired real, distinct `summary` calls (81 completed
  games across 10 dates) at concurrency 5/10/20/30 — results and the chosen
  default are in §2 above. 0 failures at every level tested.
- Findings that change earlier assumptions, now reflected in SPEC.md:
  - **Conference group IDs don't need to be guessed/confirmed separately** —
    each team's own payload includes `groups.id` (e.g. Atlanta Hawks →
    `groups.id = "5"`, `standingSummary: "3rd in Eastern Conference
    Division"`). The team mapper (M3) can read this directly instead of
    hardcoding `{CONFERENCE_ID}` values.
  - **Standings is a two-step `$ref` fetch**, not one call:
    `.../groups/{id}/standings` returns a list of named views
    (`overall`/`expanded`/`division`/...), each a `$ref` to the real data,
    e.g. `.../groups/5/standings/0` for the `overall` view actually
    containing `standings[].team.$ref` + `standings[].records[].stats[]`.
    The standings mapper (M5) ingests view `0` and follows each team's
    `$ref` (already-known teams, so this is just an id match, not a new
    lookup).
  - `seasontype=2` (regular season) and the scoreboard/summary endpoints
    all returned exactly the shapes assumed in SPEC.md §6/§7 — no schema
    changes needed there.
- Verify (done): fixtures saved under `ingest/__fixtures__/`; concurrency
  default locked at 10 (§2); confirmed no mapper/schema changes needed
  beyond the standings two-step fetch noted above.

### M3 — Reference data ingestion — DONE
- `ingest/mappers/reference-tree.ts` (conference/division tree, walked from
  ESPN's `/groups` hierarchy — no hardcoded conference/division IDs),
  `team.ts`, `player.ts` + `sync-reference-data.ts`, `ingest/lib/db.ts`
  (Prisma client with the driver-adapter pattern from M1).
- Ingested conferences, divisions, venues, positions, teams, full rosters
  for real: 2 conferences, 6 divisions, 29 venues (one shared by two teams),
  3 positions, 30 teams, 518 players.
- Finding: ESPN's roster payload only reports broad position groups
  (Guard/Forward/Center), not the five traditional positions — SPEC.md §6
  updated to reflect this.
- Verify (done): FK integrity confirmed via direct SQL (0 teams missing a
  division or venue); spot-checked team→division→conference→venue joins
  look correct (e.g. Bulls → Central → Eastern Conference → United Center);
  re-ran the whole sync a second time and row counts were identical
  (upsert-by-espnId idempotency confirmed, not just assumed).

### M4 — Backfill: completed games (one season to start) — DONE
- `ingest/mappers/game.ts`, `boxscore.ts`, `playbyplay.ts` + `backfill.ts`.
- Targeted the 2025-26 season (ESPN season year 2026, the most recently
  completed season as of 2026-10-26 — confirmed its actual date range via
  real ESPN data: 2025-10-21 through 2026-06-10) per discussion with the
  user, who confirmed this is explicitly a single-season backfill, not a
  full historical archive (SPEC.md §2/§9.7 already scoped it that way).
- **Phase A** walks the scoreboard day-by-day (233 days, one call each) to
  discover + create `Game` rows (status/score/venue/teams come straight off
  the scoreboard — no `summary` call needed for this part). **Phase B**
  fetches `summary` per game needing a box score (query-driven — see
  resilience note below, not just "newly discovered this run") through the
  shared rate-limited client, using `Promise.allSettled` so one bad game
  can't abort the other ~1,300 in flight.
- Real run: **1,315 games discovered, 1,311 fully ingested** (2,622 team box
  score rows, 34,464 player box score rows, 636,959 plays, 669 distinct
  players — 518 from the M3 roster snapshot + 151 created on the fly from
  box scores for traded/two-way players not on that snapshot). 1,231
  regular season + 84 postseason, matching a real 82-game season + full
  playoff bracket. Zero FK violations (`PRAGMA foreign_key_check`).
- **Timing finding that revises §2's estimate:** the real run took ~6
  minutes, not the ~18s ESPN-latency-only estimate. The gap is DB write
  volume, not ESPN: ~674k individual upsert statements (team + player +
  play rows) across 1,311 games, each going through Prisma/better-sqlite3
  one at a time with no batching. A second run (self-healing retry only,
  nothing new to write) took **20s** — confirming ESPN-side latency was
  never the bottleneck; bulk SQLite write throughput is, and only matters
  for a one-time full-season backfill, not the incremental sync (M6), which
  only ever has a handful of new games per run.
- **Two real, intentional gaps, not bugs:**
  - 3 events skipped in Phase A (`unknown team`) — these were the All-Star
    Game ("Team Stripes"/"Team Stars") and Rising Stars ("World") exhibition
    "teams," which aren't real NBA franchises and correctly don't exist in
    our `Team` table. Working as designed.
  - 4 games (all second-round-or-later playoff games) got a 404 on
    `summary` — confirmed by re-querying the scoreboard for one of their
    dates that ESPN no longer even lists that event id under that date
    (playoff event ids can get reassigned as series/dates finalize). Their
    `Game` row is still correct (captured from the original scoreboard
    pass), only box score/play-by-play is missing. Self-healing retry will
    keep trying them on every future run at near-zero cost; this is an
    accepted, documented ESPN-side data gap (SPEC.md §8's resilience model
    covers exactly this).
- **Resilience fix made during this milestone:** the Phase B worklist is
  now derived from a DB query (`game.teamGameStats: { none: {} }`) rather
  than "games discovered in this run's Phase A." Without this, a partial
  Phase B failure (which did happen on the first attempt, from the missing
  `athlete.id` bug below) would leave games permanently stuck — Phase A
  would skip them forever as "already existing" and Phase B would never
  revisit them. This makes every future run fully self-healing.
- **Bug fixed during this milestone:** a small number of box score athlete
  entries across the season have no `athlete.id` (malformed ESPN data, not
  something we could predict from the single-game M2 fixture) — this
  originally crashed the whole backfill via an unhandled Prisma validation
  error. Now skipped with a per-entry warning instead.
- Verify (done): spot-checked real games (scores/stat lines/play text all
  readable and correct) during a 3-day smoke test before the full run;
  confirmed full-run row counts and FK integrity above; confirmed
  idempotency and self-healing via a second real run (20s, 0 new writes
  except the same 4 known-404 retries).

### M5 — Season aggregates — DONE
- `ingest/mappers/season-stats.ts`, `standings.ts` + `sync-aggregates.ts`.
- Scoped to the 2025-26 **regular season only** (ESPN season year 2026,
  type 2) — standings only make sense for the regular season, and "season
  stats" conventionally means regular-season averages. Every number comes
  from a real ESPN call per the user's earlier decision (not self-aggregated
  from our own game data).
- Real run: 30/30 standings + team season stats, 582/669 player season
  stats synced (87 skipped — see gap below), ~5s total (team-statistics +
  standings calls are O(30)/O(2), player-statistics is O(players) but all
  cheap at concurrency 10, consistent with M2's findings).
- **Two real bugs found and fixed, not just assumptions that happened to
  work:**
  - Assumed the `standings` array's order was rank order (like a naive read
    of the API would suggest) — it isn't. Confirmed by seeing the league's
    best record (64-18) land at array position 15. Fixed by using ESPN's
    explicit `playoffSeed` stat for conference rank instead of array index.
  - Assumed the division-level standings endpoint would have the same
    `"overall"` record name as the conference-level one — it doesn't; at
    division scope ESPN names it `"Division Standings"`. Looking up
    `"overall"` there silently returned zeros for every team (no error,
    just wrong data), which combined with the first bug produced completely
    scrambled division ranks. Fixed by not calling the division endpoint
    for this at all: division rank is now derived from the already-correct
    conference-level records, grouped by each team's division (known
    locally since M3), sorted by win pct — avoids 6 extra API calls too.
  - Caught both by actually eyeballing real output (OKC's division rank)
    rather than trusting "0 errors thrown" as success — neither bug raised
    an exception, they just silently produced wrong numbers.
- **Known ESPN-side gap, not a bug:** 87 players skipped on
  `athlete/{id}/statistics` with a 404 ("No stats found"). Most are
  legitimately low/no-minute players, but a few (e.g. Damian Lillard, 39
  games played per our own box score data) have a real gap in ESPN's own
  season-stat aggregation — confirmed by querying ESPN directly and getting
  the same 404. Same pattern as M4's 4 unreachable playoff-game summaries:
  accepted, self-retrying, not fixable on our end.
- Verify (done): standings now correctly rank by win pct within both
  conference (clean 1-15 distribution, 2 teams per rank across both
  conferences) and division (spot-checked Northwest: OKC 64-18 → rank 1,
  Utah 22-60 → rank 5); spot-checked top scorers/win totals against known
  2025-26 reality (Luka Doncic 33.5 ppg, OKC/Pistons as conference #1 seeds).

### M6 — Incremental sync job — DONE
- Extracted `ingest/lib/game-ingest.ts` from M4's `backfill.ts` (discovery +
  box score ingestion logic, now shared by both scripts) — `backfill.ts`
  is now a thin wrapper calling it with the full-season date range.
- `sync-completed-games.ts`: calls the same shared logic with a short
  rolling window (today - 4 days through today) instead of the whole
  season — cheap enough to just always check, and the 4-day lookback (not
  just "yesterday") absorbs a missed run without creating a permanent gap,
  since discovery + box score ingestion are both idempotent/self-healing.
- `run-all-sync.ts`: single entry point running, in order, reference data
  → completed games → aggregates (matches SPEC.md Sec 7.2's dependency —
  aggregates should refresh after completed games change). Exact scheduler
  (cron, systemd timer, etc.) still deferred to deployment per SPEC.md
  Sec 9.1 — this script is just what gets invoked.
- Real run: this surfaced genuinely new data, not just a no-op test — the
  2026-27 season had already started (today is 2026-10-26), so the
  incremental job discovered and fully ingested **29 real new games** from
  the season in progress, created new `Season` rows for it automatically,
  and correctly re-attempted (and re-failed, as expected) the same 4
  known-unreachable 2025-26 playoff games from M4 — proving both the
  "pick up genuinely new data" and "self-healing retry" paths work for
  real, not just in theory.
- Full `run-all-sync.ts` run: ~14s end to end (reference data + incremental
  games + aggregates together).
- Verify (done): confirmed via the real run above — new season/games
  appeared correctly with right scores/teams; re-running
  `sync-completed-games.ts` a second time found 0 new games (all 29 already
  present, correctly skipped) and only re-attempted the same persistent
  4 failures — idempotency confirmed with real data, not a synthetic test.

### M7 — Webapp: DB-backed pages — DONE
- `src/lib/db.ts` (same driver-adapter pattern as `ingest/lib/db.ts`,
  cached on `globalThis` so Next's dev-mode hot reload doesn't open a new
  SQLite connection per reload).
- Route handlers: `/api/teams`, `/api/teams/[teamId]`, `/api/players`,
  `/api/players/[athleteId]`, `/api/standings`, `/api/games/[eventId]`
  (final-game branch only — 404s for anything not yet ingested, by design,
  until M8 adds the live-proxy branch).
- Pages: `/teams`, `/teams/[teamId]`, `/players` (client-side search per
  SPEC.md Sec 9.2), `/players/[athleteId]`, `/standings`,
  `/games/[eventId]` (box score + play-by-play). TanStack Query +
  `providers.tsx` wired into the root layout.
- **Bug found and fixed:** `/api/standings` picked "latest season by year"
  from the `Season` table directly — but M6's incremental sync creates a
  `Season` row the moment a game goes final, before `sync-aggregates` has
  populated standings for it. That picked the brand-new, standings-less
  2026-27 season and returned an empty result. Fixed by querying for the
  latest season that actually has `Standing` rows instead.
- **Next 16 Cache Components gotcha:** all three dynamic-route pages
  (`teams/[teamId]`, `players/[athleteId]`, `games/[eventId]`) use
  `useParams()` in a client component, which Next 16 flags as blocking
  prerendering unless wrapped in `<Suspense>`. Fixed by splitting each into
  a thin default export wrapping an inner `*Content` component.
- **Styling gotcha:** a leftover template rule in `globals.css`
  (`body { background: var(--background); ... }`) silently overrode the
  dark-theme Tailwind classes applied to `<body>` in `layout.tsx` — same
  specificity, later in source order. Simplified `globals.css` to drop the
  template's light/dark toggle entirely, since this app uses one fixed
  dark theme.
- Verify (done): **actually tested in a real browser**, not just HTTP
  status codes — installed Playwright + Chromium transiently, drove all
  six pages end to end, confirmed real data renders (team logos, 30-team
  roster grid, full standings table with correct win/loss/rank, player
  search/filter, a real box score + 500+ play play-by-play feed) with zero
  browser console errors, then removed the Playwright dependency again
  since it wasn't part of the planned stack — this was verification
  tooling, not a project dependency.

### M8 — Webapp: live proxy path
- `src/lib/espn-live.ts` + scoreboard route/page + the non-final branch of
  game detail.
- Verify: today's scoreboard shows real live/scheduled games (test during
  an actual game day), date picker works for past (DB) and future (live)
  dates, in-progress game detail updates on refresh.

### M9 — Players/teams search, polish, error states
- Client-side search per SPEC.md §9.2.
- Error/empty states per SPEC.md §8.
- Visual pass (this is where we'd invoke the frontend-design skill for any
  non-trivial layout/styling decisions).

### M10 (stretch) — News
- Only if time allows, per SPEC.md §5.7.

## 4. What we're explicitly deferring past this plan

- Choice of deployment host and its specific cron mechanism (SPEC.md §9.1).
- Multi-season historical backfill beyond one starting season.
- Summer League / G League support (SPEC.md §9.7).
- Any UI visual design system specifics — addressed during M9, not planned
  in detail here.
- Exact concurrency/backoff constants — placeholders in §2 until M2 gives us
  real numbers.

## 5. Immediate next step

Start M0 (scaffolding) and M1 (Prisma schema) — these have no open
questions and no ESPN-response unknowns, so there's nothing blocking them.
M2 (the exploration spike) is where we'll actually hit ESPN's real NBA
endpoints, tune the rate-limiting constants from §2 against reality, and may
come back to adjust SPEC.md §6/§7 if real payloads differ from the
NFL-gist-derived assumptions.
