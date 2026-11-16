/**
 * Validates `REDISTRIBUTION_LOSS_FACTOR` (lib/projections/game-projection.ts
 * — the fraction of an OUT scorer's recent points his team is assumed to
 * actually lose, flagged since it shipped as "an unvalidated placeholder,
 * not a fitted... value — revisit once graded evidence with/without it
 * exists"). There's no historical `PlayerAvailability` snapshot to replay
 * (that table only tracks pre-game status for scheduled games going
 * forward), so this uses a proxy: a player who scored meaningfully in a
 * team's recent games and then has *no* box-score row at all for a given
 * game is standing in for "frozen OUT" — almost always an injury
 * scratch/DNP, occasionally a trade (indistinguishable from this data
 * alone; rare enough not to swamp the sample).
 *
 * For every such proxy-OUT event, compares the team's actual points scored
 * that game against its pre-game blended offense (same recency/season PPG
 * blend `blend()` in game-projection.ts uses) minus the absent scorer(s)'
 * recent average times a candidate loss factor — at factor 0 (no
 * adjustment, i.e. assume full recovery) through 1.0 (assume zero
 * recovery), bracketing production's 0.7. No market odds involved, no
 * rating solve (isolating the offense-adjustment question from the
 * opponent-rating question already settled elsewhere) — a pure walk-
 * forward, no-lookahead replay.
 *
 * Read-only: queries Game/PlayerGameStat/Season only, never writes
 * anything.
 *
 * Run with: npx tsx scripts/backtest-redistribution-loss-factor.ts --values=0,0.3,0.5,0.7,0.85,1.0 [--seasons=4]
 */
import { prisma } from "../ingest/lib/db";
import { createErrorAccumulator, addError, meanAbsoluteError, meanSignedError, type ErrorAccumulator } from "../lib/projections/backtest-methodology";

const DEFAULT_SEASONS = 4;
// Mirrors game-projection.ts exactly — not the thing under test.
const RECENT_GAMES_WINDOW = 10;
const MIN_RECENT_GAMES_FOR_BLEND = 3;
const RECENT_FORM_WEIGHT = 0.6;
const MIN_SCORING_SHARE_FOR_ADJUSTMENT = 0.12;

function parseArgs(argv: string[]): { values: number[]; seasons: number } {
  let values: number[] = [];
  let seasons = DEFAULT_SEASONS;
  for (const arg of argv) {
    const valuesMatch = arg.match(/^--values=(.+)$/);
    const seasonsMatch = arg.match(/^--seasons=(\d+)$/);
    if (valuesMatch) values = valuesMatch[1].split(",").map(Number);
    else if (seasonsMatch) seasons = Number(seasonsMatch[1]);
  }
  if (values.length === 0) throw new Error("Usage: --values=0,0.3,0.5,0.7,... [--seasons=N]");
  return { values, seasons };
}

async function selectCompletedRegularSeasons(count: number): Promise<{ id: number; year: number }[]> {
  const regularSeasons = await prisma.season.findMany({
    where: { type: "REGULAR" },
    select: { id: true, year: true },
    orderBy: { year: "desc" },
  });
  const completed: { id: number; year: number }[] = [];
  for (const season of regularSeasons) {
    if (completed.length >= count) break;
    const incompleteGames = await prisma.game.count({ where: { seasonId: season.id, status: { not: "FINAL" } } });
    if (incompleteGames === 0) completed.push(season);
  }
  return completed;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function blend(seasonValue: number | null, recentValues: number[]): number | null {
  const recentAvg = average(recentValues);
  if (recentAvg !== null && recentValues.length >= MIN_RECENT_GAMES_FOR_BLEND) {
    return seasonValue !== null ? RECENT_FORM_WEIGHT * recentAvg + (1 - RECENT_FORM_WEIGHT) * seasonValue : recentAvg;
  }
  return seasonValue;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const { values, seasons: seasonCount } = parseArgs(process.argv.slice(2));

  const seasons = await selectCompletedRegularSeasons(seasonCount);
  if (seasons.length === 0) {
    console.error("No completed regular seasons found to backtest.");
    process.exitCode = 1;
    return;
  }
  const scoredSeasonIds = new Set(seasons.map((s) => s.id));
  console.log(`Backtesting ${seasons.length} completed regular season(s): ${seasons.map((s) => s.year).join(", ")}`);

  const [gameRows, statRows] = await Promise.all([
    prisma.game.findMany({
      where: { status: "FINAL" },
      select: { id: true, date: true, seasonId: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
      orderBy: { date: "asc" },
    }),
    prisma.playerGameStat.findMany({
      where: { points: { not: null }, game: { status: "FINAL" } },
      select: { gameId: true, playerId: true, teamId: true, points: true, game: { select: { date: true } } },
      orderBy: { game: { date: "asc" } },
    }),
  ]);

  type GameRow = { id: number; date: Date; seasonId: number; homeTeamId: number; awayTeamId: number; pointsForByTeam: Map<number, number> };
  const games: GameRow[] = gameRows
    .filter((g) => g.homeScore !== null && g.awayScore !== null)
    .map((g) => ({
      id: g.id,
      date: g.date,
      seasonId: g.seasonId,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      pointsForByTeam: new Map([
        [g.homeTeamId, g.homeScore!],
        [g.awayTeamId, g.awayScore!],
      ]),
    }));
  console.log(`Loaded ${games.length} FINAL games, ${statRows.length} player-game box scores.`);

  // Every playerId present in a given gameId at all — used only to check
  // "did this candidate contributor suit up for this exact game", a fixed
  // historical fact, not a lookahead concern.
  const playersInGame = new Map<number, Set<number>>();
  for (const row of statRows) {
    const set = playersInGame.get(row.gameId);
    if (set) set.add(row.playerId);
    else playersInGame.set(row.gameId, new Set([row.playerId]));
  }

  // Per-team, per-game points log for each player, chronological — built
  // incrementally below as we walk forward.
  const playerPointsByTeam = new Map<string, { points: number }[]>(); // key: `${playerId}|${teamId}`
  const playerCurrentTeam = new Map<number, number>();
  // A player's last-seen season, alongside `playerCurrentTeam` — without
  // this, a roster that turned over between seasons (trades, free agency)
  // leaves every departed player's old team tagged as his "current" one
  // right up until his first game back, and the very first games of a new
  // season flag the *entire outgoing roster* as simultaneously "missing" a
  // team they're no longer on at all. Confirmed by sampling: one team's
  // first game of a season flagged 5 "candidates" totaling 91 of its 106
  // blended offense points — not plausible for a single game's injury
  // report. Same bug class as fix-player-projection-season-scope.
  const playerLastSeenSeason = new Map<number, number>();
  const playerRowsByGame = new Map<number, { playerId: number; teamId: number; points: number }[]>();
  for (const row of statRows) {
    const list = playerRowsByGame.get(row.gameId);
    const entry = { playerId: row.playerId, teamId: row.teamId, points: row.points! };
    if (list) list.push(entry);
    else playerRowsByGame.set(row.gameId, [entry]);
  }

  const teamRecentPoints = new Map<number, number[]>(); // last RECENT_GAMES_WINDOW pointsFor
  const teamSeasonPoints = new Map<string, number[]>(); // key: `${teamId}|${seasonId}`

  const accByValue = new Map<number, ErrorAccumulator>();
  for (const v of values) accByValue.set(v, createErrorAccumulator());
  let adjustmentEvents = 0; // games with a proxy-OUT candidate at all
  const events: { totalRecentAvg: number; blendedOffense: number; actual: number }[] = [];

  let i = 0;
  while (i < games.length) {
    const today = dayKey(games[i].date);
    const todaysGames: GameRow[] = [];
    while (i < games.length && dayKey(games[i].date) === today) {
      todaysGames.push(games[i]);
      i += 1;
    }

    for (const game of todaysGames) {
      if (!scoredSeasonIds.has(game.seasonId)) continue;
      for (const teamId of [game.homeTeamId, game.awayTeamId]) {
        const recentPoints = (teamRecentPoints.get(teamId) ?? []).slice(-RECENT_GAMES_WINDOW);
        const seasonPoints = teamSeasonPoints.get(`${teamId}|${game.seasonId}`) ?? [];
        const blendedOffense = blend(average(seasonPoints), recentPoints);
        if (blendedOffense === null) continue;

        // Candidate contributors: players whose most recent appearance was
        // for this team, with >=3 games of their own recent scoring log,
        // averaging at least MIN_SCORING_SHARE_FOR_ADJUSTMENT of this
        // team's blended offense.
        const outCandidates: number[] = [];
        for (const [key, pts] of playerPointsByTeam) {
          const [playerIdStr, keyTeamIdStr] = key.split("|");
          if (Number(keyTeamIdStr) !== teamId) continue;
          const playerId = Number(playerIdStr);
          if (playerCurrentTeam.get(playerId) !== teamId) continue; // last seen with a different team (likely traded away)
          if (playerLastSeenSeason.get(playerId) !== game.seasonId) continue; // last seen a different (prior) season — not on this roster yet this year
          const recent = pts.slice(-RECENT_GAMES_WINDOW);
          if (recent.length < MIN_RECENT_GAMES_FOR_BLEND) continue;
          const avg = average(recent.map((p) => p.points))!;
          if (avg / blendedOffense < MIN_SCORING_SHARE_FOR_ADJUSTMENT) continue;
          if (!playersInGame.get(game.id)?.has(playerId)) outCandidates.push(playerId);
        }

        if (outCandidates.length > 0) {
          adjustmentEvents += 1;
          const actual = game.pointsForByTeam.get(teamId)!;
          const totalRecentAvg = outCandidates.reduce((sum, playerId) => {
            const recent = (playerPointsByTeam.get(`${playerId}|${teamId}`) ?? []).slice(-RECENT_GAMES_WINDOW);
            return sum + average(recent.map((p) => p.points))!;
          }, 0);
          if (process.env.DEBUG_SAMPLE && adjustmentEvents <= 20) {
            console.log(
              `team=${teamId} game=${game.id} candidates=${outCandidates.length} totalRecentAvg=${totalRecentAvg.toFixed(1)} blendedOffense=${blendedOffense.toFixed(1)} actual=${actual}`,
            );
          }
          for (const value of values) {
            const predicted = Math.max(0, blendedOffense - totalRecentAvg * value);
            addError(accByValue.get(value)!, predicted, actual);
          }
          events.push({ totalRecentAvg, blendedOffense, actual });
        }
      }
    }

    // --- Append today's games/box scores to history, after scoring off of
    // yesterday's state. ---
    for (const game of todaysGames) {
      for (const teamId of [game.homeTeamId, game.awayTeamId]) {
        const pointsFor = game.pointsForByTeam.get(teamId)!;
        const recentList = teamRecentPoints.get(teamId);
        if (recentList) recentList.push(pointsFor);
        else teamRecentPoints.set(teamId, [pointsFor]);

        const seasonKey = `${teamId}|${game.seasonId}`;
        const seasonList = teamSeasonPoints.get(seasonKey);
        if (seasonList) seasonList.push(pointsFor);
        else teamSeasonPoints.set(seasonKey, [pointsFor]);
      }

      for (const row of playerRowsByGame.get(game.id) ?? []) {
        playerCurrentTeam.set(row.playerId, row.teamId);
        playerLastSeenSeason.set(row.playerId, game.seasonId);
        const key = `${row.playerId}|${row.teamId}`;
        const list = playerPointsByTeam.get(key);
        if (list) list.push({ points: row.points });
        else playerPointsByTeam.set(key, [{ points: row.points }]);
      }
    }
  }

  console.log(`\nProxy-OUT events scored: ${adjustmentEvents}`);
  console.log("\nTeam-offense error by candidate loss factor (lower MAE better; bias near 0 better; factor=0 means 'no adjustment at all'):");
  console.table(
    values.map((value) => {
      const acc = accByValue.get(value)!;
      return {
        lossFactor: value,
        n: acc.n,
        mae: meanAbsoluteError(acc)?.toFixed(3) ?? "n/a",
        bias: meanSignedError(acc)?.toFixed(3) ?? "n/a",
      };
    }),
  );

  // Is "no adjustment wins" just because most flagged events are marginal
  // (barely clearing the 12% share bar)? Bucket by how much the missing
  // scorer(s) actually averaged, and check factor 0 vs production's 0.7
  // within each bucket — if 0.7 only loses on the marginal end, that's a
  // very different story than losing everywhere.
  const SHARE_BUCKETS: [string, (totalRecentAvg: number) => boolean][] = [
    ["<15 pts", (v) => v < 15],
    ["15-25 pts", (v) => v >= 15 && v < 25],
    ["25+ pts", (v) => v >= 25],
  ];
  console.log("\nBy how much the missing scorer(s) actually averaged (factor=0 vs production's 0.7):");
  console.table(
    SHARE_BUCKETS.map(([label, pred]) => {
      const bucketed = events.filter((e) => pred(e.totalRecentAvg));
      const acc0 = createErrorAccumulator();
      const acc07 = createErrorAccumulator();
      for (const e of bucketed) {
        addError(acc0, e.blendedOffense, e.actual);
        addError(acc07, Math.max(0, e.blendedOffense - e.totalRecentAvg * 0.7), e.actual);
      }
      return {
        bucket: label,
        n: bucketed.length,
        mae_factor0: meanAbsoluteError(acc0)?.toFixed(2) ?? "n/a",
        mae_factor0_7: meanAbsoluteError(acc07)?.toFixed(2) ?? "n/a",
      };
    }),
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
