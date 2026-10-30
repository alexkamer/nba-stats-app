// Shapes confirmed against ingest/__fixtures__/scoreboard.json during M2/M4
// exploration. One scoreboard call per day gives every game that day
// (status, score, venue, teams) — the summary call is only needed for
// box score + play-by-play (see game.ts in mappers vs boxscore.ts/playbyplay.ts).

export interface EspnScoreboardCompetitor {
  homeAway: "home" | "away";
  score?: string;
  team: { id: string };
}

export interface EspnScoreboardVenue {
  id: string;
  fullName: string;
  address?: { city?: string; state?: string };
}

export interface EspnScoreboardEvent {
  id: string;
  date: string;
  season?: { year: number; type: number };
  status: { type: { name: string; completed: boolean } };
  competitions: {
    status: { period?: number; type: { completed: boolean } };
    venue?: EspnScoreboardVenue;
    attendance?: number;
    competitors: EspnScoreboardCompetitor[];
  }[];
}

export const SEASON_TYPE_MAP = {
  1: "PRESEASON",
  2: "REGULAR",
  3: "POSTSEASON",
} as const;

export type SeasonTypeCode = keyof typeof SEASON_TYPE_MAP;

export interface GameUpsertInput {
  espnId: string;
  seasonId: number;
  seasonType: "PRESEASON" | "REGULAR" | "POSTSEASON";
  date: Date;
  status: "SCHEDULED" | "LIVE" | "FINAL";
  period: number | null;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  venueId: number | null;
  attendance: number | null;
}

/** Is this event something our scope cares about: a non-preseason game,
 * regardless of whether it has finished (SPEC.md Sec 9.5/9.7, extended by
 * the betting-insights-page change to also cover scheduled/live games, so
 * forward-looking odds/projections have a Game row to attach to)? Some
 * historical events are malformed (missing `status` entirely — confirmed
 * during the historical backfill), so every level here is optional-chained
 * rather than assumed. */
export function isIngestableGame(event: EspnScoreboardEvent): boolean {
  const seasonType = event.season?.type;
  return (
    event.status?.type?.name !== undefined &&
    seasonType !== undefined &&
    seasonType !== 1 &&
    seasonType in SEASON_TYPE_MAP
  );
}

function statusFromEvent(event: EspnScoreboardEvent): "SCHEDULED" | "LIVE" | "FINAL" {
  if (event.status.type.completed) return "FINAL";
  if (event.status.type.name.includes("IN_PROGRESS")) return "LIVE";
  return "SCHEDULED";
}

export function mapGame(
  event: EspnScoreboardEvent,
  homeTeamId: number,
  awayTeamId: number,
  venueId: number | null,
  seasonId: number,
): GameUpsertInput {
  const competition = event.competitions[0];
  const home = competition.competitors.find((c) => c.homeAway === "home");
  const away = competition.competitors.find((c) => c.homeAway === "away");
  const seasonType = SEASON_TYPE_MAP[event.season!.type as SeasonTypeCode];
  if (seasonType === "PRESEASON") {
    throw new Error(`mapGame called on a preseason event ${event.id} — caller must filter via isIngestableGame`);
  }
  const status = statusFromEvent(event);

  return {
    espnId: event.id,
    seasonId,
    seasonType,
    date: new Date(event.date),
    status,
    period: competition.status.period ?? null,
    homeTeamId,
    awayTeamId,
    // A scheduled/live game's score is only meaningful once it's FINAL —
    // ESPN sometimes reports "0" pregame, which would otherwise read as an
    // actual final score of 0.
    homeScore: status === "FINAL" && home?.score !== undefined ? Number(home.score) : null,
    awayScore: status === "FINAL" && away?.score !== undefined ? Number(away.score) : null,
    venueId,
    attendance: competition.attendance ?? null,
  };
}

export function mapVenueFromEvent(venue: EspnScoreboardVenue | undefined) {
  if (!venue) return null;
  return {
    espnId: venue.id,
    name: venue.fullName,
    city: venue.address?.city ?? null,
    state: venue.address?.state ?? null,
    capacity: null as number | null,
  };
}
