// ESPN labels an NBA season by its year of conclusion (the 2025-26 season is
// "2026") — same convention as ingest/sync-reference-data.ts's
// CURRENT_SEASON_YEAR. Espn-only mode has no Season table to read the
// current year from (see ingest/sync-aggregates.ts's currentSeasonYear),
// so derive it from today's date instead: a season starting in October of
// year Y concludes in Y+1.

export function currentSeasonYear(): number {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 9 ? year + 1 : year;
}

export const REGULAR_SEASON_TYPE = "2";
