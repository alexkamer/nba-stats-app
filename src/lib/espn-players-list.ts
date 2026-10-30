// Espn-only equivalent of /api/players — iterates every team's roster
// (same 30 calls ingest/sync-reference-data.ts's syncRosters makes) rather
// than the CORE athletes-list endpoint, which only returns $refs and would
// need a second fetch per athlete (500+ calls) to get a usable shape.
import { fetchEspnJson } from "@espn/client";
import { espnEndpoints } from "@espn/endpoints";
import { mapPlayer, mapPosition, type EspnRosterAthlete } from "../../ingest/mappers/player";
import { cachedEspn } from "./espn-cache";
import { getTeamsLive, type LiveTeam } from "./espn-teams-list";

interface EspnRosterResponse {
  athletes: EspnRosterAthlete[];
}

export interface LivePosition {
  id: string;
  espnId: string;
  name: string;
  abbreviation: string;
}

export interface LivePlayer {
  id: number;
  espnId: string;
  displayName: string;
  fullName: string;
  headshotUrl: string | null;
  jersey: string | null;
  heightIn: number | null;
  weightLb: number | null;
  birthDate: Date | null;
  birthPlace: string | null;
  college: string | null;
  active: boolean;
  currentTeam: LiveTeam;
  position: LivePosition | null;
}

async function fetchActivePlayersLive(): Promise<LivePlayer[]> {
  const teams = await getTeamsLive();
  const rosters = await Promise.all(
    teams.map((team) => fetchEspnJson<EspnRosterResponse>(espnEndpoints.teamRoster(team.espnId))),
  );

  const players: LivePlayer[] = [];
  teams.forEach((team, i) => {
    for (const athlete of rosters[i].athletes) {
      const mapped = mapPlayer(athlete, null, team.id);
      if (!mapped.active) continue;
      const positionInput = mapPosition(athlete.position);
      players.push({
        id: Number(mapped.espnId),
        espnId: mapped.espnId,
        displayName: mapped.displayName,
        fullName: mapped.fullName,
        headshotUrl: mapped.headshotUrl,
        jersey: mapped.jersey,
        heightIn: mapped.heightIn,
        weightLb: mapped.weightLb,
        birthDate: mapped.birthDate,
        birthPlace: mapped.birthPlace,
        college: mapped.college,
        active: mapped.active,
        currentTeam: team,
        position: positionInput ? { id: positionInput.espnId, ...positionInput } : null,
      });
    }
  });
  return players.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** 5-minute cache — this fans out to ~31 ESPN calls (team directory + one
 * roster call per team) on a cold hit. */
export function getActivePlayersLive(): Promise<LivePlayer[]> {
  return cachedEspn("active-players-live", 5 * 60 * 1000, fetchActivePlayersLive);
}
