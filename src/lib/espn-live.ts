/**
 * M8 — live proxy path (SPEC.md Sec 4, PLAN.md Sec 3/M8). Thin wrapper over
 * lib/espn/client.ts, used only by routes serving games that aren't
 * `final` yet (or scoreboard views of today/future dates). Nothing here
 * ever writes to the database — that's the incremental sync job's job
 * (ingest/lib/game-ingest.ts), once a game actually finishes.
 */
import { fetchEspnJson } from "../../lib/espn/client";
import { espnEndpoints } from "../../lib/espn/endpoints";
import {
  mapPlayerGameStat,
  mapTeamGameStat,
  type EspnBoxscore,
} from "../../ingest/mappers/boxscore";
import { mapPlay, type EspnPlay } from "../../ingest/mappers/playbyplay";
import { pickPrimaryProvider, type EspnPickcenterEntry } from "../../ingest/mappers/odds";

// Richer than ingest/mappers/game.ts's EspnScoreboardEvent (which only
// needs team.id for FK lookups) — the scoreboard view needs to display
// team names/abbreviations directly, with no DB round-trip to resolve them.
interface EspnScoreboardTeam {
  id: string;
  abbreviation: string;
  displayName: string;
}

interface EspnScoreboardEvent {
  id: string;
  date: string;
  status: { type: { name: string; detail?: string } };
  competitions: {
    status: { period?: number; displayClock?: string };
    competitors: { homeAway: "home" | "away"; score?: string; team: EspnScoreboardTeam }[];
  }[];
}

interface EspnScoreboardResponse {
  events: EspnScoreboardEvent[];
}

interface EspnSummaryResponse {
  boxscore: EspnBoxscore;
  plays: EspnPlay[];
  pickcenter?: EspnPickcenterEntry[];
}

export interface LiveOdds {
  provider: string;
  spread: number | null;
  overUnder: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
  favoriteSide: "home" | "away" | null;
}

export interface ScoreboardGameCard {
  espnId: string;
  date: string;
  statusName: string; // e.g. STATUS_SCHEDULED / STATUS_IN_PROGRESS / STATUS_FINAL
  statusDetail: string;
  period: number | null;
  clock: string | null;
  home: { espnId: string; abbreviation: string; displayName: string; score: number | null };
  away: { espnId: string; abbreviation: string; displayName: string; score: number | null };
}

export async function getScoreboard(date: string): Promise<ScoreboardGameCard[]> {
  const board = await fetchEspnJson<EspnScoreboardResponse>(espnEndpoints.scoreboard(date));
  return (board.events ?? []).map((event) => {
    const competition = event.competitions[0];
    const home = competition.competitors.find((c) => c.homeAway === "home");
    const away = competition.competitors.find((c) => c.homeAway === "away");
    const statusType = event.status.type;
    // ESPN reports "0" (not omitted) for a game that hasn't tipped off yet —
    // treat that as "no score to show", not a real 0-0 score.
    const isScheduled = statusType.name === "STATUS_SCHEDULED";
    return {
      espnId: event.id,
      date: event.date,
      statusName: statusType.name,
      statusDetail: statusType.detail ?? statusType.name,
      period: competition.status.period ?? null,
      clock: competition.status.displayClock ?? null,
      home: {
        espnId: home!.team.id,
        abbreviation: home!.team.abbreviation,
        displayName: home!.team.displayName,
        score: !isScheduled && home!.score !== undefined ? Number(home!.score) : null,
      },
      away: {
        espnId: away!.team.id,
        abbreviation: away!.team.abbreviation,
        displayName: away!.team.displayName,
        score: !isScheduled && away!.score !== undefined ? Number(away!.score) : null,
      },
    };
  });
}

export interface LiveGameDetail {
  espnId: string;
  source: "live";
  statusName: string;
  statusDetail: string;
  date: string;
  home: { espnId: string; abbreviation: string; displayName: string; score: number | null };
  away: { espnId: string; abbreviation: string; displayName: string; score: number | null };
  teamGameStats: (ReturnType<typeof mapTeamGameStat> & { teamEspnId: string })[];
  playerGameStats: (ReturnType<typeof mapPlayerGameStat> & { playerDisplayName: string; teamEspnId: string })[];
  plays: ReturnType<typeof mapPlay>[];
  odds: LiveOdds | null;
}

/** Fetches a game live from ESPN and reshapes it into roughly the same
 * stat-field shape the DB-backed path uses (SPEC.md Sec 4) — but keyed by
 * espnId/display name rather than internal FK ids, since this game may not
 * exist in our DB at all yet. Returns null if ESPN doesn't know this event. */
export async function getLiveGameDetail(eventId: string): Promise<LiveGameDetail | null> {
  let summary: EspnSummaryResponse & {
    header: {
      id: string;
      competitions: [
        {
          date: string;
          status: { type: { name: string; detail?: string } };
          competitors: { homeAway: "home" | "away"; score?: string; team: { id: string; abbreviation: string; displayName: string } }[];
        },
      ];
    };
  };
  try {
    summary = await fetchEspnJson(espnEndpoints.summary(eventId));
  } catch {
    return null;
  }

  const competition = summary.header.competitions[0];
  const home = competition.competitors.find((c) => c.homeAway === "home")!;
  const away = competition.competitors.find((c) => c.homeAway === "away")!;

  const teamGameStats = (summary.boxscore.teams ?? []).map((teamBox) => {
    const teamCompetitor = [home, away].find((c) => c.team.id === teamBox.team.id);
    const points = teamCompetitor?.score !== undefined ? Number(teamCompetitor.score) : null;
    // gameId/teamId args are unused by the DB — placeholder 0, this result is never
    // persisted. teamEspnId carries the real identity for the frontend to tell teams apart.
    return { ...mapTeamGameStat(teamBox, 0, 0, points), teamEspnId: teamBox.team.id };
  });

  const playerGameStats = (summary.boxscore.players ?? []).flatMap((group) => {
    const keys = group.statistics[0]?.keys ?? [];
    const athletes = group.statistics[0]?.athletes ?? [];
    return athletes
      .filter((entry) => entry.athlete?.id)
      .map((entry) => ({
        ...mapPlayerGameStat(entry, keys, 0, 0, 0),
        playerDisplayName: entry.athlete.displayName,
        teamEspnId: group.team.id,
      }));
  });

  const plays = (summary.plays ?? []).map((play) => mapPlay(play, 0, null));

  const primaryOdds = pickPrimaryProvider(summary.pickcenter);
  const odds: LiveOdds | null = primaryOdds
    ? {
        provider: primaryOdds.provider.name,
        spread: primaryOdds.spread ?? null,
        overUnder: primaryOdds.overUnder ?? null,
        homeMoneyline: primaryOdds.homeTeamOdds?.moneyLine ?? null,
        awayMoneyline: primaryOdds.awayTeamOdds?.moneyLine ?? null,
        favoriteSide: primaryOdds.homeTeamOdds?.favorite ? "home" : primaryOdds.awayTeamOdds?.favorite ? "away" : null,
      }
    : null;

  return {
    espnId: eventId,
    source: "live",
    statusName: competition.status.type.name,
    statusDetail: competition.status.type.detail ?? competition.status.type.name,
    date: competition.date,
    home: {
      espnId: home.team.id,
      abbreviation: home.team.abbreviation,
      displayName: home.team.displayName,
      score: home.score !== undefined ? Number(home.score) : null,
    },
    away: {
      espnId: away.team.id,
      abbreviation: away.team.abbreviation,
      displayName: away.team.displayName,
      score: away.score !== undefined ? Number(away.score) : null,
    },
    teamGameStats,
    playerGameStats,
    plays,
    odds,
  };
}
