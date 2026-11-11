/**
 * Ranks King of the Court candidates by projected value (see
 * king-of-the-court-prediction capability) — pure so it's testable without
 * a database. Candidates tied on `projectedValue` share the same rank
 * (same reasoning as DailyStatLeaderEntry keeping every tied player as a
 * leader rather than picking one arbitrarily), so a later rank can skip
 * ahead (e.g. two players tied at rank 1 means the next candidate is rank 3).
 */

export interface LeaderboardCandidate {
  playerId: number;
  projectedValue: number;
}

export interface RankedLeaderboardEntry extends LeaderboardCandidate {
  rank: number;
}

export function rankLeaderboard(candidates: LeaderboardCandidate[]): RankedLeaderboardEntry[] {
  const sorted = [...candidates].sort((a, b) => b.projectedValue - a.projectedValue);

  const ranked: RankedLeaderboardEntry[] = [];
  let rank = 0;
  let previousValue: number | null = null;
  for (let i = 0; i < sorted.length; i++) {
    if (previousValue === null || sorted[i].projectedValue !== previousValue) {
      rank = i + 1;
      previousValue = sorted[i].projectedValue;
    }
    ranked.push({ ...sorted[i], rank });
  }
  return ranked;
}
