#!/bin/bash
# Hourly DB refresh: runs ingest/run-all-sync.ts (reference data, completed
# games, aggregates, betting odds/projections/grading, news) and logs output
# for troubleshooting. Every step is self-healing/idempotent, so running
# this more than once an hour is safe — hourly is what keeps betting odds,
# player prop lines, and same-night grading from going stale.
set -euo pipefail
cd /Users/alexkamer/nba-stats-app
/opt/homebrew/bin/npx tsx ingest/run-all-sync.ts
