import { prisma } from "@/lib/db";
import { extractStatValue, type RawPlayerGameRow } from "@lib/projections/extract-prop-stat";
import type { PropStatType } from "@lib/espn/prop-types";
import { currentSeasonYear } from "@/lib/espn-season";
import { NextResponse } from "next/server";

// Serves the player-prop-research-page capability: the game-by-game history
// behind one of today's live player props, scoped strictly to players who
// have at least one PlayerPropOdds row today (see design.md "No support for
// players without a live prop today"). Hit rates are always computed
// against TODAY's current line, applied retroactively to past games — no
// historical line snapshot exists for past games (see design.md "Line-at-
// the-time vs. today's line").

type Filter = "all" | "home" | "away" | "opponent";
type PropResult = "OVER" | "UNDER" | "PUSH";

const TEAM_SELECT = { id: true, abbreviation: true, name: true, logoUrl: true, color: true } as const;

function todayWindow() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  return { startOfDay, endOfDay };
}

function compareToLine(value: number, line: number): PropResult {
  if (value > line) return "OVER";
  if (value < line) return "UNDER";
  return "PUSH";
}

interface HitRateSummary {
  games: number;
  over: number;
  under: number;
  push: number;
  sampleSizeNote: string | null;
}

/** Summarizes the most recent `windowSize` results (or every result, when
 * `windowSize` is null, for the "season" window) — `sampleSizeNote` flags
 * when fewer games exist than the window asked for, rather than silently
 * padding or erroring. */
function summarizeWindow(results: PropResult[], windowSize: number | null): HitRateSummary {
  const windowed = windowSize === null ? results : results.slice(0, windowSize);
  const games = windowed.length;
  return {
    games,
    over: windowed.filter((r) => r === "OVER").length,
    under: windowed.filter((r) => r === "UNDER").length,
    push: windowed.filter((r) => r === "PUSH").length,
    sampleSizeNote: windowSize !== null && games < windowSize ? `Only ${games} of ${windowSize} games available` : null,
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId: playerIdParam } = await params;
  const playerId = Number(playerIdParam);
  if (!Number.isInteger(playerId)) {
    return NextResponse.json({ error: "invalid_player" }, { status: 400 });
  }

  const url = new URL(request.url);
  const statParam = url.searchParams.get("stat");
  const filterParam = url.searchParams.get("filter");
  const filter: Filter = filterParam === "home" || filterParam === "away" || filterParam === "opponent" ? filterParam : "all";
  const seasonIdParam = url.searchParams.get("seasonId");
  const requestedSeasonId = seasonIdParam != null && Number.isInteger(Number(seasonIdParam)) ? Number(seasonIdParam) : null;

  try {
    const { startOfDay, endOfDay } = todayWindow();

    const livePropOdds = await prisma.playerPropOdds.findMany({
      where: { playerId, game: { status: "SCHEDULED", date: { gte: startOfDay, lt: endOfDay } } },
      include: {
        game: { include: { homeTeam: { select: TEAM_SELECT }, awayTeam: { select: TEAM_SELECT } } },
        player: { select: { id: true, espnId: true, displayName: true, headshotUrl: true, currentTeamId: true } },
        projection: true,
      },
    });

    if (livePropOdds.length === 0) {
      return NextResponse.json({ error: "no_live_prop" }, { status: 404 });
    }

    const liveStatTypes = [...new Set(livePropOdds.map((p) => p.statType))] as PropStatType[];
    const statType: PropStatType =
      statParam && liveStatTypes.includes(statParam as PropStatType) ? (statParam as PropStatType) : liveStatTypes[0];

    // Today's line per live stat type — same derivation as `line` below,
    // computed for every tracked stat so the grid can grade each of its
    // columns, not just the selected one.
    const lineByStatType = new Map<PropStatType, number | null>();
    for (const stat of liveStatTypes) {
      const rows = livePropOdds.filter((p) => p.statType === stat);
      const over = rows.find((p) => p.side === "OVER");
      const under = rows.find((p) => p.side === "UNDER");
      lineByStatType.set(stat, over?.line ?? under?.line ?? null);
    }

    const rowsForStat = livePropOdds.filter((p) => p.statType === statType);
    const representative = rowsForStat[0];
    const game = representative.game;
    const player = representative.player;
    const overRow = rowsForStat.find((p) => p.side === "OVER");
    const underRow = rowsForStat.find((p) => p.side === "UNDER");
    const line = lineByStatType.get(statType) ?? null;
    const projectionRow = rowsForStat.map((p) => p.projection).find((p) => p != null) ?? null;

    const isHomeToday = player.currentTeamId === game.homeTeamId;
    const team = isHomeToday ? game.homeTeam : game.awayTeam;
    const opponentTeam = isHomeToday ? game.awayTeam : game.homeTeam;

    const historyRows = await prisma.playerGameStat.findMany({
      where: { playerId, points: { not: null }, game: { status: "FINAL" } },
      orderBy: { game: { date: "desc" } },
      select: {
        teamId: true,
        points: true,
        rebounds: true,
        assists: true,
        threeMade: true,
        steals: true,
        blocks: true,
        minutes: true,
        fgMade: true,
        fgAtt: true,
        game: {
          select: {
            espnId: true,
            date: true,
            homeTeamId: true,
            awayTeamId: true,
            homeTeam: { select: TEAM_SELECT },
            awayTeam: { select: TEAM_SELECT },
            seasonId: true,
            seasonType: true,
            season: { select: { year: true } },
          },
        },
      },
    });

    // Regular-season games only populate the season dropdown — preseason
    // and postseason rows stay in historyRows (so they're never silently
    // dropped) but aren't offered as a selectable "season".
    const seasonsAvailable = Array.from(
      new Map(
        historyRows
          .filter((row) => row.game.seasonType === "REGULAR")
          .map((row) => [row.game.seasonId, { id: row.game.seasonId, year: row.game.season.year }]),
      ).values(),
    ).sort((a, b) => b.year - a.year);

    const defaultSeason = seasonsAvailable.find((s) => s.year === currentSeasonYear()) ?? seasonsAvailable[0] ?? null;
    const selectedSeasonId =
      requestedSeasonId != null && seasonsAvailable.some((s) => s.id === requestedSeasonId)
        ? requestedSeasonId
        : defaultSeason?.id ?? null;

    const seasonScopedRows =
      selectedSeasonId == null ? historyRows : historyRows.filter((row) => row.game.seasonId === selectedSeasonId);

    const fullHistory = seasonScopedRows.map((row) => {
      const raw: RawPlayerGameRow = row;
      const value = extractStatValue(statType, raw);
      const isHome = row.teamId === row.game.homeTeamId;
      const opponent = isHome ? row.game.awayTeam : row.game.homeTeam;
      return {
        gameEspnId: row.game.espnId,
        date: row.game.date,
        isHome,
        opponent,
        value,
        result: line !== null ? compareToLine(value, line) : null,
      };
    });

    const filterPredicate = (g: { isHome: boolean; opponent: { id: number } }) => {
      if (filter === "home") return g.isHome;
      if (filter === "away") return !g.isHome;
      if (filter === "opponent") return g.opponent.id === opponentTeam.id;
      return true;
    };

    const filteredHistory = fullHistory.filter(filterPredicate);
    const filteredResults = filteredHistory.map((g) => g.result).filter((r): r is PropResult => r !== null);
    const hitRates = {
      l5: summarizeWindow(filteredResults, 5),
      l10: summarizeWindow(filteredResults, 10),
      l20: summarizeWindow(filteredResults, 20),
      season: summarizeWindow(filteredResults, null),
    };

    // Grid rows: same filtered set of games as the chart/hit-rates above,
    // but with one cell per live stat type instead of just the selected
    // one — lets the research page show a player's full prop board at
    // once instead of requiring a stat switch per column.
    const grid = seasonScopedRows
      .map((row) => {
        const raw: RawPlayerGameRow = row;
        const isHome = row.teamId === row.game.homeTeamId;
        const opponent = isHome ? row.game.awayTeam : row.game.homeTeam;
        return { row, raw, isHome, opponent };
      })
      .filter(filterPredicate)
      .map(({ row, raw, isHome, opponent }) => ({
        gameEspnId: row.game.espnId,
        date: row.game.date,
        isHome,
        opponent,
        minutes: row.minutes,
        fgMade: row.fgMade,
        fgAtt: row.fgAtt,
        cells: liveStatTypes.map((stat) => {
          const value = extractStatValue(stat, raw);
          const statLine = lineByStatType.get(stat) ?? null;
          return { statType: stat, value, result: statLine !== null ? compareToLine(value, statLine) : null };
        }),
      }));

    return NextResponse.json({
      player: { id: player.id, espnId: player.espnId, displayName: player.displayName, headshotUrl: player.headshotUrl },
      game: { espnId: game.espnId, date: game.date, isHomeToday },
      team,
      opponent: opponentTeam,
      statType,
      otherStatTypes: liveStatTypes.filter((s) => s !== statType),
      line,
      odds: { over: overRow?.odds ?? null, under: underRow?.odds ?? null },
      projection: projectionRow
        ? { projectedValue: projectionRow.projectedValue, stdev: projectionRow.stdev, bettable: projectionRow.bettable }
        : null,
      filter,
      seasons: seasonsAvailable,
      selectedSeasonId,
      history: filteredHistory,
      hitRates,
      grid,
    });
  } catch (error) {
    console.error(`GET /api/betting/research/${playerIdParam} failed:`, error);
    return NextResponse.json({ error: "Failed to load player prop research" }, { status: 500 });
  }
}
