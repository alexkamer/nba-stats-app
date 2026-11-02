/**
 * Self-serve freshness check for the hourly sync (scripts/run-daily-sync.sh).
 * Answers "is everything up to date?" without needing to ask Claude —
 * run with: npx tsx scripts/sync-status.ts
 */
import { readFileSync, existsSync } from "fs";
import { prisma } from "../ingest/lib/db";

const HEARTBEAT_PATH = "logs/sync-heartbeat.json";
const STALE_AFTER_MINUTES = 90; // cron runs hourly; one missed run is still fine

function checkHeartbeat(): { ok: boolean; message: string } {
  if (!existsSync(HEARTBEAT_PATH)) {
    return { ok: false, message: `No heartbeat file at ${HEARTBEAT_PATH} — has the sync ever run since this check was added?` };
  }
  const heartbeat = JSON.parse(readFileSync(HEARTBEAT_PATH, "utf-8")) as {
    timestamp: string;
    status: "ok" | "error";
    exitCode?: number;
  };
  const ageMinutes = (Date.now() - new Date(heartbeat.timestamp).getTime()) / 60_000;

  if (heartbeat.status === "error") {
    return { ok: false, message: `Last sync run FAILED (exit code ${heartbeat.exitCode}) at ${heartbeat.timestamp} (${ageMinutes.toFixed(0)}m ago). Check logs/cron.log.` };
  }
  if (ageMinutes > STALE_AFTER_MINUTES) {
    return { ok: false, message: `Last successful sync was ${ageMinutes.toFixed(0)}m ago (expected hourly) — cron may not be running. Check \`crontab -l\` and logs/cron.log.` };
  }
  return { ok: true, message: `Last successful sync ${ageMinutes.toFixed(0)}m ago (${heartbeat.timestamp}).` };
}

async function checkUngradedFinals(): Promise<{ ok: boolean; message: string }> {
  const count = await prisma.gameProjection.count({
    where: { game: { status: "FINAL" }, gradedAt: null },
  });
  if (count === 0) return { ok: true, message: "All final games are graded." };
  return { ok: false, message: `${count} final game(s) have an ungraded projection — run grade-predictions.ts.` };
}

async function checkPendingMarketLines(): Promise<{ ok: boolean; message: string }> {
  const count = await prisma.gameProjection.count({
    where: { game: { status: "SCHEDULED" }, OR: [{ marketMarginAtPick: null }, { marketTotalAtPick: null }] },
  });
  if (count === 0) return { ok: true, message: "All scheduled game projections have a market line." };
  return { ok: true, message: `${count} scheduled game(s) still waiting on a market line to be posted (normal for games >1-2 days out).` };
}

async function main() {
  const results = [checkHeartbeat(), await checkUngradedFinals(), await checkPendingMarketLines()];

  for (const r of results) {
    console.log(`${r.ok ? "✅" : "❌"} ${r.message}`);
  }

  await prisma.$disconnect();
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
