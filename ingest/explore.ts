/* eslint-disable @typescript-eslint/no-explicit-any -- probing unknown raw ESPN JSON shapes before real types exist */
/**
 * M2 exploration spike (PLAN.md Sec 3, M2). Throwaway-but-kept script:
 * hits real ESPN NBA endpoints, saves one sample payload per endpoint to
 * ingest/__fixtures__ for reference while writing mappers, and fires a
 * concurrency burst to observe real throttling behavior before locking in
 * rate-limit constants.
 *
 * Run with: npx tsx ingest/explore.ts
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { fetchEspnJson, setEspnConcurrency } from "../lib/espn/client";
import { espnEndpoints } from "../lib/espn/endpoints";

const FIXTURES_DIR = join(__dirname, "__fixtures__");

function save(name: string, data: unknown) {
  mkdirSync(FIXTURES_DIR, { recursive: true });
  writeFileSync(join(FIXTURES_DIR, `${name}.json`), JSON.stringify(data, null, 2));
  console.log(`saved ${name}.json`);
}

async function exploreCoreEndpoints() {
  // A known recent date with real completed games (regular season).
  const scoreboard = await fetchEspnJson<any>(espnEndpoints.scoreboard("20250115"));
  save("scoreboard", scoreboard);

  const firstEvent = scoreboard?.events?.[0];
  const eventId = firstEvent?.id;
  console.log("sample eventId:", eventId, "status:", firstEvent?.status?.type?.name);

  if (eventId) {
    const summary = await fetchEspnJson<any>(espnEndpoints.summary(eventId));
    save("summary", summary);
  }

  const teams = await fetchEspnJson<any>(espnEndpoints.teams());
  save("teams", teams);

  const firstTeamId = teams?.sports?.[0]?.leagues?.[0]?.teams?.[0]?.team?.id;
  console.log("sample teamId:", firstTeamId);

  if (firstTeamId) {
    const team = await fetchEspnJson<any>(espnEndpoints.team(firstTeamId));
    save("team", team);

    const roster = await fetchEspnJson<any>(espnEndpoints.teamRoster(firstTeamId));
    save("roster", roster);

    const stats = await fetchEspnJson<any>(
      espnEndpoints.teamStatistics("2025", "2", firstTeamId),
    );
    save("team-statistics", stats);
  }

  const athletes = await fetchEspnJson<any>(espnEndpoints.athletesList(50));
  save("athletes", athletes);

  const firstAthleteId = athletes?.items?.[0]?.id ?? athletes?.items?.[0]?.$ref?.match(/athletes\/(\d+)/)?.[1];
  console.log("sample athleteId:", firstAthleteId);

  if (firstAthleteId) {
    const overview = await fetchEspnJson<any>(espnEndpoints.athleteOverview(firstAthleteId));
    save("athlete-overview", overview);

    const gamelog = await fetchEspnJson<any>(espnEndpoints.athleteGamelog(firstAthleteId));
    save("athlete-gamelog", gamelog);
  }

  // Standings group IDs are unconfirmed — try a couple of common guesses.
  for (const groupId of ["1", "2", "9", "10"]) {
    try {
      const standings = await fetchEspnJson<any>(espnEndpoints.standings("2025", "2", groupId));
      save(`standings-group-${groupId}`, standings);
      console.log(`group ${groupId} ->`, standings?.name ?? "(no name field)");
    } catch (err) {
      console.log(`group ${groupId} failed:`, (err as Error).message);
    }
  }
}

async function burstTest() {
  console.log("\n--- burst test: 40 concurrent summary-style calls ---");
  setEspnConcurrency(8);
  const scoreboard = await fetchEspnJson<any>(espnEndpoints.scoreboard("20250115"));
  const eventIds: string[] = (scoreboard?.events ?? []).map((e: any) => e.id);
  // Pad by reusing ids if the day didn't have 40 games.
  const targets = Array.from({ length: 40 }, (_, i) => eventIds[i % eventIds.length]);

  const start = Date.now();
  const results = await Promise.allSettled(
    targets.map((id) => fetchEspnJson<any>(espnEndpoints.summary(id))),
  );
  const elapsed = Date.now() - start;

  const failures = results.filter((r) => r.status === "rejected");
  console.log(`burst done in ${elapsed}ms, ${failures.length}/${targets.length} failed`);
  failures.forEach((f) => {
    if (f.status === "rejected") console.log(" -", f.reason?.message ?? f.reason);
  });
}

async function main() {
  await exploreCoreEndpoints();
  await burstTest();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
