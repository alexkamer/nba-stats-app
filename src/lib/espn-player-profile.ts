// Espn-only equivalent of /api/players/[athleteId]. Bio fields come from
// the team roster directory (same payload sync-reference-data.ts ingests),
// current-season stats from the per-athlete statistics endpoint
// (ingest/sync-aggregates.ts's syncPlayerSeasonStats equivalent).
//
// Two fields are intentionally simplified vs. the DB path, since
// reproducing them live would mean dozens of extra per-game calls for
// marginal value: `recentGames` is always [] (no per-game box score history
// without ingesting games), and `seasonRanks` is always null (ranking
// against the whole league needs every player's stats, too expensive
// per-request). Both are documented as accepted gaps in docs/DATA_SOURCES.md.
import { fetchEspnJson } from "@espn/client";
import { espnEndpoints } from "@espn/endpoints";
import { mapPlayerSeasonStat, type EspnStatisticsResponse } from "../../ingest/mappers/season-stats";
import { getUpcomingGames, type UpcomingGame } from "./espn-schedule";
import { currentSeasonYear, REGULAR_SEASON_TYPE } from "./espn-season";
import { getActivePlayersLive } from "./espn-players-list";

export interface LivePlayerProfile {
  player: {
    id: number;
    displayName: string;
    headshotUrl: string | null;
    jersey: string | null;
    heightIn: number | null;
    weightLb: number | null;
    birthDate: Date | null;
    birthPlace: string | null;
    college: string | null;
    draftYear: null;
    draftRound: null;
    draftPick: null;
    active: boolean;
    position: { name: string } | null;
    currentTeam: { id: number; displayName: string; abbreviation: string; logoUrl: string | null; color: string | null } | null;
    playerSeasonStats: unknown[];
  };
  recentGames: never[];
  seasonRanks: Record<"pointsPerGame" | "reboundsPerGame" | "assistsPerGame" | "fieldGoalPct", null>;
  nextGame: UpcomingGame | null;
}

export async function getPlayerProfileLive(athleteId: string): Promise<LivePlayerProfile | null> {
  const players = await getActivePlayersLive();
  const player = players.find((p) => p.espnId === athleteId);
  if (!player) return null;

  const seasonYear = currentSeasonYear();
  let playerSeasonStats: unknown[] = [];
  try {
    const stats = await fetchEspnJson<EspnStatisticsResponse>(
      espnEndpoints.athleteStatistics(String(seasonYear), REGULAR_SEASON_TYPE, athleteId),
    );
    const mapped = mapPlayerSeasonStat(stats, player.id, player.currentTeam.id, 0);
    const extra = JSON.parse(mapped.extra) as { name: string; stats: { name: string; value: number }[] }[];
    const findExtra = (name: string) => extra.flatMap((c) => c.stats).find((s) => s.name === name)?.value ?? null;
    playerSeasonStats = [
      {
        season: { year: seasonYear, type: "REGULAR" },
        team: { abbreviation: player.currentTeam.abbreviation, logoUrl: player.currentTeam.logoUrl },
        teams: [player.currentTeam],
        gamesPlayed: mapped.gamesPlayed,
        pointsPerGame: mapped.pointsPerGame,
        reboundsPerGame: mapped.reboundsPerGame,
        assistsPerGame: mapped.assistsPerGame,
        stealsPerGame: mapped.stealsPerGame,
        blocksPerGame: mapped.blocksPerGame,
        turnoversPerGame: mapped.turnoversPerGame,
        fieldGoalPct: mapped.fieldGoalPct,
        threePointPct: mapped.threePointPct,
        freeThrowPct: mapped.freeThrowPct,
        extraStats: {
          gamesStarted: findExtra("gamesStarted"),
          avgMinutes: findExtra("avgMinutes"),
          avgFieldGoalsMade: findExtra("avgFieldGoalsMade"),
          avgFieldGoalsAttempted: findExtra("avgFieldGoalsAttempted"),
          avgThreePointFieldGoalsMade: findExtra("avgThreePointFieldGoalsMade"),
          avgThreePointFieldGoalsAttempted: findExtra("avgThreePointFieldGoalsAttempted"),
          avgFreeThrowsMade: findExtra("avgFreeThrowsMade"),
          avgFreeThrowsAttempted: findExtra("avgFreeThrowsAttempted"),
          avgFouls: findExtra("avgFouls"),
          avgOffensiveRebounds: findExtra("avgOffensiveRebounds"),
          avgDefensiveRebounds: findExtra("avgDefensiveRebounds"),
          fieldGoalsMade: findExtra("fieldGoalsMade"),
          fieldGoalsAttempted: findExtra("fieldGoalsAttempted"),
          threePointFieldGoalsMade: findExtra("threePointFieldGoalsMade"),
          threePointFieldGoalsAttempted: findExtra("threePointFieldGoalsAttempted"),
          freeThrowsMade: findExtra("freeThrowsMade"),
          freeThrowsAttempted: findExtra("freeThrowsAttempted"),
          offensiveRebounds: findExtra("offensiveRebounds"),
          defensiveRebounds: findExtra("defensiveRebounds"),
          rebounds: findExtra("rebounds"),
          assists: findExtra("assists"),
          blocks: findExtra("blocks"),
          steals: findExtra("steals"),
          fouls: findExtra("fouls"),
          turnovers: findExtra("turnovers"),
          points: findExtra("points"),
          doubleDouble: findExtra("doubleDouble"),
          tripleDouble: findExtra("tripleDouble"),
          disqualifications: findExtra("disqualifications"),
          ejections: findExtra("ejections"),
          technicalFouls: findExtra("technicalFouls"),
          flagrantFouls: findExtra("flagrantFouls"),
          assistTurnoverRatio: findExtra("assistTurnoverRatio"),
          stealTurnoverRatio: findExtra("stealTurnoverRatio"),
          scoringEfficiency: findExtra("scoringEfficiency"),
          shootingEfficiency: findExtra("shootingEfficiency"),
        },
      },
    ];
  } catch {
    // No stats yet this season (e.g. rookie who hasn't debuted) — leave [].
  }

  let nextGame: UpcomingGame | null = null;
  try {
    const upcoming = await getUpcomingGames(player.currentTeam.espnId, seasonYear);
    nextGame = upcoming[0] ?? null;
  } catch {
    nextGame = null;
  }

  return {
    player: {
      id: player.id,
      displayName: player.displayName,
      headshotUrl: player.headshotUrl,
      jersey: player.jersey,
      heightIn: player.heightIn,
      weightLb: player.weightLb,
      birthDate: player.birthDate,
      birthPlace: player.birthPlace,
      college: player.college,
      draftYear: null,
      draftRound: null,
      draftPick: null,
      active: player.active,
      position: player.position ? { name: player.position.name } : null,
      currentTeam: {
        id: player.currentTeam.id,
        displayName: player.currentTeam.displayName,
        abbreviation: player.currentTeam.abbreviation,
        logoUrl: player.currentTeam.logoUrl,
        color: player.currentTeam.color,
      },
      playerSeasonStats,
    },
    recentGames: [],
    seasonRanks: {
      pointsPerGame: null,
      reboundsPerGame: null,
      assistsPerGame: null,
      fieldGoalPct: null,
    },
    nextGame,
  };
}
