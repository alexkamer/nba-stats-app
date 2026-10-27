/**
 * Live proxy for ESPN's team roster endpoint's `coach` array — same
 * non-DB-persisted convention as espn-team-leaders.ts, since there's no
 * Coach model in the schema.
 */
import { fetchEspnJson } from "../../lib/espn/client";
import { espnEndpoints } from "../../lib/espn/endpoints";

interface EspnCoach {
  firstName: string;
  lastName: string;
  experience?: number;
}

interface EspnRosterResponse {
  coach?: EspnCoach[];
}

export interface TeamCoach {
  name: string;
  experienceYears: number | null;
}

export async function getTeamCoach(teamEspnId: string): Promise<TeamCoach | null> {
  const data = await fetchEspnJson<EspnRosterResponse>(espnEndpoints.teamRoster(teamEspnId));
  const coach = data.coach?.[0];
  if (!coach) return null;
  return {
    name: `${coach.firstName} ${coach.lastName}`,
    experienceYears: coach.experience ?? null,
  };
}
