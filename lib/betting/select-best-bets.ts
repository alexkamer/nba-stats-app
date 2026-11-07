/**
 * Picks a day's featured "Best Bets" from a pool of bettable player props.
 * Multiple stat lines for the same player (e.g. points, rebounds, and
 * points+rebounds) are correlated outcomes, not independent events — so a
 * player contributes at most one pick, their highest-edge one, and the list
 * is never padded back up to `limit` with a second pick from a player
 * already selected. Used identically by the live best-bets strip and the
 * historical accuracy computation so the two never diverge.
 */

export interface BestBetCandidate {
  playerId: number;
  edgeRatio: number;
}

export function selectBestBets<T extends BestBetCandidate>(candidates: T[], limit: number): T[] {
  const sorted = [...candidates].sort((a, b) => b.edgeRatio - a.edgeRatio);
  const seenPlayerIds = new Set<number>();
  const deduped: T[] = [];
  for (const candidate of sorted) {
    if (seenPlayerIds.has(candidate.playerId)) continue;
    seenPlayerIds.add(candidate.playerId);
    deduped.push(candidate);
  }
  return deduped.slice(0, limit);
}
