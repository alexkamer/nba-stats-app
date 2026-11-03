/**
 * Betting history — team cover-record aggregation (see
 * openspec/changes/add-betting-history-page). For games that have gone
 * FINAL and still have an ungraded `Odds` row (`coverRecordComputedAt`
 * null), grades the actual result against the recorded spread/total and
 * folds it into both teams' `TeamCoverRecord` for that season (win/loss/
 * push counts, home/away splits, and current streak).
 *
 * Self-healing: only processes odds rows not yet folded in, so re-running
 * is safe and cheap. Processes pending games in chronological order so
 * each team's streak advances correctly even when several of its games
 * finished since the last run.
 *
 * Run with: npx tsx ingest/compute-cover-records.ts
 */
import { prisma } from "./lib/db";
import { gradeAtsCover, gradeOverUnder, nextStreak } from "../lib/accuracy/grade-cover";

interface PendingRow {
  oddsId: number;
  spread: number | null;
  overUnder: number | null;
  favoriteTeamId: number | null;
  gameDate: Date;
  seasonId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
}

async function loadPendingRows(): Promise<PendingRow[]> {
  const rows = await prisma.odds.findMany({
    where: { coverRecordComputedAt: null, game: { status: "FINAL" } },
    select: {
      id: true,
      spread: true,
      overUnder: true,
      favoriteTeamId: true,
      game: {
        select: { date: true, seasonId: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
      },
    },
  });

  const pending: PendingRow[] = [];
  for (const row of rows) {
    if (row.game.homeScore === null || row.game.awayScore === null) continue;
    if (row.spread === null && row.overUnder === null) continue;
    pending.push({
      oddsId: row.id,
      spread: row.spread,
      overUnder: row.overUnder,
      favoriteTeamId: row.favoriteTeamId,
      gameDate: row.game.date,
      seasonId: row.game.seasonId,
      homeTeamId: row.game.homeTeamId,
      awayTeamId: row.game.awayTeamId,
      homeScore: row.game.homeScore,
      awayScore: row.game.awayScore,
    });
  }
  pending.sort((a, b) => a.gameDate.getTime() - b.gameDate.getTime());
  return pending;
}

async function getOrCreateRecord(teamId: number, seasonId: number) {
  return prisma.teamCoverRecord.upsert({
    where: { teamId_seasonId: { teamId, seasonId } },
    create: { teamId, seasonId },
    update: {},
  });
}

async function applyAtsResult(teamId: number, seasonId: number, isHome: boolean, result: "COVER" | "NO_COVER" | "PUSH") {
  const record = await getOrCreateRecord(teamId, seasonId);
  const outcome = result === "COVER" ? "WIN" : result === "NO_COVER" ? "LOSS" : "PUSH";
  const data: Record<string, number> = {
    atsCurrentStreak: nextStreak(record.atsCurrentStreak, outcome),
  };
  if (result === "COVER") {
    data.atsWins = record.atsWins + 1;
    if (isHome) data.atsHomeWins = record.atsHomeWins + 1;
    else data.atsAwayWins = record.atsAwayWins + 1;
  } else if (result === "NO_COVER") {
    data.atsLosses = record.atsLosses + 1;
    if (isHome) data.atsHomeLosses = record.atsHomeLosses + 1;
    else data.atsAwayLosses = record.atsAwayLosses + 1;
  } else {
    data.atsPushes = record.atsPushes + 1;
    if (isHome) data.atsHomePushes = record.atsHomePushes + 1;
    else data.atsAwayPushes = record.atsAwayPushes + 1;
  }
  await prisma.teamCoverRecord.update({ where: { id: record.id }, data });
}

async function applyOverUnderResult(teamId: number, seasonId: number, isHome: boolean, result: "OVER" | "UNDER" | "PUSH") {
  const record = await getOrCreateRecord(teamId, seasonId);
  const outcome = result === "OVER" ? "WIN" : result === "UNDER" ? "LOSS" : "PUSH";
  const data: Record<string, number> = {
    ouCurrentStreak: nextStreak(record.ouCurrentStreak, outcome),
  };
  if (result === "OVER") {
    data.ouWins = record.ouWins + 1;
    if (isHome) data.ouHomeWins = record.ouHomeWins + 1;
    else data.ouAwayWins = record.ouAwayWins + 1;
  } else if (result === "UNDER") {
    data.ouLosses = record.ouLosses + 1;
    if (isHome) data.ouHomeLosses = record.ouHomeLosses + 1;
    else data.ouAwayLosses = record.ouAwayLosses + 1;
  } else {
    data.ouPushes = record.ouPushes + 1;
    if (isHome) data.ouHomePushes = record.ouHomePushes + 1;
    else data.ouAwayPushes = record.ouAwayPushes + 1;
  }
  await prisma.teamCoverRecord.update({ where: { id: record.id }, data });
}

/** Straight-up and ATS splits by market role — only called when the game
 * has a recorded favorite (ESPN's own `favorite` flag), so a pick'em
 * contributes to neither team's favorite/underdog counters. */
async function applyFavoriteDogResult(
  teamId: number,
  seasonId: number,
  isFavorite: boolean,
  won: boolean,
  atsResult: "COVER" | "NO_COVER" | "PUSH",
) {
  const record = await getOrCreateRecord(teamId, seasonId);
  const data: Record<string, number> = {};

  if (isFavorite) {
    data[won ? "favWins" : "favLosses"] = (won ? record.favWins : record.favLosses) + 1;
    if (atsResult === "COVER") data.favAtsWins = record.favAtsWins + 1;
    else if (atsResult === "NO_COVER") data.favAtsLosses = record.favAtsLosses + 1;
    else data.favAtsPushes = record.favAtsPushes + 1;
  } else {
    data[won ? "dogWins" : "dogLosses"] = (won ? record.dogWins : record.dogLosses) + 1;
    if (atsResult === "COVER") data.dogAtsWins = record.dogAtsWins + 1;
    else if (atsResult === "NO_COVER") data.dogAtsLosses = record.dogAtsLosses + 1;
    else data.dogAtsPushes = record.dogAtsPushes + 1;
  }

  await prisma.teamCoverRecord.update({ where: { id: record.id }, data });
}

async function main() {
  const start = Date.now();
  const pending = await loadPendingRows();

  let atsGraded = 0;
  let ouGraded = 0;
  let favDogGraded = 0;
  for (const row of pending) {
    if (row.spread !== null) {
      const result = gradeAtsCover(row.spread, row.homeScore, row.awayScore);
      await applyAtsResult(row.homeTeamId, row.seasonId, true, result.home);
      await applyAtsResult(row.awayTeamId, row.seasonId, false, result.away);
      atsGraded += 1;

      if (row.favoriteTeamId !== null) {
        const homeWon = row.homeScore > row.awayScore;
        const homeIsFavorite = row.favoriteTeamId === row.homeTeamId;
        const awayIsFavorite = row.favoriteTeamId === row.awayTeamId;
        if (homeIsFavorite || awayIsFavorite) {
          await applyFavoriteDogResult(row.homeTeamId, row.seasonId, homeIsFavorite, homeWon, result.home);
          await applyFavoriteDogResult(row.awayTeamId, row.seasonId, awayIsFavorite, !homeWon, result.away);
          favDogGraded += 1;
        }
      }
    }
    if (row.overUnder !== null) {
      const result = gradeOverUnder(row.overUnder, row.homeScore, row.awayScore);
      await applyOverUnderResult(row.homeTeamId, row.seasonId, true, result);
      await applyOverUnderResult(row.awayTeamId, row.seasonId, false, result);
      ouGraded += 1;
    }
    await prisma.odds.update({ where: { id: row.oddsId }, data: { coverRecordComputedAt: new Date() } });
  }

  console.log(
    `compute-cover-records done in ${((Date.now() - start) / 1000).toFixed(1)}s: ` +
      `${pending.length} game(s) checked, ${atsGraded} ATS graded, ${ouGraded} O/U graded, ${favDogGraded} favorite/underdog graded.`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
