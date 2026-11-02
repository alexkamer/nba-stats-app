/**
 * Empirical "what changed last time a teammate sat" multiplier (design.md
 * "Teammate role-bump"). Compares a player's own stat production in this
 * season's games where a specific teammate didn't play against his overall
 * baseline, and returns a multiplier to apply on top of the existing
 * minutes-trend/opponent-factor adjustments — neutral (1) until there's
 * enough qualifying games to say anything, same philosophy as
 * `minutesTrendMultiplier` not trusting a tiny sample.
 */

export interface TeammateRoleAdjustmentInput {
  /** Player's per-game stat value for every game in his game log, aligned
   * 1:1 with `teammateWasOut`. */
  values: number[];
  /** Same length as `values` — whether the tracked teammate was unavailable
   * for that specific game (snapshotted OUT, or, for a FINAL game with no
   * snapshot history yet, no box score at all — design.md's cold-start
   * fallback). */
  teammateWasOut: boolean[];
  /** The player's own baseline projection value (pre-adjustment) to compare
   * the qualifying-game average against. */
  baseline: number;
}

// Below this many games where the teammate already sat, there's no
// reliable signal yet — not even a trend to extrapolate.
const MIN_QUALIFYING_GAMES = 2;
const MIN_MULTIPLIER = 0.85;
const MAX_MULTIPLIER = 1.3;

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Returns a clamped multiplier once at least `MIN_QUALIFYING_GAMES`
 * qualifying games exist, or `1` (neutral) otherwise. */
export function computeTeammateRoleAdjustment(input: TeammateRoleAdjustmentInput): number {
  const qualifyingValues = input.values.filter((_, i) => input.teammateWasOut[i]);
  if (qualifyingValues.length < MIN_QUALIFYING_GAMES || input.baseline <= 0) return 1;

  const qualifyingAvg = average(qualifyingValues);
  if (qualifyingAvg === null) return 1;

  const ratio = qualifyingAvg / input.baseline;
  return Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, ratio));
}
