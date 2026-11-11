/**
 * Candidate selection for a King of the Court leaderboard — pure so it's
 * testable without a database. Deliberately takes a roster id list and an
 * availability map, never a market prop line: unlike player-prop
 * generation, King of the Court candidates are never gated on whether a
 * sportsbook has posted a prop for that player (see
 * king-of-the-court-prediction capability, design.md "Leaderboard covers
 * every available rostered player").
 */

export interface KingOfTheCourtCandidateRef {
  playerId: number;
  currentTeamId: number;
  opponentTeamId: number;
}

/** Every rostered player on `teamId` who isn't frozen OUT for `gameId`. */
export function selectAvailableCandidates(
  rosterPlayerIds: number[],
  gameId: number,
  teamId: number,
  opponentTeamId: number,
  availabilityByGamePlayer: Map<string, "OUT" | "DOUBTFUL" | "QUESTIONABLE" | "PROBABLE" | "AVAILABLE">,
): KingOfTheCourtCandidateRef[] {
  return rosterPlayerIds
    .filter((playerId) => availabilityByGamePlayer.get(`${gameId}|${playerId}`) !== "OUT")
    .map((playerId) => ({ playerId, currentTeamId: teamId, opponentTeamId }));
}
