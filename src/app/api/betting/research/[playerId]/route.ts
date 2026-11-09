import { prisma } from "@/lib/db";
import {
  extractStatValue,
  type RawPlayerGameRow,
} from "@lib/projections/extract-prop-stat";
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
//
// The optional `?game=<espnId>` param switches this into a historical
// mode for a specific already-played game instead — used by the accuracy
// verification pages (src/app/betting/accuracy/[bucket]/page.tsx) so
// clicking a past pick shows the line/projection it was actually made
// against and the games that led up to it, rather than requiring (and
// silently 404ing without) a live prop today for a player whose game is
// long over.
//
// A player with neither a live prop today nor a `?game=` anchor falls
// into a third, "browse" mode (buildBrowseResponse) instead of 404ing —
// still lets a visitor look at the full gamelog for any numeric stat and
// the player's current health status; there's no market line to grade
// against here, so the client sets its own line locally instead.

type Filter = "all" | "home" | "away" | "opponent";
type PropResult = "OVER" | "UNDER" | "PUSH";

// The subset of PropStatType with a numeric over/under line — excludes
// DOUBLE_DOUBLE/TRIPLE_DOUBLE, which are binary yes/no props a user
// couldn't meaningfully set "their own line" for anyway (same exclusion
// the live betting page's own PROP_STAT_TYPES already makes).
const NUMERIC_STAT_TYPES: PropStatType[] = [
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

const TEAM_SELECT = {
  id: true,
  abbreviation: true,
  name: true,
  logoUrl: true,
  color: true,
} as const;

function todayWindow() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  return { startOfDay, endOfDay };
}

// Shared shape for a player's game-by-game boxscore history — used by
// both the live/historical branch below and buildBrowseResponse, so the
// two can't quietly drift apart.
const HISTORY_ROW_SELECT = {
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
} as const;

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
function summarizeWindow(
  results: PropResult[],
  windowSize: number | null,
): HitRateSummary {
  const windowed = windowSize === null ? results : results.slice(0, windowSize);
  const games = windowed.length;
  return {
    games,
    over: windowed.filter((r) => r === "OVER").length,
    under: windowed.filter((r) => r === "UNDER").length,
    push: windowed.filter((r) => r === "PUSH").length,
    sampleSizeNote:
      windowSize !== null && games < windowSize
        ? `Only ${games} of ${windowSize} games available`
        : null,
  };
}

/** Browse mode: a player with no live prop today and no `?game=` anchor
 * still gets their full gamelog for any numeric stat, their current
 * health status, and every season/filter option the live/historical
 * branch offers — just with no market line, since there isn't one. The
 * client is expected to apply its own locally-chosen line to grade
 * `history`/`grid`'s raw `value`s itself (this route always returns
 * `result: null` here, and zeroed `hitRates`, since there's nothing
 * server-side to grade against). */
async function buildBrowseResponse(
  playerId: number,
  filter: Filter,
  requestedSeasonId: number | null,
  statParam: string | null,
): Promise<NextResponse> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      id: true,
      espnId: true,
      displayName: true,
      headshotUrl: true,
      currentTeamId: true,
    },
  });
  if (!player) {
    return NextResponse.json({ error: "player_not_found" }, { status: 404 });
  }

  const team = player.currentTeamId
    ? await prisma.team.findUnique({
        where: { id: player.currentTeamId },
        select: TEAM_SELECT,
      })
    : null;

  // The player's next scheduled game, purely for matchup/health-status
  // context — there's no prop tied to it, so no line/odds/projection
  // comes along with it the way the live branch's anchor game does.
  const nextGame = player.currentTeamId
    ? await prisma.game.findFirst({
        where: {
          status: "SCHEDULED",
          date: { gte: new Date() },
          OR: [
            { homeTeamId: player.currentTeamId },
            { awayTeamId: player.currentTeamId },
          ],
        },
        orderBy: { date: "asc" },
        select: {
          id: true,
          espnId: true,
          date: true,
          homeTeamId: true,
          homeTeam: { select: TEAM_SELECT },
          awayTeam: { select: TEAM_SELECT },
        },
      })
    : null;
  const isHomeNext = nextGame
    ? player.currentTeamId === nextGame.homeTeamId
    : null;
  const opponentTeam = nextGame
    ? isHomeNext
      ? nextGame.awayTeam
      : nextGame.homeTeam
    : null;

  const availabilityRow = nextGame
    ? await prisma.playerAvailability.findUnique({
        where: { gameId_playerId: { gameId: nextGame.id, playerId } },
        select: { status: true, comment: true },
      })
    : null;

  const statType: PropStatType =
    statParam && NUMERIC_STAT_TYPES.includes(statParam as PropStatType)
      ? (statParam as PropStatType)
      : NUMERIC_STAT_TYPES[0];

  const historyRows = await prisma.playerGameStat.findMany({
    where: { playerId, points: { not: null }, game: { status: "FINAL" } },
    orderBy: { game: { date: "desc" } },
    select: HISTORY_ROW_SELECT,
  });

  const seasonsAvailable = Array.from(
    new Map(
      historyRows
        .filter((row) => row.game.seasonType === "REGULAR")
        .map((row) => [
          row.game.seasonId,
          { id: row.game.seasonId, year: row.game.season.year },
        ]),
    ).values(),
  ).sort((a, b) => b.year - a.year);

  const defaultSeason =
    seasonsAvailable.find((s) => s.year === currentSeasonYear()) ??
    seasonsAvailable[0] ??
    null;
  const selectedSeasonId =
    requestedSeasonId != null &&
    seasonsAvailable.some((s) => s.id === requestedSeasonId)
      ? requestedSeasonId
      : (defaultSeason?.id ?? null);

  const seasonScopedRows =
    filter === "opponent" || selectedSeasonId == null
      ? historyRows
      : historyRows.filter((row) => row.game.seasonId === selectedSeasonId);

  const filterPredicate = (g: {
    isHome: boolean;
    opponent: { id: number };
  }) => {
    if (filter === "home") return g.isHome;
    if (filter === "away") return !g.isHome;
    if (filter === "opponent")
      return opponentTeam !== null && g.opponent.id === opponentTeam.id;
    return true;
  };

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
      result: null as PropResult | null,
    };
  });
  const filteredHistory = fullHistory.filter(filterPredicate);

  const zeroHitRates = {
    l5: summarizeWindow([], 5),
    l10: summarizeWindow([], 10),
    l20: summarizeWindow([], 20),
    season: summarizeWindow([], null),
  };

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
      cells: NUMERIC_STAT_TYPES.map((stat) => ({
        statType: stat,
        value: extractStatValue(stat, raw),
        result: null as PropResult | null,
      })),
    }));

  return NextResponse.json({
    player: {
      id: player.id,
      espnId: player.espnId,
      displayName: player.displayName,
      headshotUrl: player.headshotUrl,
    },
    game: nextGame
      ? {
          espnId: nextGame.espnId,
          date: nextGame.date,
          isHomeToday: isHomeNext,
        }
      : null,
    historical: false,
    browse: true,
    availability: availabilityRow,
    team,
    opponent: opponentTeam,
    statType,
    statTypes: NUMERIC_STAT_TYPES,
    line: null,
    odds: { over: null, under: null },
    projection: null,
    filter,
    seasons: seasonsAvailable,
    selectedSeasonId,
    history: filteredHistory,
    hitRates: zeroHitRates,
    grid,
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const { playerId: playerIdParam } = await params;
  const playerId = Number(playerIdParam);
  if (!Number.isInteger(playerId)) {
    return NextResponse.json({ error: "invalid_player" }, { status: 400 });
  }

  const url = new URL(request.url);
  const statParam = url.searchParams.get("stat");
  const gameParam = url.searchParams.get("game");
  const filterParam = url.searchParams.get("filter");
  const filter: Filter =
    filterParam === "home" ||
    filterParam === "away" ||
    filterParam === "opponent"
      ? filterParam
      : "all";
  const seasonIdParam = url.searchParams.get("seasonId");
  const requestedSeasonId =
    seasonIdParam != null && Number.isInteger(Number(seasonIdParam))
      ? Number(seasonIdParam)
      : null;

  try {
    // Historical mode (`?game=<espnId>`): scope to the exact prop odds
    // frozen for that one already-played game, no "today" window at all —
    // the live-today query below requires a currently-SCHEDULED game,
    // which an already-final game never is.
    const { startOfDay, endOfDay } = todayWindow();
    const livePropOdds = await prisma.playerPropOdds.findMany({
      where: gameParam
        ? { playerId, game: { espnId: gameParam } }
        : {
            playerId,
            game: {
              status: "SCHEDULED",
              date: { gte: startOfDay, lt: endOfDay },
            },
          },
      include: {
        game: {
          include: {
            homeTeam: { select: TEAM_SELECT },
            awayTeam: { select: TEAM_SELECT },
          },
        },
        player: {
          select: {
            id: true,
            espnId: true,
            displayName: true,
            headshotUrl: true,
            currentTeamId: true,
          },
        },
        projection: true,
      },
    });

    if (livePropOdds.length === 0) {
      if (gameParam) {
        return NextResponse.json(
          { error: "no_prop_for_game" },
          { status: 404 },
        );
      }
      // No live prop today and no historical anchor — browse mode instead
      // of a dead-end 404 (see buildBrowseResponse).
      return buildBrowseResponse(
        playerId,
        filter,
        requestedSeasonId,
        statParam,
      );
    }

    const liveStatTypes = [
      ...new Set(livePropOdds.map((p) => p.statType)),
    ] as PropStatType[];
    const statType: PropStatType =
      statParam && liveStatTypes.includes(statParam as PropStatType)
        ? (statParam as PropStatType)
        : liveStatTypes[0];

    // Line per live stat type — same derivation as `line` below, computed
    // for every tracked stat so the grid can grade each of its columns,
    // not just the selected one. In historical mode this is the line
    // frozen for that specific game, not today's.
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
    const projectionRow =
      rowsForStat.map((p) => p.projection).find((p) => p != null) ?? null;

    // Which team the player suited up for in *that* game — not necessarily
    // their current team (a trade between then and now would make
    // `currentTeamId` wrong for a historical game), falling back to it only
    // when there's no boxscore row to read instead (e.g. a DNP).
    const historicalStat = gameParam
      ? await prisma.playerGameStat.findUnique({
          where: { gameId_playerId: { gameId: game.id, playerId } },
          select: { teamId: true },
        })
      : null;
    const playerTeamId = historicalStat?.teamId ?? player.currentTeamId;
    const isHomeToday = playerTeamId === game.homeTeamId;
    const team = isHomeToday ? game.homeTeam : game.awayTeam;
    const opponentTeam = isHomeToday ? game.awayTeam : game.homeTeam;

    // Pre-tip availability snapshot for this exact game (see
    // player-availability-tracking) — still meaningful in historical mode
    // as "their status going into that game," since it's frozen once the
    // game's no longer SCHEDULED, not deleted.
    const availabilityRow = await prisma.playerAvailability.findUnique({
      where: { gameId_playerId: { gameId: game.id, playerId } },
      select: { status: true, comment: true },
    });

    const historyRows = await prisma.playerGameStat.findMany({
      where: {
        playerId,
        points: { not: null },
        game: {
          status: "FINAL",
          ...(gameParam ? { date: { lt: game.date } } : {}),
        },
      },
      orderBy: { game: { date: "desc" } },
      select: HISTORY_ROW_SELECT,
    });

    // Regular-season games only populate the season dropdown — preseason
    // and postseason rows stay in historyRows (so they're never silently
    // dropped) but aren't offered as a selectable "season".
    const seasonsAvailable = Array.from(
      new Map(
        historyRows
          .filter((row) => row.game.seasonType === "REGULAR")
          .map((row) => [
            row.game.seasonId,
            { id: row.game.seasonId, year: row.game.season.year },
          ]),
      ).values(),
    ).sort((a, b) => b.year - a.year);

    const defaultSeason =
      seasonsAvailable.find((s) => s.year === currentSeasonYear()) ??
      seasonsAvailable[0] ??
      null;
    const selectedSeasonId =
      requestedSeasonId != null &&
      seasonsAvailable.some((s) => s.id === requestedSeasonId)
        ? requestedSeasonId
        : (defaultSeason?.id ?? null);

    // "vs Opponent" is its own small sample already — matchup history
    // against one team is worth more career-wide than confined to
    // whichever season happens to be selected, so skip season scoping here.
    const seasonScopedRows =
      filter === "opponent" || selectedSeasonId == null
        ? historyRows
        : historyRows.filter((row) => row.game.seasonId === selectedSeasonId);

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

    const filterPredicate = (g: {
      isHome: boolean;
      opponent: { id: number };
    }) => {
      if (filter === "home") return g.isHome;
      if (filter === "away") return !g.isHome;
      if (filter === "opponent") return g.opponent.id === opponentTeam.id;
      return true;
    };

    const filteredHistory = fullHistory.filter(filterPredicate);
    const filteredResults = filteredHistory
      .map((g) => g.result)
      .filter((r): r is PropResult => r !== null);
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
          return {
            statType: stat,
            value,
            result: statLine !== null ? compareToLine(value, statLine) : null,
          };
        }),
      }));

    return NextResponse.json({
      player: {
        id: player.id,
        espnId: player.espnId,
        displayName: player.displayName,
        headshotUrl: player.headshotUrl,
      },
      game: { espnId: game.espnId, date: game.date, isHomeToday },
      historical: Boolean(gameParam),
      availability: availabilityRow,
      team,
      opponent: opponentTeam,
      statType,
      statTypes: liveStatTypes,
      line,
      odds: { over: overRow?.odds ?? null, under: underRow?.odds ?? null },
      projection: projectionRow
        ? {
            projectedValue: projectionRow.projectedValue,
            stdev: projectionRow.stdev,
            bettable: projectionRow.bettable,
          }
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
    return NextResponse.json(
      { error: "Failed to load player prop research" },
      { status: 500 },
    );
  }
}
