// Shapes confirmed against ingest/__fixtures__/summary.json (the `plays`
// array) during M4 exploration.

export interface EspnPlay {
  id: string;
  sequenceNumber: string;
  text?: string;
  homeScore?: number;
  awayScore?: number;
  period?: { number: number };
  clock?: { displayValue: string };
  scoringPlay?: boolean;
  team?: { id: string };
}

export interface PlayUpsertInput {
  espnId: string;
  gameId: number;
  sequenceNumber: number;
  period: number | null;
  clock: string | null;
  description: string | null;
  teamId: number | null;
  homeScore: number | null;
  awayScore: number | null;
  scoringPlay: boolean;
}

export function mapPlay(
  play: EspnPlay,
  gameId: number,
  teamId: number | null,
): PlayUpsertInput {
  return {
    espnId: play.id,
    gameId,
    sequenceNumber: Number(play.sequenceNumber),
    period: play.period?.number ?? null,
    clock: play.clock?.displayValue ?? null,
    description: play.text ?? null,
    teamId,
    homeScore: play.homeScore ?? null,
    awayScore: play.awayScore ?? null,
    scoringPlay: play.scoringPlay ?? false,
  };
}
