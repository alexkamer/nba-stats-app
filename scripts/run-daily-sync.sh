#!/bin/bash
# Nightly DB refresh: runs ingest/run-all-sync.ts (reference data, completed
# games, aggregates, news) and logs output for troubleshooting.
set -euo pipefail
cd /Users/alexkamer/nba-stats-app
/opt/homebrew/bin/npx tsx ingest/run-all-sync.ts
