/**
 * Pre-game "Preview" tab data for a scheduled game's detail page — never
 * exposed for in-progress/final games (see src/app/api/games/[eventId]/route.ts).
 * Nothing here is persisted beyond what already exists: lineups are derived
 * live from each team's depth chart (ESPN's public summary response carries
 * no confirmed-starters field pre-tipoff, verified against live data — see
 * openspec/changes/add-pregame-preview/design.md), while projection and
 * availability reuse the same frozen rows the betting pages already read.
 */
import { prisma } from "@/lib/db";
import { getTeamDepthChart, type DepthChartPosition } from "./espn-team-depth-chart";
import { marginToWinPct } from "../../lib/projections/confidence";

export interface ProjectedStarter {
  espnId: string;
  displayName: string;
  position: string | null;
}

export interface GamePreviewProjection {
  projectedHomeScore: number;
  projectedAwayScore: number;
  homeWinPct: number | null;
  awayWinPct: number | null;
}

export type AvailabilityStatusValue = "OUT" | "DOUBTFUL" | "QUESTIONABLE" | "PROBABLE" | "AVAILABLE";

export interface GamePreviewAvailabilityEntry {
  playerId: number;
  displayName: string;
  status: AvailabilityStatusValue;
  comment: string | null;
}

export type PropLean = "OVER" | "UNDER" | "PUSH";

export interface GamePreviewPlayerProp {
  playerId: number;
  playerName: string;
  statType: string;
  projectedValue: number;
  line: number;
  lean: PropLean;
  odds: number | null;
}

// `article`/`espnPredictor` are attached by the API route from the
// already-fetched ESPN summary (getLiveGameDetail's `previewArticle`/
// `espnPredictor`), not computed here - everything else in this type is
// DB/depth-chart-backed.
export interface GamePreview {
  projection: GamePreviewProjection | null;
  availability: { home: GamePreviewAvailabilityEntry[]; away: GamePreviewAvailabilityEntry[] } | null;
  lineups: { home: ProjectedStarter[] | null; away: ProjectedStarter[] | null };
  playerProps: GamePreviewPlayerProp[];
}

// Pulls the rank-1 athlete per position out of a depth chart — ESPN's own
// position order (pg/sg/sf/pf/c), so this is "the starting five" only in
// the depth-chart sense, not a confirmed lineup for tonight's game.
export function pickStartingFive(depthChart: DepthChartPosition[]): string[] {
  return depthChart
    .map((position) => position.athleteEspnIdsByRank[0])
    .filter((espnId): espnId is string => Boolean(espnId));
}

async function getProjectedStarters(teamEspnId: string, seasonYear: number): Promise<ProjectedStarter[] | null> {
  let depthChart: DepthChartPosition[];
  try {
    depthChart = await getTeamDepthChart(teamEspnId, seasonYear);
  } catch {
    return null;
  }

  const startingEspnIds = pickStartingFive(depthChart);
  if (startingEspnIds.length === 0) return null;

  const players = await prisma.player.findMany({
    where: { espnId: { in: startingEspnIds } },
    select: { espnId: true, displayName: true, position: { select: { abbreviation: true } } },
  });
  const byEspnId = new Map(players.map((p) => [p.espnId, p]));

  const starters = startingEspnIds
    .map((espnId): ProjectedStarter | null => {
      const player = byEspnId.get(espnId);
      return player
        ? { espnId, displayName: player.displayName, position: player.position?.abbreviation ?? null }
        : null;
    })
    .filter((starter): starter is ProjectedStarter => starter !== null);

  return starters.length > 0 ? starters : null;
}

type AvailabilityRow = {
  playerId: number;
  status: string;
  comment: string | null;
  player: { displayName: string; currentTeamId: number | null };
};

// Splits a game's full-roster availability rows by team — pure so the
// grouping logic is testable without a database.
export function groupAvailabilityByTeam(
  rows: AvailabilityRow[],
  homeTeamId: number,
  awayTeamId: number,
): { home: GamePreviewAvailabilityEntry[]; away: GamePreviewAvailabilityEntry[] } {
  const toEntry = (row: AvailabilityRow): GamePreviewAvailabilityEntry => ({
    playerId: row.playerId,
    displayName: row.player.displayName,
    status: row.status as AvailabilityStatusValue,
    comment: row.comment,
  });
  return {
    home: rows.filter((row) => row.player.currentTeamId === homeTeamId).map(toEntry),
    away: rows.filter((row) => row.player.currentTeamId === awayTeamId).map(toEntry),
  };
}

type PropProjectionRow = {
  playerId: number;
  statType: string;
  line: number | null;
  projectedValue: number;
  player: { displayName: string };
};

type PropOddsRow = { playerId: number; statType: string; side: string; odds: number | null };

// Same lean/odds-matching logic as api/betting/upcoming/route.ts's
// playerProps mapping, extracted here so the per-game Odds tab doesn't
// reimplement it — pure so it's testable without a database.
export function buildPlayerPropLeans(projections: PropProjectionRow[], oddsRows: PropOddsRow[]): GamePreviewPlayerProp[] {
  return projections
    .filter((p): p is PropProjectionRow & { line: number } => p.line != null)
    .map((p) => {
      const lean: PropLean = p.projectedValue > p.line ? "OVER" : p.projectedValue < p.line ? "UNDER" : "PUSH";
      const oddsRow = oddsRows.find((o) => o.playerId === p.playerId && o.statType === p.statType && o.side === lean);
      return {
        playerId: p.playerId,
        playerName: p.player.displayName,
        statType: p.statType,
        projectedValue: p.projectedValue,
        line: p.line,
        lean,
        odds: oddsRow?.odds ?? null,
      };
    });
}

/** Aggregates everything the Preview tab needs for one scheduled game.
 * Projection/availability depend on this game already being ingested as a
 * DB row (the betting ingest jobs' job, not this function's) — a
 * brand-new scheduled game not yet ingested simply omits those two
 * sections. Lineups don't depend on DB ingestion at all. */
export async function getGamePreview(
  eventId: string,
  homeTeamEspnId: string,
  awayTeamEspnId: string,
  seasonYear: number,
): Promise<GamePreview> {
  const [lineupHome, lineupAway, dbGame] = await Promise.all([
    getProjectedStarters(homeTeamEspnId, seasonYear),
    getProjectedStarters(awayTeamEspnId, seasonYear),
    prisma.game.findUnique({
      where: { espnId: eventId },
      select: {
        id: true,
        homeTeamId: true,
        awayTeamId: true,
        gameProjection: true,
      },
    }),
  ]);

  let availability: GamePreview["availability"] = null;
  let playerProps: GamePreviewPlayerProp[] = [];
  if (dbGame) {
    const [availabilityRows, propProjections, propOdds] = await Promise.all([
      prisma.playerAvailability.findMany({
        where: { gameId: dbGame.id },
        select: {
          playerId: true,
          status: true,
          comment: true,
          player: { select: { displayName: true, currentTeamId: true } },
        },
      }),
      prisma.playerPropProjection.findMany({
        where: { gameId: dbGame.id, line: { not: null } },
        select: {
          playerId: true,
          statType: true,
          line: true,
          projectedValue: true,
          player: { select: { displayName: true } },
        },
      }),
      prisma.playerPropOdds.findMany({
        where: { gameId: dbGame.id },
        select: { playerId: true, statType: true, side: true, odds: true },
      }),
    ]);
    availability = groupAvailabilityByTeam(availabilityRows, dbGame.homeTeamId, dbGame.awayTeamId);
    playerProps = buildPlayerPropLeans(propProjections, propOdds);
  }

  // Win% is derived from our own margin projection (not ESPN's predictor
  // snapshot) so the two numbers shown together can never point in
  // different directions - see openspec/changes/add-pregame-preview/design.md.
  let projection: GamePreview["projection"] = null;
  if (dbGame?.gameProjection) {
    const homeWinPct = marginToWinPct(dbGame.gameProjection.projectedMargin, dbGame.gameProjection.marginStdev);
    projection = {
      projectedHomeScore: dbGame.gameProjection.projectedHomeScore,
      projectedAwayScore: dbGame.gameProjection.projectedAwayScore,
      homeWinPct,
      awayWinPct: homeWinPct === null ? null : 100 - homeWinPct,
    };
  }

  return { projection, availability, lineups: { home: lineupHome, away: lineupAway }, playerProps };
}
