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

// Period-by-period scores and W-L records shown in the scoreboard header —
// never persisted (SPEC.md Sec 4/6 has no linescore/record columns), so
// every game detail page pulls these live from ESPN's summary header
// regardless of whether the rest of the page is DB- or live-sourced.
export interface HeaderExtras {
  statusDetail: string;
  home: { record: string | null; splitRecord: string | null; linescores: number[] };
  away: { record: string | null; splitRecord: string | null; linescores: number[] };
  gameInfo: GameInfo;
  seasonSeries: SeasonSeries | null;
}

// The head-to-head "Matchups" card — also never persisted, and also only
// derivable live since it spans multiple games (including ones not yet
// played), not just this one.
export interface SeasonSeries {
  summary: string;
  seriesScore: string | null;
  events: {
    espnId: string;
    date: string;
    statusDetail: string;
    completed: boolean;
    home: { abbreviation: string; score: number | null; winner: boolean };
    away: { abbreviation: string; score: number | null; winner: boolean };
    broadcasts: string[];
  }[];
}

// Broadcast/officiating-crew info has no home in our schema at all (SPEC.md
// Sec 6 tracks neither) — pulled live alongside the header extras, from the
// same summary response's `gameInfo`/`broadcasts` keys.
export interface GameInfo {
  venue: { name: string; city: string | null; state: string | null; imageUrl: string | null } | null;
  attendance: number | null;
  officials: { name: string; position: string }[];
  broadcasts: string[];
}

interface EspnHeaderCompetitor {
  homeAway: "home" | "away";
  linescores?: { displayValue: string }[];
  record?: { type: string; summary: string }[];
}

interface EspnGameInfo {
  venue?: {
    fullName: string;
    address?: { city?: string; state?: string };
    images?: { href: string }[];
  };
  attendance?: number;
  officials?: { displayName: string; position?: { displayName?: string } }[];
}

interface EspnBroadcast {
  media?: { shortName?: string };
  station?: string;
}

interface EspnSeasonSeriesEvent {
  id: string;
  date: string;
  statusType: { completed: boolean; shortDetail: string };
  competitors: {
    homeAway: "home" | "away";
    winner?: boolean;
    score?: string;
    team: { abbreviation: string };
  }[];
  broadcasts?: EspnBroadcast[];
}

interface EspnSeasonSeries {
  shortSummary?: string;
  summary?: string;
  seriesScore?: string;
  events: EspnSeasonSeriesEvent[];
}

function extractSeasonSeries(seasonSeries: EspnSeasonSeries[] | undefined): SeasonSeries | null {
  const series = seasonSeries?.[0];
  if (!series) return null;
  return {
    summary: series.shortSummary ?? series.summary ?? "",
    seriesScore: series.seriesScore ?? null,
    events: series.events.map((event) => {
      const home = event.competitors.find((c) => c.homeAway === "home");
      const away = event.competitors.find((c) => c.homeAway === "away");
      const side = (c: typeof home) => ({
        abbreviation: c?.team.abbreviation ?? "",
        score: c?.score !== undefined ? Number(c.score) : null,
        winner: c?.winner ?? false,
      });
      return {
        espnId: event.id,
        date: event.date,
        statusDetail: event.statusType.shortDetail,
        completed: event.statusType.completed,
        home: side(home),
        away: side(away),
        broadcasts: (event.broadcasts ?? []).map((b) => b.media?.shortName ?? b.station ?? "").filter(Boolean),
      };
    }),
  };
}

function extractGameInfo(summary: { gameInfo?: EspnGameInfo; broadcasts?: EspnBroadcast[] }): GameInfo {
  const venue = summary.gameInfo?.venue;
  return {
    venue: venue
      ? {
          name: venue.fullName,
          city: venue.address?.city ?? null,
          state: venue.address?.state ?? null,
          imageUrl: venue.images?.[0]?.href ?? null,
        }
      : null,
    attendance: summary.gameInfo?.attendance ?? null,
    officials: (summary.gameInfo?.officials ?? []).map((o) => ({
      name: o.displayName,
      position: o.position?.displayName ?? "Referee",
    })),
    broadcasts: (summary.broadcasts ?? []).map((b) => b.media?.shortName ?? b.station ?? "").filter(Boolean),
  };
}

function extractHeaderExtras(
  competition: {
    status: { type: { detail?: string; shortDetail?: string; name: string } };
    competitors: EspnHeaderCompetitor[];
  },
  summary: { gameInfo?: EspnGameInfo; broadcasts?: EspnBroadcast[]; seasonseries?: EspnSeasonSeries[] },
): HeaderExtras {
  const home = competition.competitors.find((c) => c.homeAway === "home");
  const away = competition.competitors.find((c) => c.homeAway === "away");
  const side = (competitor: EspnHeaderCompetitor | undefined, splitType: "home" | "road") => ({
    record: competitor?.record?.find((r) => r.type === "total")?.summary ?? null,
    splitRecord: competitor?.record?.find((r) => r.type === splitType)?.summary ?? null,
    linescores: (competitor?.linescores ?? []).map((l) => Number(l.displayValue)),
  });
  return {
    statusDetail: competition.status.type.shortDetail ?? competition.status.type.detail ?? competition.status.type.name,
    home: side(home, "home"),
    away: side(away, "road"),
    gameInfo: extractGameInfo(summary),
    seasonSeries: extractSeasonSeries(summary.seasonseries),
  };
}

export async function getGameHeaderExtras(eventId: string): Promise<HeaderExtras | null> {
  try {
    const summary = await fetchEspnJson<{
      header: { competitions: [{ status: { type: { detail?: string; shortDetail?: string; name: string } }; competitors: EspnHeaderCompetitor[] }] };
      gameInfo?: EspnGameInfo;
      broadcasts?: EspnBroadcast[];
      seasonseries?: EspnSeasonSeries[];
    }>(espnEndpoints.summary(eventId));
    return extractHeaderExtras(summary.header.competitions[0], summary);
  } catch {
    return null;
  }
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
  home: { espnId: string; abbreviation: string; displayName: string; score: number | null; logoUrl: string | null; color: string | null };
  away: { espnId: string; abbreviation: string; displayName: string; score: number | null; logoUrl: string | null; color: string | null };
  teamGameStats: (ReturnType<typeof mapTeamGameStat> & { teamEspnId: string })[];
  playerGameStats: (ReturnType<typeof mapPlayerGameStat> & {
    playerDisplayName: string;
    headshotUrl: string | null;
    jersey: string | null;
    teamEspnId: string;
  })[];
  plays: ReturnType<typeof mapPlay>[];
  odds: LiveOdds | null;
  headerExtras: HeaderExtras;
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
          status: { type: { name: string; detail?: string; shortDetail?: string } };
          competitors: (EspnHeaderCompetitor & {
            score?: string;
            team: { id: string; abbreviation: string; displayName: string; color?: string; logos?: { href: string }[] };
          })[];
        },
      ];
    };
    gameInfo?: EspnGameInfo;
    broadcasts?: EspnBroadcast[];
    seasonseries?: EspnSeasonSeries[];
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
        headshotUrl: entry.athlete.headshot?.href ?? null,
        jersey: entry.athlete.jersey ?? null,
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
      logoUrl: home.team.logos?.[0]?.href ?? null,
      color: home.team.color ? `#${home.team.color}` : null,
    },
    away: {
      espnId: away.team.id,
      abbreviation: away.team.abbreviation,
      displayName: away.team.displayName,
      score: away.score !== undefined ? Number(away.score) : null,
      logoUrl: away.team.logos?.[0]?.href ?? null,
      color: away.team.color ? `#${away.team.color}` : null,
    },
    teamGameStats,
    playerGameStats,
    plays,
    odds,
    headerExtras: extractHeaderExtras(competition, summary),
  };
}
