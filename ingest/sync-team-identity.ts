/**
 * Historical backfill support — captures each team's era-accurate identity
 * (name/location/abbreviation/colors/logo) for a given season year. A
 * team's espnId is stable across relocation/rename (e.g. Seattle
 * SuperSonics -> Oklahoma City Thunder is one franchise id, confirmed
 * during historical-backfill research), so this is keyed by (teamId, year),
 * not a new Team row. Only teams that actually existed that year are
 * ingested (e.g. 1994 had 27 teams vs 30 today) — discovered from ESPN's
 * season-scoped team list, never assumed.
 *
 * Run with: npx tsx ingest/sync-team-identity.ts <year>
 */
import { prisma } from "./lib/db";
import { fetchEspnJson } from "../lib/espn/client";
import { espnEndpoints, idFromRef } from "../lib/espn/endpoints";
import { mapTeamSeasonIdentity, type EspnSeasonTeam } from "./mappers/team";

interface EspnSeasonTeamsResponse {
  items: { $ref: string }[];
}

export async function syncTeamIdentityForYear(year: number): Promise<number> {
  const teams = await prisma.team.findMany({ select: { id: true, espnId: true } });
  const teamIdByEspnId = new Map(teams.map((t) => [t.espnId, t.id]));

  const list = await fetchEspnJson<EspnSeasonTeamsResponse>(espnEndpoints.seasonTeams(String(year)));
  const teamEspnIds = list.items.map((i) => idFromRef(i.$ref));

  let synced = 0;
  await Promise.all(
    teamEspnIds.map(async (teamEspnId) => {
      const teamId = teamIdByEspnId.get(teamEspnId);
      if (!teamId) {
        console.warn(`sync-team-identity ${year}: unknown team espnId ${teamEspnId} (not in our Team table)`);
        return;
      }
      const seasonTeam = await fetchEspnJson<EspnSeasonTeam>(espnEndpoints.seasonTeam(String(year), teamEspnId));
      const input = mapTeamSeasonIdentity(seasonTeam, teamId, year);
      await prisma.teamSeasonIdentity.upsert({
        where: { teamId_year: { teamId, year } },
        create: input,
        update: input,
      });
      synced += 1;
    }),
  );

  console.log(`sync-team-identity ${year}: ${synced}/${teamEspnIds.length} teams synced`);
  return synced;
}

async function main() {
  const year = Number(process.argv[2]);
  if (!Number.isInteger(year)) {
    console.error("Usage: npx tsx ingest/sync-team-identity.ts <year>");
    process.exit(1);
  }
  await syncTeamIdentityForYear(year);
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
}
