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
  gate, not a naive `for` loop (too slow) or unbounded `Promise.all` (too
  aggressive). Default concurrency: start at **4–6 concurrent requests**;
  this is a starting guess, not a measured number.
- **Backoff on failure.** 429/5xx responses trigger exponential backoff with
  jitter, honoring `Retry-After` if present. A request that keeps failing
  after a capped number of retries is logged and skipped (same "don't crash
  the whole job" rule as SPEC.md §8) — the next scheduled run picks it up.
- **Tune concurrency empirically in M2, not now.** M2 (below) is explicitly
  where we hit real endpoints, measure real latency, and watch for 429s
  before locking in a concurrency/delay number for the real backfill. Treat
  the number above as a conservative starting point we're prepared to lower.
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

### M2 — ESPN exploration spike + rate-limit tuning (no persistence yet)
- Build `lib/espn/client.ts` with the concurrency limiter and backoff from §2,
  starting at the conservative defaults.
- Small throwaway script(s) hitting each endpoint in SPEC.md §7 for a real,
  known game/team/player, dumping raw JSON to inspect actual field names.
- Fire a deliberate burst (e.g. 50+ concurrent `summary` calls for different
  games) through the client to see where ESPN actually starts throttling or
  erroring, and tune the concurrency/backoff constants against that reality
  rather than the starting guess.
- Purpose: confirm/adjust the mapper shapes before writing real mappers —
  this is where we find out if `{CONFERENCE_ID}` values, `seasontype`
  numbers, stat field names etc. match assumptions.
- Verify: we have one real sample JSON payload per endpoint saved locally
  for reference during mapper-writing (e.g. `ingest/__fixtures__/*.json`),
  and a concurrency/backoff setting we're confident won't get us throttled
  mid-backfill.

### M3 — Reference data ingestion
- `ingest/mappers/team.ts`, `player.ts` + `sync-reference-data.ts`.
- Ingest conferences, divisions, venues, positions, teams, full rosters.
- Verify: `prisma studio` shows all 30 teams correctly linked to
  division/conference/venue, and rosters populated.

### M4 — Backfill: completed games (one season to start)
- `ingest/mappers/game.ts`, `boxscore.ts`, `playbyplay.ts`.
- `backfill.ts` walks one completed season's schedule day-by-day (scoreboard
  endpoint, not per-team), and for every `final` game runs the `summary` call
  through the shared rate-limited client to ingest box score + play-by-play.
- Before running it for real: compute the wall-clock estimate from §2 using
  M2's measured latency/concurrency and share it — know how long this will
  take before starting it, don't just kick it off and wait.
- Verify: spot-check a handful of known real games against ESPN's website —
  scores, stat lines, and a few play-by-play entries match.

### M5 — Season aggregates
- `ingest/mappers/season-stats.ts`, `standings.ts` + `sync-aggregates.ts`.
- Verify: team/player season stat rows and standings match ESPN's site for
  that season.

### M6 — Incremental sync job
- `sync-completed-games.ts`: finds newly-final games not yet in DB, ingests
  them, then triggers `sync-aggregates.ts` for affected teams/players.
- `run-all-sync.ts` orchestrates the recurring jobs; wire up a local cron
  (or just run manually) for now — exact scheduler deferred to deployment.
- Verify: mark a "yesterday" game as the cutoff, confirm re-running the sync
  only adds new games and doesn't touch/duplicate existing rows (idempotency
  check — run it twice, row counts don't change the second time).

### M7 — Webapp: DB-backed pages
- Route handlers for teams, team detail, players, player detail, standings,
  and the `final`-game branch of game detail — all reading via Prisma.
- Corresponding pages/components.
- Verify: browse teams → team detail → roster → player detail; browse
  standings; open a few completed games and confirm box score/PBP render.

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
