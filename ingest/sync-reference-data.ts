/**
 * M3 — reference data ingestion (PLAN.md Sec 3/M3).
 * Ingests conferences, divisions, venues, positions, teams, and full
 * rosters. Upserts by espnId throughout — safe to re-run (SPEC.md Sec 9.6).
 *
 * Run with: npx tsx ingest/sync-reference-data.ts
 */
import { prisma } from "./lib/db";
import { fetchEspnJson } from "../lib/espn/client";
import { espnEndpoints } from "../lib/espn/endpoints";
import { fetchLeagueTree } from "./mappers/reference-tree";
import { mapTeam, mapVenue, type EspnSiteTeamListItem, type EspnTeamDetail } from "./mappers/team";
import { mapPlayer, mapPosition, type EspnRosterAthlete } from "./mappers/player";

const CURRENT_SEASON_YEAR = "2025";
const REGULAR_SEASON_TYPE = "2";

interface EspnTeamsListResponse {
  sports: { leagues: { teams: { team: EspnSiteTeamListItem }[] }[] }[];
}

interface EspnRosterResponse {
  athletes: EspnRosterAthlete[];
}

async function syncConferencesAndDivisions() {
  const tree = await fetchLeagueTree(CURRENT_SEASON_YEAR, REGULAR_SEASON_TYPE);

  // teamEspnId -> division's internal id, built up as we upsert divisions.
  const teamIdToDivisionId = new Map<string, number>();

  for (const conf of tree) {
    const conference = await prisma.conference.upsert({
      where: { espnId: conf.espnId },
      create: { espnId: conf.espnId, name: conf.name },
      update: { name: conf.name },
    });

    for (const div of conf.divisions) {
      const division = await prisma.division.upsert({
        where: { espnId: div.espnId },
        create: { espnId: div.espnId, name: div.name, conferenceId: conference.id },
        update: { name: div.name, conferenceId: conference.id },
      });
      for (const teamEspnId of div.teamEspnIds) {
        teamIdToDivisionId.set(teamEspnId, division.id);
      }
    }
  }

  console.log(
    `conferences/divisions synced: ${tree.length} conferences, ` +
      `${tree.reduce((n, c) => n + c.divisions.length, 0)} divisions, ` +
      `${teamIdToDivisionId.size} teams mapped to a division`,
  );
  return teamIdToDivisionId;
}

async function syncTeams(teamIdToDivisionId: Map<string, number>) {
  const teamsList = await fetchEspnJson<EspnTeamsListResponse>(espnEndpoints.teams());
  const siteTeams = teamsList.sports[0].leagues[0].teams.map((t) => t.team);

  const teamsById = new Map<string, { id: number }>();

  await Promise.all(
    siteTeams.map(async (siteTeam) => {
      const detail = await fetchEspnJson<EspnTeamDetail>(espnEndpoints.team(siteTeam.id));
      const venueInput = mapVenue(detail.team.franchise?.venue);

      let venueId: number | null = null;
      if (venueInput) {
        const venue = await prisma.venue.upsert({
          where: { espnId: venueInput.espnId },
          create: venueInput,
          update: venueInput,
        });
        venueId = venue.id;
      }

      const divisionId = teamIdToDivisionId.get(siteTeam.id) ?? null;
      const teamInput = mapTeam(siteTeam, divisionId, venueId);
      const team = await prisma.team.upsert({
        where: { espnId: teamInput.espnId },
        create: teamInput,
        update: teamInput,
      });
      teamsById.set(siteTeam.id, { id: team.id });
    }),
  );

  console.log(`teams synced: ${teamsById.size}`);
  return teamsById;
}

async function syncRosters(teamsById: Map<string, { id: number }>) {
  const positionIdByEspnId = new Map<string, number>();
  let playerCount = 0;

  await Promise.all(
    Array.from(teamsById.entries()).map(async ([teamEspnId, team]) => {
      const roster = await fetchEspnJson<EspnRosterResponse>(espnEndpoints.teamRoster(teamEspnId));

      for (const athlete of roster.athletes) {
        let positionId: number | null = null;
        const positionInput = mapPosition(athlete.position);
        if (positionInput) {
          let internalId = positionIdByEspnId.get(positionInput.espnId);
          if (!internalId) {
            const position = await prisma.position.upsert({
              where: { espnId: positionInput.espnId },
              create: positionInput,
              update: positionInput,
            });
            internalId = position.id;
            positionIdByEspnId.set(positionInput.espnId, internalId);
          }
          positionId = internalId;
        }

        const playerInput = mapPlayer(athlete, positionId, team.id);
        await prisma.player.upsert({
          where: { espnId: playerInput.espnId },
          create: playerInput,
          update: playerInput,
        });
        playerCount += 1;
      }
    }),
  );

  console.log(`rosters synced: ${playerCount} players across ${teamsById.size} teams`);
}

async function main() {
  const teamIdToDivisionId = await syncConferencesAndDivisions();
  const teamsById = await syncTeams(teamIdToDivisionId);
  await syncRosters(teamsById);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
