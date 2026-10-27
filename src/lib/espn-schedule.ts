/**
 * Live proxy for ESPN's team schedule endpoint — used only to fill in games
 * our DB doesn't have yet. `ingest/sync-completed-games.ts` only ingests a
 * game once it's `final`, so a team's upcoming (and today's in-progress)
 * games never make it into Game rows. Nothing here is persisted — same
 * non-DB-writing convention as espn-live.ts.
 */
import { fetchEspnJson } from "../../lib/espn/client";
import { espnEndpoints } from "../../lib/espn/endpoints";

interface EspnScheduleTeam {
  id: string;
  abbreviation: string;
  displayName: string;
  logos?: { href: string; rel: string[] }[];
}

interface EspnScheduleBroadcast {
  media?: { shortName?: string };
}

interface EspnScheduleEvent {
  id: string;
  date: string;
  competitions: {
    status: { type: { name: string; completed: boolean } };
    broadcasts?: EspnScheduleBroadcast[];
    competitors: { homeAway: "home" | "away"; score?: string; team: EspnScheduleTeam }[];
  }[];
}

interface EspnScheduleResponse {
  events?: EspnScheduleEvent[];
}

export interface UpcomingGame {
  espnId: string;
  date: string;
  status: "SCHEDULED" | "LIVE";
  broadcast: string | null;
  home: { espnId: string; abbreviation: string; displayName: string };
  away: { espnId: string; abbreviation: string; displayName: string };
}

/** Games from this team's season schedule that aren't `final` yet — i.e.
 * everything `sync-completed-games.ts` hasn't (and won't, until they finish)
 * ingest into the DB. */
export async function getUpcomingGames(teamEspnId: string, seasonYear: number): Promise<UpcomingGame[]> {
  const data = await fetchEspnJson<EspnScheduleResponse>(
    espnEndpoints.teamSchedule(teamEspnId, String(seasonYear)),
  );
  const games: UpcomingGame[] = [];
  for (const event of data.events ?? []) {
    const competition = event.competitions[0];
    if (competition.status.type.completed) continue;
    const home = competition.competitors.find((c) => c.homeAway === "home");
    const away = competition.competitors.find((c) => c.homeAway === "away");
    if (!home || !away) continue;
    const broadcast = competition.broadcasts?.[0]?.media?.shortName ?? null;
    games.push({
      espnId: event.id,
      date: event.date,
      status: competition.status.type.name === "STATUS_IN_PROGRESS" ? "LIVE" : "SCHEDULED",
      broadcast,
      home: { espnId: home.team.id, abbreviation: home.team.abbreviation, displayName: home.team.displayName },
      away: { espnId: away.team.id, abbreviation: away.team.abbreviation, displayName: away.team.displayName },
    });
  }
  return games;
}
