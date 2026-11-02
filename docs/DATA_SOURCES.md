# Data Sources by Page

## Overview

This app has two data sources:

1. **Local DB (Prisma/SQLite, `prisma/schema.prisma`, `prisma/dev.db`)** — populated entirely by the scripts in `ingest/` (`sync-reference-data.ts`, `sync-completed-games.ts`, `sync-aggregates.ts`, `sync-news.ts`, `sync-team-identity.ts`, `backfill-odds.ts`, chained by `ingest/run-all-sync.ts`). Most page data (teams, players, season stats, standings, completed games, news, team identity history) comes from here.
2. **Live ESPN API (`lib/espn/client.ts` + `lib/espn/endpoints.ts`, wrapped by the `src/lib/espn-*.ts` "live proxy" modules)** — hit directly, at request time, for anything that either (a) has no column in the schema (awards, splits, gamelog, injuries, depth chart, coach, transactions, win probability, shot chart, header linescores/records, broadcasts), or (b) hasn't been ingested yet because the game/season isn't `final` (today's scoreboard, in-progress/future games, a team's upcoming schedule).

**The sync now runs hourly.** A crontab entry (`17 * * * *`) runs `scripts/run-daily-sync.sh`, which calls `npx tsx ingest/run-all-sync.ts` and logs to `logs/cron.log`. (It ran nightly at `17 5 * * *` until the betting-insights page shipped — odds/player-prop lines move throughout the day and games need to be graded the same night they finish, so once-a-day was too coarse for that pipeline specifically; every step is self-healing/idempotent, so running it hourly is safe.) Any page reading DB-backed "recently completed games" data (team schedules/box scores, player game logs, standings, season stats, NBA Cup standings) is now at most an hour stale; re-run the script manually (`./scripts/run-daily-sync.sh`) for an immediate refresh. Pages/paths that fall back to a live ESPN call when the DB doesn't have a game yet (game detail, team schedule's "upcoming games") avoid staleness for those specific slices, at the cost of extra live ESPN traffic on every load.

The cron job needs `/opt/homebrew/bin` on `PATH` (`run-daily-sync.sh` exports it explicitly) — cron's own minimal `PATH` doesn't include it, and `npx` shells out to `env node` to find the Node binary, so without it every run fails at the first step with `env: node: No such file or directory`. The script also writes `logs/sync-heartbeat.json` (`{timestamp, status: "ok"|"error"}`) after every run; check freshness anytime with `npx tsx scripts/sync-status.ts` instead of reading the raw log.

**`DATA_SOURCE=espn` skips the DB entirely.** Every route below has a live-ESPN-only branch (`src/lib/data-source.ts`'s `isEspnOnly()`), so the app can run against nothing but live ESPN calls — no `ingest/` scripts, no seeded `prisma/dev.db` required. This trades off: no multi-season history (current season only), no player season-rank, no news team/player tagging, no per-game box-score splits on the team page, and no per-game Hi-Points/Rebounds/Assists leaders or odds on team schedules. See `README.md`'s "Data source" section.

## Summary Table

| Page | Route(s) used | Source | ESPN calls/load | Notes |
|---|---|---|---|---|
| `/` (root scoreboard) | `GET /api/scoreboard?date=` | ESPN | 1 | Always live; refetched each time the date is changed. Never persisted — today/future/live games are never in the DB. |
| `/games/[eventId]` | `GET /api/games/[eventId]` | Mix | 1 | If the game is `final` and in DB: box score/plays/odds from DB, plus one `summary` call for header extras, win probability, and shot chart together (`getGameSummaryExtras`, fixed from 3 redundant calls to the same URL). If not in DB yet: the same one `summary` call builds the whole page. |
| `/news` | `GET /api/news` | DB | 0 | Pure DB read of `NewsArticle` (populated by `sync-news.ts`). |
| `/players` | `GET /api/players` | DB | 0 | Full active-player list in one DB query; filtered client-side. |
| `/players/[athleteId]` | `GET /api/players/[athleteId]`, `GET /api/players/[athleteId]/bio`, `GET /api/news?playerId=`, `GET /api/players/[athleteId]/splits`, `GET /api/players/[athleteId]/gamelog`, `GET /api/players/[athleteId]/advanced` | Mix | 0–1 on initial load (main profile route only, for next-game lookup); +1 each when Bio/Splits/Game Log tabs are opened | Main profile, news, and advanced-stats routes are DB-only (advanced is 0 ESPN calls; main route adds 1 only if it needs `getUpcomingGames` for "next game"). Bio (awards), Splits, and Game Log are per-tab components that each independently hit a live ESPN endpoint once opened/refetched. |
| `/standings` | `GET /api/standings`, `GET /api/nba-cup-standings` | DB | 0 | Both pure DB reads; depend on `sync-aggregates.ts` having run for the season. |
| `/teams` | `GET /api/teams` | DB | 0 | Full team list from DB. |
| `/teams/[teamId]` | `GET /api/teams/[teamId]`, `GET /api/teams` (dropdown), `GET /api/teams/[teamId]/transactions` (Transactions tab) | Mix | ~5–10 on initial load (team route) + 1+ when Transactions tab opened | Team route is DB-heavy (roster, schedule, standings, stats, news) but makes 4 fixed best-effort live calls (upcoming schedule, coach, team leaders, depth chart) plus 1 list + 1-per-injury call to the injuries endpoint. Transactions route makes 1 call per result page (usually 1). |

## API Route Groups

**games** (`/api/games/[eventId]`) — Looks up the game in the DB by `espnId`. If found and the rest of the record (box score, plays, odds) is DB-sourced, it still live-fetches ESPN's `summary` endpoint three separate times (header extras, win probability, shot chart) because none of those fields exist in the schema. If the game isn't in the DB (not yet `final`), it falls back entirely to a single live ESPN `summary` call via `getLiveGameDetail`.

**players** (`/api/players`, `/api/players/[athleteId]`, `/bio`, `/gamelog`, `/splits`, `/advanced`) — The list and advanced-stats endpoints are pure DB reads. The main detail endpoint is DB-driven but makes one best-effort live call (`getUpcomingGames`) to find the player's next game. Bio, gamelog, and splits are thin live-only proxies: they look up the player's `espnId` in the DB, then hit ESPN's athlete overview/gamelog/splits endpoints directly — none of that data is ever persisted.

**teams** (`/api/teams`, `/api/teams/[teamId]`, `/transactions`) — The list endpoint is DB-only. The detail endpoint is the heaviest route in the app: it pulls roster/schedule/standings/season-stats from the DB, then layers on up to five best-effort live ESPN calls (upcoming schedule, coach, team leaders, depth chart, injuries — the last of which fans out into one extra call per injury `$ref`). Any one of these live calls failing degrades gracefully (empty list) rather than failing the page. Transactions is a separate, lazily-loaded live-only endpoint, paginated against ESPN (1 call per page).

**standings** (`/api/standings`, `/api/nba-cup-standings`) — Both pure DB reads over `Standing`/`NbaCupStanding`, populated by `sync-aggregates.ts`. No live ESPN traffic.

**news** (`/api/news`) — Pure DB read over `NewsArticle` (+ join tables), populated by `sync-news.ts`. No live ESPN traffic.

**scoreboard** (`/api/scoreboard`) — Live-only; proxies ESPN's scoreboard endpoint for a given date and shapes it into game cards. Never persisted, since today's/future games are outside the "only ingest `final` games" rule.

## `lib/espn/` and the Live-Proxy Wrappers

`lib/espn/client.ts` exports `fetchEspnJson` (the single rate-limited/backoff-retried HTTP client all ESPN calls go through) and `setEspnConcurrency`. `lib/espn/endpoints.ts` exports `espnEndpoints`, a typed URL builder for every ESPN NBA endpoint used (`scoreboard`, `summary`, `teams`/`team`/`teamRoster`/`teamSchedule`, `news`, `teamTransactions`, `athleteOverview`/`athleteGamelog`/`athleteSplits`, `athletesList`, `seasonTeams`/`seasonTeam`, `teamStatistics`/`teamLeaders`/`teamDepthChart`/`teamInjuries`, `athleteStatistics`, `standings`/`standingsView`, `groups`/`group`/`groupChildren`/`groupTeams`), plus `idFromRef` for resolving ESPN `$ref` URLs.

On top of that, `src/lib/espn-*.ts` wraps specific endpoints for the webapp's "live proxy" routes (none of these persist to the DB):
- `espn-live.ts` — scoreboard cards, full live game detail, header extras, win probability, shot chart (all via the `summary` endpoint).
- `espn-player-awards.ts`, `espn-player-gamelog.ts`, `espn-player-splits.ts` — athlete overview/gamelog/splits.
- `espn-schedule.ts` — team schedule, used to fill in not-yet-ingested games.
- `espn-team-coach.ts`, `espn-team-depth-chart.ts`, `espn-team-injuries.ts` (list + per-injury detail fan-out), `espn-team-leaders.ts`, `espn-team-transactions.ts` (paginated) — team-scoped detail endpoints.
