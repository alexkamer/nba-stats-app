import { prisma } from "@/lib/db";
import { currentSeasonYear } from "@/lib/espn-season";
import { todayKey, parseDateKey, shiftDateKey, isFutureKey } from "@/lib/briefing/date";
import { getFinalGamesForDate } from "@/lib/briefing/final-games";
import { getTopScorersForDate } from "@/lib/briefing/top-scorers";
import { getDailyLeaderForDate } from "@/lib/briefing/top-performers";
import { getScheduleForDate, getInjuryReportForDate } from "@/lib/briefing/schedule";
import { getBestBetsForDate, summarizeRecord } from "@/lib/briefing/best-bets";
import { sectionsForDate } from "@/lib/briefing/sections";
import {
  getOrGenerateBriefingSummary,
  type BriefingDayFacts,
  type BriefingPreviewFacts,
} from "@/lib/briefing/summary";
import { NextResponse } from "next/server";

// Serves daily-briefing-page: a single date's recap-and-preview payload,
// assembled server-side from several existing read paths (final games,
// box scores, DailyStatLeader, news, standings, player availability,
// game projections/odds, Best Bets) rather than the client fanning out to
// each one separately (see design.md "Date-scoped data assembly").
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");
  const dateKey = dateParam ?? todayKey();

  if (!parseDateKey(dateKey)) {
    return NextResponse.json({ error: "Invalid `date` (expected YYYY-MM-DD)" }, { status: 400 });
  }
  if (isFutureKey(dateKey)) {
    return NextResponse.json({ error: "No briefing for a future date" }, { status: 404 });
  }

  const today = todayKey();
  const sections = sectionsForDate(dateKey, today);
  const priorDateKey = shiftDateKey(dateKey, -1)!;

  try {
    const [
      priorDayGames,
      topScorers,
      dailyLeaderEntries,
      bestBets,
      bestBetsPriorDay,
      viewedDateGames,
      viewedDateLeaderEntries,
      viewedDateTopScorers,
    ] = await Promise.all([
      getFinalGamesForDate(priorDateKey),
      getTopScorersForDate(priorDateKey),
      getDailyLeaderForDate(priorDateKey),
      getBestBetsForDate(dateKey),
      // The prior day's own picks list — shown alongside tonight's so a
      // visitor can see both "how did last night's Best Bets do" (now
      // graded) and "what's live tonight" on the same page, not just an
      // aggregate record for the prior day.
      getBestBetsForDate(priorDateKey),
      // The viewed date's own final games/leader/top-scorer — distinct from
      // `priorDayGames` etc. above (always the day *before* the viewed
      // date, for the "yesterday" sections). Needed for the past-date slate
      // recap display, and for the summary (which recaps the viewed date's
      // own games once they're final, whether that's today or a past date).
      getFinalGamesForDate(dateKey),
      getDailyLeaderForDate(dateKey),
      getTopScorersForDate(dateKey),
    ]);

    const [headlines, standings, injuryReport, schedule] = await Promise.all([
      sections.headlines
        ? prisma.newsArticle.findMany({
            where: { type: "HeadlineNews" },
            orderBy: { publishedAt: "desc" },
            take: 6,
            select: { id: true, headline: true, url: true },
          })
        : Promise.resolve(null),
      sections.standings ? getStandingsSnapshot() : Promise.resolve(null),
      sections.injuries ? getInjuryReportForDate(dateKey) : Promise.resolve(null),
      sections.schedule ? getScheduleForDate(dateKey) : Promise.resolve(null),
    ]);

    // The summary is about the *viewed* date's own slate once it's final
    // (today's summary describes today's games, once they're done; a past
    // date's summary describes that date's games) — distinct from the
    // "yesterday" framing used by the scores/top-performers sections above,
    // which always look at the day *before* the viewed date.
    const summaryFacts: BriefingDayFacts = {
      gameCount: viewedDateGames?.length ?? 0,
      // Full team names, not abbreviations — testing against the real
      // model showed abbreviations (e.g. "LAC") get misread as a
      // different team ("Lakers") for the two LA teams specifically.
      scores: (viewedDateGames ?? []).map((g) => ({
        home: g.homeTeam.name,
        homeScore: g.homeScore ?? 0,
        away: g.awayTeam.name,
        awayScore: g.awayScore ?? 0,
      })),
      topPerformer: viewedDateLeaderEntries?.[0]
        ? {
            name: viewedDateLeaderEntries[0].player.displayName,
            pointsReboundsAssists: viewedDateLeaderEntries[0].pointsReboundsAssists,
            tripleDouble: viewedDateLeaderEntries.some((e) => e.hadTripleDouble),
          }
        : null,
      topScorer: viewedDateTopScorers?.[0]
        ? { name: viewedDateTopScorers[0].player.displayName, points: viewedDateTopScorers[0].points }
        : null,
    };
    const summaryHasFinalGames = (viewedDateGames?.length ?? 0) > 0;
    // Only relevant before the viewed date's games are final — hyping up
    // the scheduled slate instead of recapping results that don't exist
    // yet. `schedule` is only fetched for today (see sections.schedule
    // above); a past date with no final games (postponed slate) simply
    // has no preview, same as it has no recap.
    const previewFacts: BriefingPreviewFacts | null =
      !summaryHasFinalGames && schedule && schedule.length > 0
        ? {
            gameCount: schedule.length,
            matchups: schedule.map((g) => ({
              home: g.homeTeam.name,
              away: g.awayTeam.name,
              marketSpread: g.market?.spread ?? null,
            })),
          }
        : null;
    const summary = await getOrGenerateBriefingSummary(dateKey, summaryFacts, summaryHasFinalGames, previewFacts);

    return NextResponse.json({
      date: dateKey,
      isToday: sections.isToday,
      nextDate: sections.isToday ? null : shiftDateKey(dateKey, 1),
      prevDate: shiftDateKey(dateKey, -1),
      summary,
      yesterdaysScores: { date: priorDateKey, games: priorDayGames ?? [] },
      topPerformers: {
        date: priorDateKey,
        leaders: dailyLeaderEntries ?? [],
        topScorers: topScorers ?? [],
      },
      headlines,
      injuryReport,
      standings,
      schedule,
      pastSlate: sections.pastSlate ? { date: dateKey, games: viewedDateGames ?? [] } : null,
      bestBets: {
        date: dateKey,
        picks: bestBets,
        priorDay: {
          date: priorDateKey,
          picks: bestBetsPriorDay,
          record: bestBetsPriorDay ? summarizeRecord(bestBetsPriorDay.map((p) => p.gradedCorrect)) : null,
        },
      },
    });
  } catch (error) {
    console.error("GET /api/briefing failed:", error);
    return NextResponse.json({ error: "Failed to load briefing" }, { status: 500 });
  }
}

interface StandingsSnapshotRow {
  conferenceName: string;
  team: { id: number; abbreviation: string; name: string; logoUrl: string | null };
  conferenceRank: number | null;
  wins: number | null;
  losses: number | null;
}

/** Abbreviated, non-historical standings (see daily-briefing-page's
 * "Standings snapshot" requirement — no day-over-day deltas), scoped to
 * the current season. */
async function getStandingsSnapshot(): Promise<StandingsSnapshotRow[] | null> {
  const season = await prisma.season.findUnique({
    where: { year_type: { year: currentSeasonYear(), type: "REGULAR" } },
    select: { id: true },
  });
  if (!season) return null;

  const standings = await prisma.standing.findMany({
    where: { seasonId: season.id },
    orderBy: { conferenceRank: "asc" },
    select: {
      conferenceRank: true,
      wins: true,
      losses: true,
      team: {
        select: {
          id: true,
          abbreviation: true,
          name: true,
          logoUrl: true,
          division: { select: { conference: { select: { name: true } } } },
        },
      },
    },
  });

  return standings.map((s) => ({
    conferenceName: s.team.division?.conference?.name ?? "Unknown",
    team: { id: s.team.id, abbreviation: s.team.abbreviation, name: s.team.name, logoUrl: s.team.logoUrl },
    conferenceRank: s.conferenceRank,
    wins: s.wins,
    losses: s.losses,
  }));
}
