/**
 * Betting insights — projection generation (see
 * openspec/changes/add-betting-insights-page). Computes and freezes our
 * own game-level and player-prop projections for scheduled games, once,
 * before tip-off (design.md "Projections are persisted rows, computed
 * once, frozen pre-game") — never recomputed afterward, so grading never
 * reflects hindsight.
 *
 * Self-healing: only processes games/props that don't already have a
 * frozen projection, so re-running is safe and cheap.
 *
 * Run with: npx tsx ingest/generate-projections.ts
 */
import { prisma } from "./lib/db";
import {
  projectGame,
  blendRating,
  type TeamProjectionInput,
  type TeamRecentGame,
  type UnavailableScorer,
} from "../lib/projections/game-projection";
import { projectPlayerStat } from "../lib/projections/player-prop-projection";
import { extractStatValue, type RawPlayerGameRow } from "../lib/projections/extract-prop-stat";
import { computeOpponentFactors, type AllowedStatRow } from "../lib/projections/opponent-factor";
import { computeStdev, isBettable } from "../lib/projections/confidence";
import { computeTeammateRoleAdjustment } from "../lib/projections/teammate-role-adjustment";
import { solveTeamRatings, hasEnoughLeagueData, type TeamGameRow, type TeamRating } from "../lib/projections/team-rating";
import { rankLeaderboard } from "../lib/projections/rank-leaderboard";
import { selectAvailableCandidates, type KingOfTheCourtCandidateRef } from "../lib/projections/king-of-the-court-candidates";
import type { PropStatType } from "../lib/espn/prop-types";
import type { AvailabilityStatus } from "../lib/espn/injury-status-mapping";

// Separate method tags per table — the two methodologies change
// independently (improve-game-rating-model only touched game projections;
// add-player-availability-signal's OUT-skip/teammate-role-bump only
// touched player props), so one shared tag would mislabel whichever table
// didn't actually change, corrupting later per-methodology grading
// analysis. GAME_METHOD bumped for the opponent-rating model;
// PROP_METHOD bumped here too — retroactively, since the availability
// change shipped OUT-skip + teammate-role-bump without ever giving props
// their own distinct tag, leaving every prop since then indistinguishable
// from the original pre-availability v1 rows.
const GAME_METHOD = "v2-opponent-rating";
const PROP_METHOD = "v2-availability-aware";
const RECENT_GAMES_WINDOW = 10;

// Every team's own most-recent RECENT_GAMES_WINDOW final games, paired
// with the opponent faced in each — league-wide input for the
// recency-window rating solve (team-rating.ts). Computed once per run,
// not once per game, since the solve needs every team's data at once.
// Each team's window is independently sized (same "not a strict
// same-season cutoff" convention as loadTeamProjectionInput), so this is
// not a single shared league-wide date range.
async function loadLeagueRecentGames(): Promise<TeamGameRow[]> {
  const teams = await prisma.team.findMany({ select: { id: true } });
  const rows: TeamGameRow[] = [];
  for (const { id: teamId } of teams) {
    const games = await prisma.game.findMany({
      where: { status: "FINAL", OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
      orderBy: { date: "desc" },
      take: RECENT_GAMES_WINDOW,
      select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
    });
    for (const g of games) {
      if (g.homeScore === null || g.awayScore === null) continue;
      const isHome = g.homeTeamId === teamId;
      rows.push({
        teamId,
        opponentId: isHome ? g.awayTeamId : g.homeTeamId,
        pointsFor: isHome ? g.homeScore : g.awayScore,
        pointsAgainst: isHome ? g.awayScore : g.homeScore,
      });
    }
  }
  return rows;
}

// Every FINAL game in `seasonId`, both sides — league-wide input for the
// season-window rating solve. Symmetric by construction (one query covers
// every team), unlike the per-team recency loader above.
async function loadLeagueSeasonGames(seasonId: number): Promise<TeamGameRow[]> {
  const games = await prisma.game.findMany({
    where: { status: "FINAL", seasonId },
    select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
  });
  const rows: TeamGameRow[] = [];
  for (const g of games) {
    if (g.homeScore === null || g.awayScore === null) continue;
    rows.push({ teamId: g.homeTeamId, opponentId: g.awayTeamId, pointsFor: g.homeScore, pointsAgainst: g.awayScore });
    rows.push({ teamId: g.awayTeamId, opponentId: g.homeTeamId, pointsFor: g.awayScore, pointsAgainst: g.homeScore });
  }
  return rows;
}

function leagueAvgPointsOf(games: TeamGameRow[]): number | undefined {
  if (games.length === 0) return undefined;
  return games.reduce((sum, g) => sum + g.pointsFor, 0) / games.length;
}

// Keyed `${gameId}|${playerId}` -> status, for every SCHEDULED game's
// frozen availability snapshot (see player-availability-tracking
// capability). A player with no row here (e.g. sync hasn't run yet for
// this game) is treated as available by every caller below, same as the
// sync step's own "no report entry means available" default.
async function loadAvailabilityByGamePlayer(): Promise<Map<string, AvailabilityStatus>> {
  const rows = await prisma.playerAvailability.findMany({
    where: { game: { status: "SCHEDULED" } },
    select: { gameId: true, playerId: true, status: true },
  });
  return new Map(rows.map((r) => [`${r.gameId}|${r.playerId}`, r.status as AvailabilityStatus]));
}

// Stats with a clean team-level "allowed" analog (sum of raw box-score
// categories). DOUBLE_DOUBLE/TRIPLE_DOUBLE are per-player achievement
// flags, not a counting stat a team "allows" in the same sense, so they're
// left out and always get a neutral opponent factor.
const OPPONENT_ADJUSTABLE_STATS: PropStatType[] = [
  "POINTS",
  "REBOUNDS",
  "ASSISTS",
  "THREE_POINTERS_MADE",
  "STEALS",
  "BLOCKS",
  "POINTS_ASSISTS",
  "POINTS_REBOUNDS",
  "REBOUNDS_ASSISTS",
  "POINTS_REBOUNDS_ASSISTS",
];

// How much more/less than league average each team allows per tracked stat,
// derived from already-ingested TeamGameStat rows (what a team "allowed" in
// a game is just what its opponent put up that game) — no new ingest needed.
async function loadOpponentFactors(): Promise<Map<PropStatType, Map<number, number>>> {
  const teamGameStats = await prisma.teamGameStat.findMany({
    where: { game: { status: "FINAL" } },
    select: {
      gameId: true,
      teamId: true,
      points: true,
      rebounds: true,
      assists: true,
      threeMade: true,
      steals: true,
      blocks: true,
    },
  });

  const byGame = new Map<number, typeof teamGameStats>();
  for (const row of teamGameStats) {
    const list = byGame.get(row.gameId);
    if (list) list.push(row);
    else byGame.set(row.gameId, [row]);
  }

  const factorsByStat = new Map<PropStatType, Map<number, number>>();
  for (const statType of OPPONENT_ADJUSTABLE_STATS) {
    const rows: AllowedStatRow[] = [];
    for (const pair of byGame.values()) {
      if (pair.length !== 2) continue; // only count games with both teams' box scores ingested
      const [a, b] = pair;
      const valueA = extractStatValue(statType, { ...a, minutes: null });
      const valueB = extractStatValue(statType, { ...b, minutes: null });
      rows.push({ teamId: a.teamId, allowedValue: valueB });
      rows.push({ teamId: b.teamId, allowedValue: valueA });
    }
    factorsByStat.set(statType, computeOpponentFactors(rows));
  }
  return factorsByStat;
}

// How many recent final games a team has played, regardless of season, is
// what the projection cares about — not a strict same-season cutoff, since
// early in a season there may not be 10 games of that season yet.
async function loadTeamProjectionInput(teamId: number, seasonId: number): Promise<TeamProjectionInput> {
  const [seasonStat, recentGameRows] = await Promise.all([
    prisma.teamSeasonStat.findUnique({ where: { teamId_seasonId: { teamId, seasonId } } }),
    prisma.game.findMany({
      where: { status: "FINAL", OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
      orderBy: { date: "desc" },
      take: RECENT_GAMES_WINDOW,
      select: { homeTeamId: true, homeScore: true, awayScore: true },
    }),
  ]);

  const recentGames: TeamRecentGame[] = recentGameRows
    .filter((g) => g.homeScore !== null && g.awayScore !== null)
    .map((g) => {
      const isHome = g.homeTeamId === teamId;
      return {
        isHome,
        pointsFor: isHome ? g.homeScore! : g.awayScore!,
        pointsAgainst: isHome ? g.awayScore! : g.homeScore!,
      };
    });

  return {
    seasonStat:
      seasonStat?.pointsPerGame != null && seasonStat?.oppPointsPerGame != null
        ? { pointsPerGame: seasonStat.pointsPerGame, oppPointsPerGame: seasonStat.oppPointsPerGame }
        : null,
    recentGames,
  };
}

// Rostered players on `teamId` frozen OUT for `gameId`, with their recent
// per-game scoring (see game-projection.ts "Team offense adjustment") —
// reuses `loadPlayerGameLog`'s cache so this doesn't re-query a player
// whose log the prop-projection pass already pulled this run.
async function loadUnavailableScorers(
  teamId: number,
  gameId: number,
  availabilityByGamePlayer: Map<string, AvailabilityStatus>,
): Promise<UnavailableScorer[]> {
  const roster = await prisma.player.findMany({ where: { currentTeamId: teamId }, select: { id: true } });
  const outPlayerIds = roster
    .map((p) => p.id)
    .filter((playerId) => availabilityByGamePlayer.get(`${gameId}|${playerId}`) === "OUT");
  if (outPlayerIds.length === 0) return [];

  const scorers: UnavailableScorer[] = [];
  for (const playerId of outPlayerIds) {
    const gameLog = await loadPlayerGameLog(playerId);
    const recentPoints = gameLog.slice(-RECENT_GAMES_WINDOW).map((row) => row.points ?? 0);
    scorers.push({ recentPoints });
  }
  return scorers;
}

// How many of the league's most recent completed games to backtest the
// current ratings against for the residual-based stdev (design.md
// "Residual-based stdev") — a single shared, league-wide figure, not
// per-team/per-matchup.
const RESIDUAL_BACKTEST_GAMES = 90;

// Standard deviation of (actual margin/total - what the current ratings
// would have projected), over the league's last RESIDUAL_BACKTEST_GAMES
// completed games. Uses today's ratings applied retroactively, not each
// game's own pre-game snapshot (documented lookahead-bias limitation,
// design.md) — and omits home-court edge/availability for this backtest
// pass, since it's a variance estimate, not a frozen pick.
async function computeResidualStdevs(
  recentRatings: Map<number, TeamRating>,
  seasonRatingsBySeasonId: Map<number, Map<number, TeamRating>>,
  leagueAvgPointsBySeasonId: Map<number, number | undefined>,
  recentGameCountByTeam: Map<number, number>,
): Promise<{ marginStdev: number | null; totalStdev: number | null }> {
  const backtestGames = await prisma.game.findMany({
    where: { status: "FINAL" },
    orderBy: { date: "desc" },
    take: RESIDUAL_BACKTEST_GAMES,
    select: { seasonId: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
  });

  const marginResiduals: number[] = [];
  const totalResiduals: number[] = [];
  for (const g of backtestGames) {
    if (g.homeScore === null || g.awayScore === null) continue;
    const leagueAvgPoints = leagueAvgPointsBySeasonId.get(g.seasonId);
    if (leagueAvgPoints === undefined) continue;
    const seasonRatings = seasonRatingsBySeasonId.get(g.seasonId) ?? new Map<number, TeamRating>();

    const homeBlend = blendRating(
      seasonRatings.get(g.homeTeamId),
      recentRatings.get(g.homeTeamId),
      recentGameCountByTeam.get(g.homeTeamId) ?? 0,
    );
    const awayBlend = blendRating(
      seasonRatings.get(g.awayTeamId),
      recentRatings.get(g.awayTeamId),
      recentGameCountByTeam.get(g.awayTeamId) ?? 0,
    );
    if (!homeBlend || !awayBlend) continue;

    const projectedHome = leagueAvgPoints + (homeBlend.offRating + awayBlend.defRating) / 2;
    const projectedAway = leagueAvgPoints + (awayBlend.offRating + homeBlend.defRating) / 2;
    marginResiduals.push(g.homeScore - g.awayScore - (projectedHome - projectedAway));
    totalResiduals.push(g.homeScore + g.awayScore - (projectedHome + projectedAway));
  }

  return { marginStdev: computeStdev(marginResiduals), totalStdev: computeStdev(totalResiduals) };
}

async function generateGameProjections(availabilityByGamePlayer: Map<string, AvailabilityStatus>) {
  const scheduledGames = await prisma.game.findMany({
    where: { status: "SCHEDULED", gameProjection: null },
    select: { id: true, seasonId: true, homeTeamId: true, awayTeamId: true },
  });
  if (scheduledGames.length === 0) return { checked: 0, created: 0 };

  // League-wide rating solve, computed once for this whole run rather than
  // per game (design.md "Scope of the iterative solve"). Recency is
  // season-independent; season ratings are solved once per distinct season
  // id among today's scheduled games (normally just one).
  const leagueRecentGames = await loadLeagueRecentGames();
  const recentRatings = hasEnoughLeagueData(leagueRecentGames)
    ? solveTeamRatings(leagueRecentGames)
    : new Map<number, TeamRating>();
  const recentLeagueAvgPoints = leagueAvgPointsOf(leagueRecentGames);

  const seasonIds = [...new Set(scheduledGames.map((g) => g.seasonId))];
  const seasonRatingsBySeasonId = new Map<number, Map<number, TeamRating>>();
  const leagueAvgPointsBySeasonId = new Map<number, number | undefined>();
  for (const seasonId of seasonIds) {
    const leagueSeasonGames = await loadLeagueSeasonGames(seasonId);
    seasonRatingsBySeasonId.set(
      seasonId,
      hasEnoughLeagueData(leagueSeasonGames) ? solveTeamRatings(leagueSeasonGames) : new Map(),
    );
    leagueAvgPointsBySeasonId.set(seasonId, leagueAvgPointsOf(leagueSeasonGames) ?? recentLeagueAvgPoints);
  }

  const recentGameCountByTeam = new Map<number, number>();
  for (const row of leagueRecentGames) {
    recentGameCountByTeam.set(row.teamId, (recentGameCountByTeam.get(row.teamId) ?? 0) + 1);
  }
  const { marginStdev, totalStdev } = await computeResidualStdevs(
    recentRatings,
    seasonRatingsBySeasonId,
    leagueAvgPointsBySeasonId,
    recentGameCountByTeam,
  );

  let created = 0;
  for (const game of scheduledGames) {
    const [homeInput, awayInput, homeUnavailable, awayUnavailable] = await Promise.all([
      loadTeamProjectionInput(game.homeTeamId, game.seasonId),
      loadTeamProjectionInput(game.awayTeamId, game.seasonId),
      loadUnavailableScorers(game.homeTeamId, game.id, availabilityByGamePlayer),
      loadUnavailableScorers(game.awayTeamId, game.id, availabilityByGamePlayer),
    ]);

    const seasonRatings = seasonRatingsBySeasonId.get(game.seasonId) ?? new Map<number, TeamRating>();
    const leagueAvgPoints = leagueAvgPointsBySeasonId.get(game.seasonId);
    const ratingFor = (teamId: number) =>
      leagueAvgPoints !== undefined
        ? { recent: recentRatings.get(teamId) ?? null, season: seasonRatings.get(teamId) ?? null }
        : undefined;

    const home: TeamProjectionInput = {
      ...homeInput,
      unavailableScorers: homeUnavailable,
      rating: ratingFor(game.homeTeamId),
      leagueAvgPoints,
    };
    const away: TeamProjectionInput = {
      ...awayInput,
      unavailableScorers: awayUnavailable,
      rating: ratingFor(game.awayTeamId),
      leagueAvgPoints,
    };
    const projection = projectGame(home, away);
    if (!projection) continue;

    const odds = await prisma.odds.findUnique({ where: { gameId: game.id }, select: { spread: true, overUnder: true } });
    // Odds.spread is home-team-relative favorite-negative, same convention
    // the page's impliedSpread() uses — so the home-relative margin the
    // market implies is the negation of it.
    const marketMargin = odds?.spread != null ? -odds.spread : null;
    const marketTotal = odds?.overUnder ?? null;
    const projectedTotal = projection.projectedHomeScore + projection.projectedAwayScore;

    await prisma.gameProjection.create({
      data: {
        gameId: game.id,
        projectedHomeScore: projection.projectedHomeScore,
        projectedAwayScore: projection.projectedAwayScore,
        projectedMargin: projection.projectedMargin,
        marginStdev,
        totalStdev,
        spreadBettable: isBettable(projection.projectedMargin, marketMargin, marginStdev),
        totalBettable: isBettable(projectedTotal, marketTotal, totalStdev),
        marketMarginAtPick: marketMargin,
        marketTotalAtPick: marketTotal,
        method: GAME_METHOD,
      },
    });
    created += 1;
  }
  return { checked: scheduledGames.length, created };
}

// A projection can be created before the sportsbook has posted a line for
// that game (e.g. discovered a day+ out) — generateGameProjections freezes
// whatever odds exist at that moment, so market*AtPick comes back null and
// no spread/total pick is ever made. Backfilling the line here once it
// shows up, as long as the game hasn't tipped off yet, isn't hindsight
// (design.md's "frozen pre-game" constraint) — it just catches the pick up
// to a line that was always going to arrive before game time.
async function backfillMissingMarketLines() {
  const pending = await prisma.gameProjection.findMany({
    where: {
      game: { status: "SCHEDULED" },
      OR: [{ marketMarginAtPick: null }, { marketTotalAtPick: null }],
    },
    select: { id: true, gameId: true, projectedMargin: true, projectedHomeScore: true, projectedAwayScore: true, marginStdev: true, totalStdev: true },
  });

  let updated = 0;
  for (const proj of pending) {
    const odds = await prisma.odds.findUnique({ where: { gameId: proj.gameId }, select: { spread: true, overUnder: true } });
    if (odds?.spread == null && odds?.overUnder == null) continue;

    const marketMargin = odds?.spread != null ? -odds.spread : null;
    const marketTotal = odds?.overUnder ?? null;
    const projectedTotal = proj.projectedHomeScore + proj.projectedAwayScore;

    await prisma.gameProjection.update({
      where: { id: proj.id },
      data: {
        marketMarginAtPick: marketMargin,
        marketTotalAtPick: marketTotal,
        spreadBettable: isBettable(proj.projectedMargin, marketMargin, proj.marginStdev),
        totalBettable: isBettable(projectedTotal, marketTotal, proj.totalStdev),
      },
    });
    updated += 1;
  }
  return { checked: pending.length, updated };
}

// Caches a player's full game-log rows (ordered oldest -> newest, matching
// lib/projections/player-prop-projection.ts's documented order) so
// multiple prop stat types for the same player don't re-query it.
const playerGameLogCache = new Map<number, RawPlayerGameRow[]>();

async function loadPlayerGameLog(playerId: number): Promise<RawPlayerGameRow[]> {
  const cached = playerGameLogCache.get(playerId);
  if (cached) return cached;

  const rows = await prisma.playerGameStat.findMany({
    where: { playerId, points: { not: null }, game: { status: "FINAL" } },
    orderBy: { game: { date: "asc" } },
    select: { points: true, rebounds: true, assists: true, threeMade: true, steals: true, blocks: true, minutes: true },
  });
  playerGameLogCache.set(playerId, rows);
  return rows;
}

// A team's rostered player ids, cached — reused for both "who could absorb
// an absent scorer's minutes" lookups below.
const teamRosterIdsCache = new Map<number, number[]>();
async function loadTeamRosterIds(teamId: number): Promise<number[]> {
  const cached = teamRosterIdsCache.get(teamId);
  if (cached) return cached;
  const roster = await prisma.player.findMany({ where: { currentTeamId: teamId }, select: { id: true } });
  const ids = roster.map((p) => p.id);
  teamRosterIdsCache.set(teamId, ids);
  return ids;
}

// gameIds a player has an actual box score for (i.e. he played) — any
// other FINAL game he's associated with via the season log below counts as
// a game he missed, the cold-start fallback for teammate-role-adjustment
// before enough PlayerAvailability history exists (design.md "Teammate
// role-bump").
const playedGameIdsCache = new Map<number, Set<number>>();
async function loadPlayedGameIds(playerId: number): Promise<Set<number>> {
  const cached = playedGameIdsCache.get(playerId);
  if (cached) return cached;
  const rows = await prisma.playerGameStat.findMany({ where: { playerId, points: { not: null } }, select: { gameId: true } });
  const ids = new Set(rows.map((r) => r.gameId));
  playedGameIdsCache.set(playerId, ids);
  return ids;
}

// gameIds a player was ever snapshotted OUT for — takes over from the
// played-game-id fallback as PlayerAvailability history accumulates.
const outSnapshotGameIdsCache = new Map<number, Set<number>>();
async function loadOutSnapshotGameIds(playerId: number): Promise<Set<number>> {
  const cached = outSnapshotGameIdsCache.get(playerId);
  if (cached) return cached;
  const rows = await prisma.playerAvailability.findMany({ where: { playerId, status: "OUT" }, select: { gameId: true } });
  const ids = new Set(rows.map((r) => r.gameId));
  outSnapshotGameIdsCache.set(playerId, ids);
  return ids;
}

// A player's current-season game log with gameId attached, so it can be
// paired against a specific teammate's played/OUT game ids above — scoped
// to the current season only (design.md: last season's rotation isn't
// trustworthy evidence for this season's).
const playerSeasonGameLogCache = new Map<string, (RawPlayerGameRow & { gameId: number })[]>();
async function loadPlayerSeasonGameLog(playerId: number, seasonId: number) {
  const key = `${playerId}|${seasonId}`;
  const cached = playerSeasonGameLogCache.get(key);
  if (cached) return cached;
  const rows = await prisma.playerGameStat.findMany({
    where: { playerId, points: { not: null }, game: { status: "FINAL", seasonId } },
    orderBy: { game: { date: "asc" } },
    select: {
      gameId: true,
      points: true,
      rebounds: true,
      assists: true,
      threeMade: true,
      steals: true,
      blocks: true,
      minutes: true,
    },
  });
  playerSeasonGameLogCache.set(key, rows);
  return rows;
}

// Single multiplier reflecting how `playerId`'s production in this
// season's games already changed across every game where *any* of
// tonight's currently-absent teammates (`teammateIds`) already sat out,
// compared to `baseline` (his pre-adjustment projection) — 1 (neutral)
// below the qualifying sample size (see
// lib/projections/teammate-role-adjustment.ts).
//
// Deliberately one combined multiplier, not one per teammate multiplied
// together: several teammates are commonly out at once (an injury-
// depleted roster), and each one's own qualifying-game set tends to
// heavily overlap the others' — multiplying independently-clamped
// per-teammate multipliers compounded without bound (e.g. six absences
// each clamped to 1.3x still multiplied out to ~4.4x). Combining the
// evidence into one "games resembling tonight's absences" set first keeps
// the result inside the same single clamp the module already enforces.
async function computeTeammateMultiplier(
  playerId: number,
  teammateIds: number[],
  seasonId: number,
  statType: PropStatType,
  baseline: number,
): Promise<number> {
  const seasonLog = await loadPlayerSeasonGameLog(playerId, seasonId);
  const [teammatePlayedSets, teammateOutSnapshotSets] = await Promise.all([
    Promise.all(teammateIds.map((id) => loadPlayedGameIds(id))),
    Promise.all(teammateIds.map((id) => loadOutSnapshotGameIds(id))),
  ]);

  const values = seasonLog.map((row) => extractStatValue(statType, row));
  const teammateWasOut = seasonLog.map((row) =>
    teammateIds.some(
      (_, i) => teammateOutSnapshotSets[i].has(row.gameId) || !teammatePlayedSets[i].has(row.gameId),
    ),
  );
  return computeTeammateRoleAdjustment({ values, teammateWasOut, baseline });
}

// King of the Court's projected stat — a combined category, same as any
// other PropStatType, so it reuses extractStatValue/opponentFactorsByStat
// without a special case.
const KOTC_STAT_TYPE: PropStatType = "POINTS_REBOUNDS_ASSISTS";

/** Local (not UTC) YYYY-MM-DD day bucket — same convention
 * ingest/compute-daily-stat-leaders.ts uses for DailyStatLeader, since
 * King of the Court grading reads that table directly. */
function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDayKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

type ScheduledGameRow = { id: number; date: Date; seasonId: number; homeTeamId: number; awayTeamId: number };

// Every rostered, non-OUT player on either team in `game`, paired with the
// opposing team id their opponent factor should be looked up against — the
// OUT-filtering itself is the pure, unit-tested selectAvailableCandidates.
async function loadCandidatesForGame(
  game: ScheduledGameRow,
  availabilityByGamePlayer: Map<string, AvailabilityStatus>,
): Promise<KingOfTheCourtCandidateRef[]> {
  const candidates: KingOfTheCourtCandidateRef[] = [];
  for (const [teamId, opponentTeamId] of [
    [game.homeTeamId, game.awayTeamId],
    [game.awayTeamId, game.homeTeamId],
  ] as const) {
    const rosterIds = await loadTeamRosterIds(teamId);
    candidates.push(...selectAvailableCandidates(rosterIds, game.id, teamId, opponentTeamId, availabilityByGamePlayer));
  }
  return candidates;
}

// This candidate's projected combined points+rebounds+assists for `game`,
// using the exact same inputs/functions generatePlayerPropProjections uses
// for a POINTS_REBOUNDS_ASSISTS prop — `null` when there's no qualifying
// stat history, same insufficient-data handling as that function.
async function projectKingOfTheCourtCandidate(
  candidate: KingOfTheCourtCandidateRef,
  game: ScheduledGameRow,
  availabilityByGamePlayer: Map<string, AvailabilityStatus>,
  opponentFactorsByStat: Map<PropStatType, Map<number, number>>,
): Promise<number | null> {
  const gameLog = await loadPlayerGameLog(candidate.playerId);
  const values = gameLog.map((row) => extractStatValue(KOTC_STAT_TYPE, row));
  const minutes = gameLog.map((row) => row.minutes ?? 0);
  const recentValues = values.slice(-RECENT_GAMES_WINDOW);
  const recentMinutes = minutes.slice(-RECENT_GAMES_WINDOW);
  const seasonAverage = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;

  const opponentFactor = opponentFactorsByStat.get(KOTC_STAT_TYPE)?.get(candidate.opponentTeamId) ?? 1;
  const projectedValue = projectPlayerStat({ seasonAverage, recentValues, recentMinutes, opponentFactor });
  if (projectedValue === null) return null;

  const rosterIds = await loadTeamRosterIds(candidate.currentTeamId);
  const outTeammateIds = rosterIds.filter(
    (id) => id !== candidate.playerId && availabilityByGamePlayer.get(`${game.id}|${id}`) === "OUT",
  );
  if (outTeammateIds.length === 0) return projectedValue;

  const multiplier = await computeTeammateMultiplier(
    candidate.playerId,
    outTeammateIds,
    game.seasonId,
    KOTC_STAT_TYPE,
    projectedValue,
  );
  return projectedValue * multiplier;
}

// Freezes one leaderboard per calendar date, covering every rostered,
// non-OUT player on a team playing that date — not gated on a posted
// market prop the way generatePlayerPropProjections is (design.md
// "Candidate generation is a new orchestration pass"). Self-healing like
// that function: only dates without an existing KingOfTheCourtLeaderboard
// row are processed.
async function generateKingOfTheCourtLeaderboard(
  availabilityByGamePlayer: Map<string, AvailabilityStatus>,
  opponentFactorsByStat: Map<PropStatType, Map<number, number>>,
) {
  const scheduledGames: ScheduledGameRow[] = await prisma.game.findMany({
    where: { status: "SCHEDULED" },
    select: { id: true, date: true, seasonId: true, homeTeamId: true, awayTeamId: true },
  });
  if (scheduledGames.length === 0) return { checked: 0, created: 0 };

  const gamesByDay = new Map<string, ScheduledGameRow[]>();
  for (const game of scheduledGames) {
    const key = dayKey(game.date);
    const list = gamesByDay.get(key);
    if (list) list.push(game);
    else gamesByDay.set(key, [game]);
  }

  const existingLeaderboards = await prisma.kingOfTheCourtLeaderboard.findMany({ select: { date: true } });
  const existingKeys = new Set(existingLeaderboards.map((l) => dayKey(l.date)));

  let created = 0;
  for (const [key, games] of gamesByDay) {
    if (existingKeys.has(key)) continue;

    const projected: { playerId: number; projectedValue: number }[] = [];
    for (const game of games) {
      const candidates = await loadCandidatesForGame(game, availabilityByGamePlayer);
      for (const candidate of candidates) {
        const projectedValue = await projectKingOfTheCourtCandidate(
          candidate,
          game,
          availabilityByGamePlayer,
          opponentFactorsByStat,
        );
        if (projectedValue !== null) projected.push({ playerId: candidate.playerId, projectedValue });
      }
    }
    if (projected.length === 0) continue; // no candidate had qualifying history yet — retry next run

    const ranked = rankLeaderboard(projected);
    await prisma.kingOfTheCourtLeaderboard.create({
      data: {
        date: parseDayKey(key),
        entries: {
          create: ranked.map((entry) => ({
            playerId: entry.playerId,
            projectedValue: entry.projectedValue,
            rank: entry.rank,
          })),
        },
      },
    });
    created += 1;
  }

  return { checked: gamesByDay.size, created };
}

async function generatePlayerPropProjections(
  availabilityByGamePlayer: Map<string, AvailabilityStatus>,
  opponentFactorsByStat: Map<PropStatType, Map<number, number>>,
) {
  const propOddsRows = await prisma.playerPropOdds.findMany({
    // DOUBLE_DOUBLE/TRIPLE_DOUBLE are yes/no propositions — ESPN gives them
    // only an OVER side with odds and no numeric `line` (confirmed: always
    // null). Every projection here is framed as "projected value vs. line",
    // which never produces a lean for these two, so they'd never be shown
    // on the betting page or graded — generating them is pure wasted work.
    // Revisit only alongside a probability-vs-odds comparison built for
    // this market shape specifically.
    where: { game: { status: "SCHEDULED" }, statType: { notIn: ["DOUBLE_DOUBLE", "TRIPLE_DOUBLE"] } },
    select: {
      id: true,
      gameId: true,
      playerId: true,
      statType: true,
      side: true,
      line: true,
      game: { select: { homeTeamId: true, awayTeamId: true, seasonId: true } },
      player: { select: { currentTeamId: true } },
    },
  });
  const existingProjections = await prisma.playerPropProjection.findMany({
    select: { gameId: true, playerId: true, statType: true },
  });
  const existingKeys = new Set(existingProjections.map((p) => `${p.gameId}|${p.playerId}|${p.statType}`));

  const groups = new Map<string, typeof propOddsRows>();
  for (const row of propOddsRows) {
    const key = `${row.gameId}|${row.playerId}|${row.statType}`;
    if (existingKeys.has(key)) continue;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  let created = 0;
  for (const group of groups.values()) {
    const representative = group.find((r) => r.side === "OVER") ?? group[0];

    // A player frozen OUT for this game never gets a projection — not just
    // hidden in the UI (design.md "Prop projection: skip entirely on OUT").
    const status = availabilityByGamePlayer.get(`${representative.gameId}|${representative.playerId}`);
    if (status === "OUT") continue;

    const statType = representative.statType as PropStatType;
    // loadPlayerGameLog only returns PlayerGameStat rows, which only exist
    // for games the player actually appeared in — a missed game has no
    // row, so it's already excluded from recentValues/recentMinutes below
    // without any extra filtering (satisfies the "recent-form window
    // excludes missed games" requirement as existing behavior).
    const gameLog = await loadPlayerGameLog(representative.playerId);
    const values = gameLog.map((row) => extractStatValue(statType, row));
    const minutes = gameLog.map((row) => row.minutes ?? 0);
    const recentValues = values.slice(-RECENT_GAMES_WINDOW);
    const recentMinutes = minutes.slice(-RECENT_GAMES_WINDOW);
    const seasonAverage = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;

    const { homeTeamId, awayTeamId } = representative.game;
    const currentTeamId = representative.player.currentTeamId;
    const opponentTeamId =
      currentTeamId === homeTeamId ? awayTeamId : currentTeamId === awayTeamId ? homeTeamId : null;
    const opponentFactor =
      opponentTeamId !== null ? opponentFactorsByStat.get(statType)?.get(opponentTeamId) ?? 1 : 1;

    const projectedValue = projectPlayerStat({ seasonAverage, recentValues, recentMinutes, opponentFactor });
    if (projectedValue === null) continue;

    // Teammate role-bump: teammates frozen OUT tonight who this player has
    // historically shared minutes with bump (or dampen) this projection,
    // based on what already happened in this season's games those
    // teammates already missed (design.md "Teammate role-bump") — one
    // combined multiplier across all of tonight's absences, not one per
    // teammate multiplied together (see computeTeammateMultiplier).
    let adjustedProjectedValue = projectedValue;
    if (currentTeamId !== null) {
      const rosterIds = await loadTeamRosterIds(currentTeamId);
      const outTeammateIds = rosterIds.filter(
        (id) => id !== representative.playerId && availabilityByGamePlayer.get(`${representative.gameId}|${id}`) === "OUT",
      );
      if (outTeammateIds.length > 0) {
        const multiplier = await computeTeammateMultiplier(
          representative.playerId,
          outTeammateIds,
          representative.game.seasonId,
          statType,
          projectedValue,
        );
        adjustedProjectedValue *= multiplier;
      }
    }

    const stdev = computeStdev(recentValues);
    const bettable = isBettable(adjustedProjectedValue, representative.line, stdev);

    await prisma.playerPropProjection.create({
      data: {
        gameId: representative.gameId,
        playerId: representative.playerId,
        statType,
        propOddsId: representative.id,
        line: representative.line,
        projectedValue: adjustedProjectedValue,
        stdev,
        bettable,
        method: PROP_METHOD,
      },
    });
    created += 1;
  }
  return { checked: groups.size, created };
}

async function main() {
  const start = Date.now();
  const availabilityByGamePlayer = await loadAvailabilityByGamePlayer();
  const games = await generateGameProjections(availabilityByGamePlayer);
  const backfilled = await backfillMissingMarketLines();
  // Shared between props and King of the Court so the opponent-strength
  // query only runs once per run.
  const opponentFactorsByStat = await loadOpponentFactors();
  const props = await generatePlayerPropProjections(availabilityByGamePlayer, opponentFactorsByStat);
  const kingOfTheCourt = await generateKingOfTheCourtLeaderboard(availabilityByGamePlayer, opponentFactorsByStat);
  console.log(
    `generate-projections done in ${((Date.now() - start) / 1000).toFixed(1)}s: ` +
      `games ${games.created}/${games.checked} projected, props ${props.created}/${props.checked} projected, ` +
      `King of the Court leaderboards ${kingOfTheCourt.created}/${kingOfTheCourt.checked} frozen ` +
      `(remaining lacked qualifying history and were skipped, not fabricated), ` +
      `market lines backfilled ${backfilled.updated}/${backfilled.checked}.`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
