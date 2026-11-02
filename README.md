# NBA Stats App

A Next.js app for browsing NBA scores, standings, teams, players, news, and
in-house betting projections, backed by a Prisma/SQLite database that's kept
current by a set of standalone ingestion scripts pulling from ESPN's
unofficial public API.

- Full product spec: [`SPEC.md`](SPEC.md)
- Original implementation plan: [`PLAN.md`](PLAN.md)
- Per-page data source breakdown: [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md)
- How betting projections/picks are computed and graded: [`docs/PREDICTIONS.md`](docs/PREDICTIONS.md)
- Capability specs (OpenSpec): [`openspec/specs/`](openspec/specs)

## Quickstart

```bash
git clone <repo-url>
cd nba-stats-app
npm install          # also runs `prisma generate` via postinstall
```

Create the SQLite database and apply migrations:

```bash
npx prisma migrate deploy
```

Then seed it. The full first-time sequence, in order (each step is
idempotent/self-healing, so re-running any of them is safe):

```bash
npx tsx ingest/sync-reference-data.ts   # conferences, divisions, venues, teams, rosters
npx tsx ingest/backfill.ts              # current season's games, box scores, plays
npx tsx ingest/sync-aggregates.ts       # standings + season stats, derived from the games above
npx tsx ingest/sync-betting-odds.ts     # discovers upcoming games + market odds/player props
npx tsx ingest/generate-projections.ts  # our own game/prop picks, needs the odds above
npx tsx ingest/grade-predictions.ts     # grades any already-finished games
npx tsx ingest/sync-news.ts             # news feed
```

> `ingest/run-all-sync.ts` (and `scripts/run-daily-sync.sh`, meant to be
> cron'd hourly) chains most of the same scripts but only looks back a few
> days for completed games — it's built for **keeping an already-seeded DB
> fresh**, not for the initial seed. Use the sequence above once, then
> `run-all-sync.ts` (or the cron script) for ongoing refreshes.

Finally:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Skip the database entirely

Set `DATA_SOURCE=espn` to run purely against live ESPN endpoints — no
migration, no seeding, nothing in `ingest/` to run. Trade-off: no
multi-season history, no player season-rank, no news tagging, and no
per-game box-score splits. See
[`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) for exactly what each page
loses in this mode.

```bash
DATA_SOURCE=espn npm run dev
```

## Pages

| Route | What it shows |
|---|---|
| `/` | Scoreboard for a given date (defaults to today) — always live from ESPN, never persisted. |
| `/games/[eventId]` | Game detail: box score, play-by-play, odds, win probability, shot chart. |
| `/teams` | Full list of teams. |
| `/teams/[teamId]` | Team profile: roster, schedule, standings context, season stats, news, injuries, transactions. |
| `/players` | Full list of active players, filterable client-side. |
| `/players/[athleteId]` | Player profile: bio/awards, splits, game log, advanced stats, related news. |
| `/standings` | Conference/division standings, plus NBA Cup standings. |
| `/news` | League news feed. |
| `/betting` | Our own game and player-prop projections vs. the market line and ESPN's predictor, plus a running accuracy scoreboard. See [`docs/PREDICTIONS.md`](docs/PREDICTIONS.md). |

## Tech stack

- **Framework:** Next.js (App Router) + TypeScript
- **Styling:** Tailwind CSS
- **Client data fetching/caching:** TanStack Query
- **Database:** SQLite via Prisma
- **Ingestion:** standalone scripts in `ingest/`, scheduled hourly via `scripts/run-daily-sync.sh`
- **Data source:** ESPN's unofficial NBA API

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server. |
| `npm run build` | Production build. |
| `npm run start` | Run the production build. |
| `npm run lint` | Lint the codebase. |
| `npx tsx scripts/sync-status.ts` | Check whether the hourly sync is current — last run time/result, any ungraded final games, any scheduled games still waiting on a market line. |

## License

[MIT](LICENSE)
