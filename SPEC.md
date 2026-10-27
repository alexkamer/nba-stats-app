# NBA Stats Webapp — Spec

Status: DRAFT — pending review
Owner: alexkamer

## 1. Goal

A webapp for browsing NBA stats: players, teams, and games (live/recent/scheduled),
sourced from ESPN's unofficial public JSON API.

## 2. Non-goals (v1)

- No fantasy basketball features.
- No betting UI (place-a-bet, sportsbook-style features). Odds themselves
  *are* in scope as read-only informational data (see §9.4 — the original
  "pre-game data won't survive past `final`" assumption turned out to be
  wrong; ESPN's `summary` call still carries it, with real coverage ~2013-23
  and gaps outside that range).
- No user accounts, favorites, or personalization.
- No historical seasons beyond "current season + recent completed season" at
  first; the schema is designed to hold more history once we backfill it (deep
  historical ingestion is a later phase, not v1).
- No write operations exposed to end users — the only writes come from our own
  ingestion job, never from the browser.

## 3. Tech stack

- **Framework:** Next.js (App Router) + TypeScript
- **Styling:** Tailwind CSS
- **Data fetching/caching (client):** TanStack Query
- **Database:** SQLite
- **ORM:** Prisma (schema, migrations, typed query client)
- **Ingestion:** standalone Node/TypeScript scripts (`ingest/`) that call ESPN
  and upsert into SQLite, run on a schedule (cron — exact mechanism depends
  on where we deploy; see Open Decisions)
- **Data source:** ESPN's unofficial NBA API (`site.api.espn.com`,
  `sports.core.api.espn.com`, `site.web.api.espn.com`, `cdn.espn.com`)

## 4. Architecture

Two paths, split by whether a game is done or not:

- **Historical path (DB-backed):** completed games and everything derived from
  them (box scores, play-by-play, season stats, standings snapshots) live in
  SQLite, written by the ingestion job. Route handlers read this via Prisma.
- **Live path (direct proxy, not persisted):** today's/future games that are
  `scheduled` or `in-progress` are fetched live from ESPN by a thin route
  handler at request time, same as the original stateless-proxy design — we
  do **not** write anything to the DB for a game until it reaches `final`
  status. This keeps live scores truly live without us re-inventing ESPN's
  own real-time pipeline, while historical stats get the relational treatment.

```
 Browser (React + TanStack Query)
        │
        ├── past dates / completed games ──► Next.js Route Handlers ──► SQLite (via Prisma)
        │                                                                     ▲
        │                                                                     │ upsert, additive only
        │                                                                     │
        │                                                        ┌────────────┴────────────┐
        │                                                        │   Ingestion job (ingest/) │
        │                                                        │   backfill + incremental  │
        │                                                        └────────────┬────────────┘
        │                                                                     │ fetch
        └── today / future dates, live games ──► Next.js Route Handlers ──► ESPN NBA JSON endpoints
                                                   (direct proxy, no DB)       (site.api.espn.com, ...)
```

- The **ingestion job** is the only thing that writes to the database. It maps
  raw ESPN JSON into our schema (§6) and upserts rows (by `espn_id`) so
  re-running it is idempotent and strictly additive — see §7 for the
  backfill-vs-incremental split.
- All ESPN calls — ingestion *and* the live route handlers — go through one
  shared, rate-limited client so the two paths can never combine to exceed
  our self-imposed request ceiling. Concrete concurrency/backoff numbers are
  an implementation detail, tracked in `PLAN.md`'s data-fetching section, not
  this spec.
- **Live route handlers** talk to ESPN directly (as in the original
  stateless-proxy design) only for games that aren't final yet, or for
  "what's scheduled today/this week" views. Once a game finishes, the
  incremental ingestion job picks it up and from then on it's served from
  the DB.
- A game's `status` column in the DB is effectively always `final` in v1 —
  we simply don't write rows for `scheduled`/`in-progress` games yet. The
  column still exists because nothing stops us from later deciding to persist
  schedules too; it's just out of scope for now.

## 5. Features / Pages (v1)

### 5.1 Scoreboard (home page `/`)
- Today's games by default; date picker to view other days.
- Each game card: teams, logos, score, status (scheduled/live/final), period/clock.
- Click a game → game detail page.

### 5.2 Game detail `/games/[eventId]`
- Box score (team + player stat lines).
- Play-by-play (collapsible/paginated).
- Final/live score header.
- **Source:** if the game is `final`, this page reads from the DB (ingested
  already). If it's `scheduled`/`in-progress`, it's fetched live from ESPN
  on each request (see §4) — once it finishes, the incremental ingestion job
  (§7) picks it up and the page starts being served from the DB instead.

### 5.3 Teams list `/teams`
- All 30 NBA teams, grouped by conference/division.
- Logo, name, record.

### 5.4 Team detail `/teams/[teamId]`
- Team info, current record, schedule (upcoming + recent results).
- Roster (links to player pages).
- Team season statistics.

### 5.5 Players
- `/players` — search/browse players (by name, team).
- `/players/[athleteId]` — player bio, headshot, current team, season stats,
  game log (recent games), career overview.

### 5.6 Standings `/standings`
- Conference/division standings tables for current season.

### 5.7 News (stretch, if time allows)
- `/news` — latest NBA headlines from ESPN news endpoint.

## 6. Data model (SQLite, via Prisma)

Everything is keyed internally by our own auto id, but every ESPN-sourced
table keeps the ESPN id (`espn_id`, unique) so ingestion upserts are
idempotent and we can always trace a row back to its source.

Reference / slow-changing tables:

- **conference** (`id`, `espn_id`, `name`) — Eastern / Western
- **division** (`id`, `espn_id`, `name`, `conference_id` FK)
- **venue** (`id`, `espn_id`, `name`, `city`, `state`, `capacity`)
- **position** (`id`, `espn_id`, `name`, `abbreviation`) — confirmed during
  M3: ESPN's roster payload only reports broad groups (Guard/Forward/Center),
  not the five traditional positions; the table stores whatever ESPN returns
- **team** (`id`, `espn_id`, `name`, `location`, `display_name`, `abbreviation`,
  `color`, `alternate_color`, `logo_url`, `division_id` FK, `venue_id` FK)
- **player** (`id`, `espn_id`, `full_name`, `display_name`, `headshot_url`,
  `jersey`, `position_id` FK, `current_team_id` FK nullable, `height_in`,
  `weight_lb`, `birth_date`, `birth_place`, `college`, `draft_year`,
  `draft_round`, `draft_pick`, `active`)
- **season** (`id`, `year`, `type`) — type: preseason/regular/postseason

Game / event data:

- **game** (`id`, `espn_id`, `season_id` FK, `season_type` [preseason/regular/postseason],
  `date`, `status` [scheduled/live/final — in practice always `final` in v1,
  see §4], `period`, `clock`, `home_team_id` FK, `away_team_id` FK,
  `home_score`, `away_score`, `venue_id` FK, `attendance`)
- **play** (`id`, `espn_id`, `game_id` FK, `sequence_number`, `period`, `clock`,
  `description`, `team_id` FK nullable, `home_score`, `away_score`,
  `scoring_play` bool) — ingested together with the box score once a game
  reaches `final` (same ESPN `summary` call returns both), not stored for
  games that haven't finished yet
- **team_game_stat** (`id`, `game_id` FK, `team_id` FK, `points`, `rebounds`,
  `assists`, `steals`, `blocks`, `turnovers`, `fouls`, `fg_made`, `fg_att`,
  `three_made`, `three_att`, `ft_made`, `ft_att`) — team box score line
- **player_game_stat** (`id`, `game_id` FK, `player_id` FK, `team_id` FK,
  `minutes`, `points`, `rebounds`, `assists`, `steals`, `blocks`, `turnovers`,
  `fouls`, `fg_made`, `fg_att`, `three_made`, `three_att`, `ft_made`, `ft_att`,
  `plus_minus`) — player box score line
Season aggregates:

- **team_season_stat** (`id`, `team_id` FK, `season_id` FK, `wins`, `losses`,
  `points_per_game`, `opp_points_per_game`, plus other common team rate
  stats as named columns; an `extra` JSON column holds anything ESPN returns
  that we haven't modeled explicitly yet, so ingestion never silently drops data)
- **player_season_stat** (`id`, `player_id` FK, `team_id` FK, `season_id` FK,
  `games_played`, `points_per_game`, `rebounds_per_game`, `assists_per_game`,
  `steals_per_game`, `blocks_per_game`, `turnovers_per_game`,
  `field_goal_pct`, `three_point_pct`, `free_throw_pct`, `extra` JSON)
- **standing** (`id`, `team_id` FK, `season_id` FK, `conference_rank`,
  `division_rank`, `wins`, `losses`, `win_pct`, `games_behind`, `streak`,
  `home_record`, `away_record`, `last_ten`)

News (stretch):

- **news_article** (`id`, `espn_id`, `headline`, `description`, `url`,
  `image_url`, `published_at`) with a join table **news_article_team** /
  **news_article_player** for related entities.

Every `extra` JSON column exists so a field ESPN returns that we didn't
anticipate isn't lost — we can promote it to a real column later once we see
it's actually used.

## 7. Ingestion strategy

The ingestion job (`ingest/`) is a set of scripts, one per entity group, each
calling the relevant ESPN endpoint(s) and upserting by `espn_id`. Every run —
backfill or incremental — is an **upsert, never a delete/overwrite of the
whole table**: a row is only ever inserted (new `espn_id`) or updated in
place (existing `espn_id` gets refreshed columns, e.g. a player's team
changes). Nothing ever wipes and reloads a table wholesale.

### 7.1 Initial backfill

Run once (and safely re-runnable) to seed the database from empty:

1. Reference data: conferences, divisions, venues, positions, teams.
2. Players: full roster per team + bio/overview.
3. Completed games for the season(s) we're backfilling: walk the schedule
   endpoint day-by-day (or team-by-team) over the target date range, and for
   every game already `final`, ingest it — game row, team box score, player
   box score, play-by-play.
4. Season aggregates: team/player season stats, standings (snapshot as of
   backfill time).

Scheduled/in-progress games encountered during backfill are **skipped** —
only `final` games get written (§4).

### 7.2 Incremental sync (recurring)

Runs on a schedule and only ever **adds to** or **refreshes** existing data —
it never truncates a table:

| Job | What it does | ESPN endpoint(s) | Cadence |
|---|---|---|---|
| Newly completed games | Check recent dates' scoreboards for games that are now `final` but not yet in our `game` table; ingest each new one in full (box score, player stats, play-by-play) | `scoreboard?dates=YYYYMMDD`, `summary?event={EVENT_ID}` | every 15–30 min |
| Rosters / players | Upsert roster changes (trades, signings), refresh bios | `.../teams/{TEAM_ID}/roster`, athlete `overview` | daily |
| Teams + venues | Refresh in case of rare changes (rebrand, logo, venue) | `.../teams`, `.../teams/{TEAM_ID}` | daily |
| Team/player season stats | Refresh aggregates for teams/players with a newly completed game | `.../seasons/{YEAR}/types/{SEASONTYPE}/teams/{TEAM_ID}/statistics` | after each completed-games sync |
| Standings | Refresh snapshot | `.../seasons/{YEAR}/types/{SEASONTYPE}/groups/{CONFERENCE_ID}/standings` | after each completed-games sync |
| News (stretch) | Insert new articles | `site.api.espn.com/apis/site/v2/sports/basketball/nba/news?limit=50` | hourly |

The "newly completed games" job is the heartbeat of the whole incremental
system: it's what notices a game has gone final and triggers everything else
that depends on it (season stats, standings) to refresh. Live/scheduled
games are never touched by this job — they're served by the live proxy path
(§4) until the moment they become final.

`{SEASONTYPE}`: 1=preseason, 2=regular season, 3=postseason.
`{CONFERENCE_ID}`: ESPN group IDs for Eastern/Western conference (to confirm
from the API response when implemented).

All exact field-level response shapes will be confirmed by hitting each
endpoint during implementation (ESPN does not publish formal docs); the Prisma
schema above is our best modeling given the NFL-equivalent gist, and may gain
columns once we see real NBA payloads — that's expected, not a spec defect.

## 8. Error handling / resilience

- **Ingestion job:** if an ESPN call fails or times out, log it and skip that
  entity for this run (don't crash the whole job); the next scheduled run
  retries. The database always serves the last successfully ingested data,
  so a transient ESPN outage never breaks the webapp — it just goes briefly
  stale.
- **Route handlers:** read from SQLite, not ESPN, so failures here mean our
  own DB/app issue, not ESPN. Return a normalized `{ error: string }` shape
  with an appropriate HTTP status; the UI shows an inline error state per
  section (not a full page crash).

## 9. Decisions

1. **Deployment:** Undecided / build deploy-agnostic for now. The ingestion
   job just needs *something* to invoke it on a schedule (cron, systemd timer,
   GitHub Actions, etc.) — exact mechanism chosen once we pick a host.
2. **Player/team search:** Client-side. The webapp fetches the full player/team
   list from our own database (fast, local, no ESPN round-trip) and
   filters/searches in the browser.
3. **"Today's games":** Use the viewer's local browser date for the default
   scoreboard view and date picker.
4. **Odds:** Re-added (PLAN.md §4e) — the original concern was wrong.
   ESPN's `summary` call (already fetched for every game) still carries the
   pre-game line via `pickcenter` on completed games; the real constraint
   is sparse/era-dependent coverage (solid 2012-13 to 2022-23, gaps outside
   that), not disappearing after the game ends. Stored as a single
   best-effort `Odds` row per game (highest-priority provider only),
   informational, no betting UI.
5. **DB scope is completed games only (v1):** The database never stores a
   `scheduled` or `in-progress` game. A game is written exactly once, when
   (and only when) it reaches `final`, via the incremental sync job (§7.2).
   Live/upcoming games are always served live from ESPN, never from SQLite.
6. **Updates are strictly additive:** Both backfill and incremental jobs only
   insert new rows or update existing rows by `espn_id` — no job ever
   truncates or bulk-overwrites a table. Re-running backfill is safe and a
   no-op for anything already ingested.
7. **Game type:** `game.season_type` captures preseason/regular/postseason
   (ESPN's native `seasontype`). Summer League, G League, and other
   non-primary-NBA competitions are out of scope for v1 and would need a
   schema change (e.g. a `league` column) to support later.

## 10. Out of scope for this doc

Detailed component breakdown, exact Prisma schema file, file/folder
structure, and task sequencing belong in a follow-up implementation plan,
written after this spec is approved.
