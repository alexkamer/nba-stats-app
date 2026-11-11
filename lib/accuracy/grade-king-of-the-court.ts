/**
 * Grades a frozen King of the Court leaderboard against the calendar
 * date's actual recorded points+rebounds+assists leader(s) (DailyStatLeader).
 * A tie at rank 1 counts as a hit if *any* tied player matches the actual
 * leader(s) — consistent with DailyStatLeader itself keeping every tied
 * player as a leader rather than picking one arbitrarily (design.md "Ties
 * at the top").
 */
export function gradeKingOfTheCourt(topRankedPlayerIds: number[], actualLeaderPlayerIds: number[]): boolean {
  return topRankedPlayerIds.some((playerId) => actualLeaderPlayerIds.includes(playerId));
}
