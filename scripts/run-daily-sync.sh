#!/bin/bash
# Hourly DB refresh: runs ingest/run-all-sync.ts (reference data, completed
# games, aggregates, betting odds/projections/grading, news) and logs output
# for troubleshooting. Every step is self-healing/idempotent, so running
# this more than once an hour is safe — hourly is what keeps betting odds,
# player prop lines, and same-night grading from going stale.
set -uo pipefail
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/alexkamer/nba-stats-app

HEARTBEAT=logs/sync-heartbeat.json
npx tsx ingest/run-all-sync.ts
STATUS=$?

if [ "$STATUS" -eq 0 ]; then
  printf '{"timestamp":"%s","status":"ok"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$HEARTBEAT"
else
  printf '{"timestamp":"%s","status":"error","exitCode":%s}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$STATUS" > "$HEARTBEAT"
fi

exit "$STATUS"
