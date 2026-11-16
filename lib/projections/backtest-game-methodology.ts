/**
 * Pure walk-forward replay for game-projection methodology questions (see
 * scripts/backtest-game-rating-floor.ts and
 * scripts/sweep-game-hyperparameters.ts). Reconstructs, day by day, "what
 * the league-wide opponent-rating solve and each team's recent-game log
 * would have looked like at the time" — so a candidate fix or constant can
 * be scored against real final scores with no lookahead: a game is only
 * ever projected from games strictly before its own calendar day, same
 * granularity `generate-projections.ts` runs at (one rating solve per run,
 * not per game).
 *
 * `runGameBacktest` is the shared walk-forward engine; it hands each
 * side's raw ingredients (recent games, season PPG, ratings, sample sizes)
 * to a caller-supplied `project` function rather than assuming any one
 * blend formula, so different questions (a per-team rating floor, a
 * different recency/season blend weight, a different home-court-edge
 * rule) can all replay the exact same reconstructed history without
 * duplicating the day-by-day bookkeeping.
 *
 * No database access here; wiring to the DB lives in the scripts.
 */
import {
  solveTeamRatings,
  hasEnoughLeagueData,
  type TeamGameRow,
  type TeamRating,
} from "./team-rating";
import {
  projectGame,
  type TeamProjectionInput,
  type TeamRecentGame,
  type TeamSeasonSummary,
  type GameProjectionResult,
} from "./game-projection";

export interface GameOutcomeRow {
  gameId: number;
  date: Date;
  seasonId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
}

export interface GameBacktestResult {
  gameId: number;
  date: Date;
  marginError: number; // projected - actual, home-relative
  totalError: number; // projected - actual
  projectedMargin: number;
  projectedTotal: number;
  actualMargin: number; // home-relative, for diagnosing whether error correlates with blowouts
  actualTotal: number;
  correctWinner: boolean | null; // null when no pick was possible (projected margin exactly 0)
  /** This game's season game count for each side *before* this game (i.e.
   * how many games into their season each team was) — the thing a
   * per-team sample-size floor would gate on. Used to bucket results by
   * "how early in the season was this projection." */
  homeSeasonGamesSoFar: number;
  awaySeasonGamesSoFar: number;
}

/** Everything a projection formula needs for one side of a matchup, as
 * reconstructed from games strictly before the day being projected —
 * un-opinionated about blend weights/edge rules so callers can test
 * different ones against the identical reconstructed state. */
export interface TeamSideContext {
  recentGames: TeamRecentGame[]; // last RECENT_GAMES_WINDOW, oldest first
  seasonStat: TeamSeasonSummary | null;
  recentRating: TeamRating | null;
  seasonRating: TeamRating | null;
  leagueAvgPoints: number | undefined;
  /** How many of `recentGames` there are (== recentGames.length; kept
   * separate to match blendRating's own recentGameCount parameter). */
  recentGamesCount: number;
  /** How many games into its season this team was, *before* this game —
   * uncapped, unlike recentGamesCount. */
  seasonGamesSoFar: number;
}

type TeamHistoryEntry = { isHome: boolean; opponentId: number; pointsFor: number; pointsAgainst: number };

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function toTeamGameRows(entries: TeamHistoryEntry[]): TeamGameRow[] {
  return entries.map((e) => ({ teamId: -1, opponentId: e.opponentId, pointsFor: e.pointsFor, pointsAgainst: e.pointsAgainst }));
}

// RECENT_GAMES_WINDOW mirrors ingest/generate-projections.ts exactly — not
// the thing under test, so every variant uses the same window the live
// pipeline already uses.
const RECENT_GAMES_WINDOW = 10;

/**
 * Replays `allGames` (must be every FINAL game across every season, sorted
 * ascending by date — recency deliberately crosses season boundaries, same
 * as production) day by day. For every game whose `seasonId` is in
 * `scoredSeasonIds`, reconstructs both sides' `TeamSideContext` as of the
 * start of that calendar day and hands them to `project`; a `null` return
 * is skipped (matches live null-skip semantics — insufficient data, not an
 * error).
 *
 * Does not model player availability (no historical PlayerAvailability
 * snapshot exists to replay) — same simplification as the residual-stdev
 * backtest in generate-projections.ts, which also omits it.
 */
export function runGameBacktest(
  allGames: GameOutcomeRow[],
  scoredSeasonIds: Set<number>,
  project: (home: TeamSideContext, away: TeamSideContext) => GameProjectionResult | null,
): GameBacktestResult[] {
  const sorted = [...allGames].sort((a, b) => a.date.getTime() - b.date.getTime());

  const recentByTeam = new Map<number, TeamHistoryEntry[]>();
  const seasonByTeamSeason = new Map<string, TeamHistoryEntry[]>();

  const results: GameBacktestResult[] = [];

  let i = 0;
  while (i < sorted.length) {
    const today = dayKey(sorted[i].date);
    const todaysGames: GameOutcomeRow[] = [];
    while (i < sorted.length && dayKey(sorted[i].date) === today) {
      todaysGames.push(sorted[i]);
      i += 1;
    }

    const needsProjection = todaysGames.some((g) => scoredSeasonIds.has(g.seasonId));
    if (needsProjection) {
      // --- Rating solve as of the start of `today`, using only games
      // strictly before it (everything appended so far). ---
      const recentRows: TeamGameRow[] = [];
      for (const [teamId, entries] of recentByTeam) {
        const window = entries.slice(-RECENT_GAMES_WINDOW);
        for (const row of toTeamGameRows(window)) recentRows.push({ ...row, teamId });
      }
      const recentRatings = hasEnoughLeagueData(recentRows) ? solveTeamRatings(recentRows) : new Map<number, TeamRating>();
      const recentLeagueAvgPoints = average(recentRows.map((r) => r.pointsFor));

      const seasonIdsToday = [...new Set(todaysGames.map((g) => g.seasonId))];
      const seasonRatingsBySeasonId = new Map<number, Map<number, TeamRating>>();
      const leagueAvgPointsBySeasonId = new Map<number, number | undefined>();
      const seasonGamesCountByTeamSeason = new Map<string, number>();
      for (const seasonId of seasonIdsToday) {
        const seasonRows: TeamGameRow[] = [];
        for (const [key, entries] of seasonByTeamSeason) {
          const [teamIdStr, seasonIdStr] = key.split("|");
          if (Number(seasonIdStr) !== seasonId) continue;
          const teamId = Number(teamIdStr);
          seasonGamesCountByTeamSeason.set(key, entries.length);
          for (const row of toTeamGameRows(entries)) seasonRows.push({ ...row, teamId });
        }
        seasonRatingsBySeasonId.set(
          seasonId,
          hasEnoughLeagueData(seasonRows) ? solveTeamRatings(seasonRows) : new Map(),
        );
        leagueAvgPointsBySeasonId.set(seasonId, average(seasonRows.map((r) => r.pointsFor)) ?? recentLeagueAvgPoints ?? undefined);
      }

      for (const game of todaysGames) {
        if (!scoredSeasonIds.has(game.seasonId)) continue;

        const seasonRatings = seasonRatingsBySeasonId.get(game.seasonId) ?? new Map<number, TeamRating>();
        const leagueAvgPoints = leagueAvgPointsBySeasonId.get(game.seasonId);
        const homeSeasonGamesSoFar = seasonGamesCountByTeamSeason.get(`${game.homeTeamId}|${game.seasonId}`) ?? 0;
        const awaySeasonGamesSoFar = seasonGamesCountByTeamSeason.get(`${game.awayTeamId}|${game.seasonId}`) ?? 0;

        const contextFor = (teamId: number, seasonGamesSoFar: number): TeamSideContext => {
          const recentEntries = (recentByTeam.get(teamId) ?? []).slice(-RECENT_GAMES_WINDOW);
          const seasonEntries = seasonByTeamSeason.get(`${teamId}|${game.seasonId}`) ?? [];
          const recentGames: TeamRecentGame[] = recentEntries.map((e) => ({
            isHome: e.isHome,
            pointsFor: e.pointsFor,
            pointsAgainst: e.pointsAgainst,
          }));
          const seasonPointsFor = average(seasonEntries.map((e) => e.pointsFor));
          const seasonPointsAgainst = average(seasonEntries.map((e) => e.pointsAgainst));
          return {
            recentGames,
            seasonStat:
              seasonPointsFor !== null && seasonPointsAgainst !== null
                ? { pointsPerGame: seasonPointsFor, oppPointsPerGame: seasonPointsAgainst }
                : null,
            recentRating: recentRatings.get(teamId) ?? null,
            seasonRating: seasonRatings.get(teamId) ?? null,
            leagueAvgPoints,
            recentGamesCount: recentGames.length,
            seasonGamesSoFar,
          };
        };

        const home = contextFor(game.homeTeamId, homeSeasonGamesSoFar);
        const away = contextFor(game.awayTeamId, awaySeasonGamesSoFar);
        const projection = project(home, away);
        if (!projection) continue; // insufficient data this early — matches live null-skip, not an error

        const actualMargin = game.homeScore - game.awayScore;
        const actualTotal = game.homeScore + game.awayScore;
        const projectedTotal = projection.projectedHomeScore + projection.projectedAwayScore;

        results.push({
          gameId: game.gameId,
          date: game.date,
          marginError: projection.projectedMargin - actualMargin,
          totalError: projectedTotal - actualTotal,
          projectedMargin: projection.projectedMargin,
          projectedTotal,
          actualMargin,
          actualTotal,
          correctWinner:
            projection.projectedMargin === 0
              ? null
              : Math.sign(projection.projectedMargin) === Math.sign(actualMargin),
          homeSeasonGamesSoFar,
          awaySeasonGamesSoFar,
        });
      }
    }

    // --- Append today's games to history, after projecting off of
    // yesterday's state (no lookahead). ---
    for (const game of todaysGames) {
      const homeEntry: TeamHistoryEntry = {
        isHome: true,
        opponentId: game.awayTeamId,
        pointsFor: game.homeScore,
        pointsAgainst: game.awayScore,
      };
      const awayEntry: TeamHistoryEntry = {
        isHome: false,
        opponentId: game.homeTeamId,
        pointsFor: game.awayScore,
        pointsAgainst: game.homeScore,
      };
      for (const [teamId, entry] of [
        [game.homeTeamId, homeEntry],
        [game.awayTeamId, awayEntry],
      ] as const) {
        const recentList = recentByTeam.get(teamId);
        if (recentList) recentList.push(entry);
        else recentByTeam.set(teamId, [entry]);

        const seasonKey = `${teamId}|${game.seasonId}`;
        const seasonList = seasonByTeamSeason.get(seasonKey);
        if (seasonList) seasonList.push(entry);
        else seasonByTeamSeason.set(seasonKey, [entry]);
      }
    }
  }

  return results;
}

/** `minSeasonGamesForRating` candidate under test (see
 * scripts/backtest-game-rating-floor.ts): below the floor, a team's season
 * rating is withheld (`null`) and `projectGame`'s own existing fallback
 * chain takes over for that side, exactly as it does when a team has no
 * rating at all. Production today is `minSeasonGamesForRating = 0` (no
 * floor) — confirmed by this same backtest to make no measurable
 * difference, so this is kept only as the validated-negative-result
 * baseline, not a live candidate. */
export function runGameRatingFloorBacktest(
  allGames: GameOutcomeRow[],
  scoredSeasonIds: Set<number>,
  minSeasonGamesForRating: number,
): GameBacktestResult[] {
  const toInput = (ctx: TeamSideContext): TeamProjectionInput => ({
    seasonStat: ctx.seasonStat,
    recentGames: ctx.recentGames,
    rating:
      ctx.leagueAvgPoints !== undefined
        ? {
            recent: ctx.recentRating,
            season: ctx.seasonGamesSoFar >= minSeasonGamesForRating ? ctx.seasonRating : null,
          }
        : undefined,
    leagueAvgPoints: ctx.leagueAvgPoints,
  });
  return runGameBacktest(allGames, scoredSeasonIds, (home, away) => projectGame(toInput(home), toInput(away)));
}

// Production defaults (game-projection.ts) — used for whichever parameter
// ISN'T the one being swept.
const DEFAULT_RECENT_FORM_WEIGHT = 0.6;
const DEFAULT_MIN_RECENT_GAMES_FOR_BLEND = 3;
const DEFAULT_HOME_COURT_EDGE_FALLBACK = 2.0;

export interface GameHyperparams {
  /** Replaces game-projection.ts's RECENT_FORM_WEIGHT, used both for the
   * raw-PPG fallback blend and the rating blend. */
  recentFormWeight: number;
  /** `"dynamic"` reproduces production: each team's own recent home/away
   * scoring split, falling back to a flat default when there isn't enough
   * of a split to compute. A number always uses that flat value instead of
   * the dynamic split, to test whether the split is earning its
   * complexity over a plain constant. */
  homeCourtEdge: "dynamic" | number;
}

function blendPPG(seasonValue: number | null, recentValues: number[], recentFormWeight: number): number | null {
  const recentAvg = average(recentValues);
  if (recentAvg !== null && recentValues.length >= DEFAULT_MIN_RECENT_GAMES_FOR_BLEND) {
    return seasonValue !== null ? recentFormWeight * recentAvg + (1 - recentFormWeight) * seasonValue : recentAvg;
  }
  return seasonValue;
}

function blendRatingParam(
  seasonRating: TeamRating | null,
  recentRating: TeamRating | null,
  recentGameCount: number,
  recentFormWeight: number,
): TeamRating | null {
  if (recentRating && recentGameCount >= DEFAULT_MIN_RECENT_GAMES_FOR_BLEND) {
    if (!seasonRating) return recentRating;
    return {
      offRating: recentFormWeight * recentRating.offRating + (1 - recentFormWeight) * seasonRating.offRating,
      defRating: recentFormWeight * recentRating.defRating + (1 - recentFormWeight) * seasonRating.defRating,
    };
  }
  return seasonRating ?? null;
}

function offenseDefenseFromRatingParam(ctx: TeamSideContext, recentFormWeight: number): { offense: number; defense: number } | null {
  if (ctx.leagueAvgPoints === undefined) return null;
  const blended = blendRatingParam(ctx.seasonRating, ctx.recentRating, ctx.recentGamesCount, recentFormWeight);
  if (!blended) return null;
  return { offense: ctx.leagueAvgPoints + blended.offRating, defense: ctx.leagueAvgPoints + blended.defRating };
}

function splitHomeAwayMargin(recentGames: TeamRecentGame[]): number | null {
  const homeMargins = recentGames.filter((g) => g.isHome).map((g) => g.pointsFor - g.pointsAgainst);
  const awayMargins = recentGames.filter((g) => !g.isHome).map((g) => g.pointsFor - g.pointsAgainst);
  const homeAvg = average(homeMargins);
  const awayAvg = average(awayMargins);
  if (homeAvg === null || awayAvg === null) return null;
  return (homeAvg - awayAvg) / 2;
}

function homeCourtEdgeParam(home: TeamSideContext, away: TeamSideContext, mode: "dynamic" | number): number {
  if (typeof mode === "number") return mode;
  const homeOwnEdge = splitHomeAwayMargin(home.recentGames);
  const awayOwnEdge = splitHomeAwayMargin(away.recentGames);
  if (homeOwnEdge !== null && awayOwnEdge !== null) return (homeOwnEdge + awayOwnEdge) / 2;
  return DEFAULT_HOME_COURT_EDGE_FALLBACK;
}

/** Mirrors `projectGame`'s formula exactly, but with the recency/season
 * blend weight and the home-court-edge rule as parameters instead of
 * hardcoded constants, so either can be swept independently while the
 * other stays at its production default. Unavailable-scorer adjustment is
 * intentionally omitted — out of scope here, no historical availability
 * data to replay (same limitation as the rest of this module). */
export function projectGameWithParams(
  home: TeamSideContext,
  away: TeamSideContext,
  params: GameHyperparams,
): GameProjectionResult | null {
  const homeRating = offenseDefenseFromRatingParam(home, params.recentFormWeight);
  const awayRating = offenseDefenseFromRatingParam(away, params.recentFormWeight);

  const homeOff = homeRating?.offense ?? blendPPG(home.seasonStat?.pointsPerGame ?? null, home.recentGames.map((g) => g.pointsFor), params.recentFormWeight);
  const homeDef = homeRating?.defense ?? blendPPG(home.seasonStat?.oppPointsPerGame ?? null, home.recentGames.map((g) => g.pointsAgainst), params.recentFormWeight);
  const awayOff = awayRating?.offense ?? blendPPG(away.seasonStat?.pointsPerGame ?? null, away.recentGames.map((g) => g.pointsFor), params.recentFormWeight);
  const awayDef = awayRating?.defense ?? blendPPG(away.seasonStat?.oppPointsPerGame ?? null, away.recentGames.map((g) => g.pointsAgainst), params.recentFormWeight);

  if (homeOff === null || homeDef === null || awayOff === null || awayDef === null) return null;

  const edge = homeCourtEdgeParam(home, away, params.homeCourtEdge);
  const projectedHomeScore = (homeOff + awayDef) / 2 + edge / 2;
  const projectedAwayScore = (awayOff + homeDef) / 2 - edge / 2;

  return {
    projectedHomeScore,
    projectedAwayScore,
    projectedMargin: projectedHomeScore - projectedAwayScore,
  };
}

export function runGameHyperparameterSweep(
  allGames: GameOutcomeRow[],
  scoredSeasonIds: Set<number>,
  params: GameHyperparams,
): GameBacktestResult[] {
  return runGameBacktest(allGames, scoredSeasonIds, (home, away) => projectGameWithParams(home, away, params));
}
