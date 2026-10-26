/* eslint-disable @typescript-eslint/no-explicit-any -- raw ESPN JSON, not a mapped/typed shape */
/**
 * M2 rate-limit tuning: gather a large pool of distinct real completed-game
 * IDs across several dates, then fetch their `summary` payloads at
 * increasing concurrency to find where ESPN actually starts throttling.
 * Informs the concurrency default in lib/espn/rate-limiter.ts and the
 * backfill wall-clock estimate in PLAN.md Sec 2/M4.
 *
 * Run with: npx tsx ingest/burst-test.ts
 */
import { fetchEspnJson, setEspnConcurrency } from "../lib/espn/client";
import { espnEndpoints } from "../lib/espn/endpoints";

const DATES = [
  "20250102", "20250103", "20250106", "20250108", "20250110",
  "20250113", "20250115", "20250117", "20250120", "20250122",
];

async function collectEventIds(): Promise<string[]> {
  setEspnConcurrency(5);
  const boards = await Promise.all(
    DATES.map((d) => fetchEspnJson<any>(espnEndpoints.scoreboard(d))),
  );
  const ids: string[] = [];
  for (const board of boards) {
    for (const ev of board?.events ?? []) {
      if (ev?.status?.type?.name === "STATUS_FINAL") ids.push(ev.id);
    }
  }
  return ids;
}

async function timedBurst(ids: string[], concurrency: number) {
  setEspnConcurrency(concurrency);
  const start = Date.now();
  const results = await Promise.allSettled(
    ids.map((id) => fetchEspnJson<any>(espnEndpoints.summary(id))),
  );
  const elapsed = Date.now() - start;
  const failed = results.filter((r) => r.status === "rejected");
  console.log(
    `concurrency=${concurrency} n=${ids.length} elapsed=${elapsed}ms ` +
      `avg=${(elapsed / ids.length).toFixed(1)}ms/req failures=${failed.length}`,
  );
  failed.slice(0, 3).forEach((f) => {
    if (f.status === "rejected") console.log("  sample failure:", f.reason?.message ?? f.reason);
  });
  return { elapsed, failed: failed.length };
}

async function main() {
  const ids = await collectEventIds();
  console.log(`collected ${ids.length} distinct completed-game ids across ${DATES.length} dates`);

  for (const concurrency of [5, 10, 20, 30]) {
    await timedBurst(ids, concurrency);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
