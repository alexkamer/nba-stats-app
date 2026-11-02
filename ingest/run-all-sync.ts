/**
 * M6 — single cron entry point (PLAN.md Sec 1/M6). Runs the recurring jobs
 * in dependency order: reference data (teams/rosters — cheap, safe to
 * refresh every run even though SPEC.md Sec 7.2 suggests daily is enough),
 * then the completed-games heartbeat, then aggregates (season stats +
 * standings), which SPEC.md Sec 7.2 explicitly says should run "after each
 * completed-games sync" since that's what changes them.
 *
 * Exact scheduling mechanism (cron, systemd timer, GitHub Actions, etc.) is
 * deferred to deployment per SPEC.md Sec 9.1 — this script is what gets
 * invoked, however that ends up being scheduled.
 *
 * Run with: npx tsx ingest/run-all-sync.ts
 */
import { execFileSync } from "child_process";
import { join } from "path";

const SCRIPTS = [
  "sync-reference-data.ts",
  "sync-completed-games.ts",
  "sync-aggregates.ts",
  "sync-betting-odds.ts", // discovers upcoming games + their odds/props/predictor
  "sync-player-availability.ts", // needs sync-betting-odds's discovered games
  "generate-projections.ts", // needs sync-betting-odds's prop odds + sync-player-availability's statuses
  "grade-predictions.ts", // needs sync-completed-games' final scores + sync-aggregates' box scores
  "sync-news.ts", // M10 (stretch) — independent of the others, order doesn't matter
];

function runScript(name: string) {
  console.log(`\n=== running ${name} ===`);
  execFileSync("npx", ["tsx", join(__dirname, name)], { stdio: "inherit" });
}

function main() {
  const start = Date.now();
  for (const script of SCRIPTS) {
    runScript(script);
  }
  console.log(`\nAll sync jobs complete in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

main();
