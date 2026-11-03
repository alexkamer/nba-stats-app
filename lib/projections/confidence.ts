/**
 * A prop's binary over/under correctness says nothing about how close the
 * call was — a 14-point projection against an o14.5 line is a good call
 * even if the player scores 15. `isBettable` separates picks where our
 * projection clears the line by a meaningful margin, relative to the
 * player's own recent variance for that stat, from picks that are
 * essentially a coin flip and not worth surfacing as a recommendation.
 */

// How many standard deviations of edge a pick needs before it's worth
// calling out — below this, the gap between our number and the line is
// within the player's normal game-to-game noise.
export const BETTABLE_EDGE_STDEV_MULTIPLIER = 0.75;

// The bar for a pick to count toward the "high-confidence" accuracy
// bucket — stricter than BETTABLE_EDGE_STDEV_MULTIPLIER, which is the
// floor for a pick to be surfaced as a recommendation at all.
export const HIGH_CONFIDENCE_EDGE_RATIO = 1.0;

// How many picks the best-bets strip shows per day — shared with the
// accuracy route so its "Best Bets" track record replicates the same
// per-day top-N selection the strip itself makes, rather than drifting
// out of sync with a second hardcoded number.
export const BEST_BETS_PER_DAY = 8;

/** Population standard deviation of a player's recent per-game values for a
 * stat. `null` below 2 games — too little sample to say anything about
 * variance. */
export function computeStdev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** How many standard deviations of edge a pick has — the same number the
 * page displays as "confidence" for a recommended pick. `null` whenever
 * there's no line or variance estimate to compare against. */
export function computeEdgeRatio(projectedValue: number, line: number | null, stdev: number | null): number | null {
  if (line === null || stdev === null || stdev <= 0) return null;
  return Math.abs(projectedValue - line) / stdev;
}

/** `false` whenever there isn't enough signal to say the edge is real —
 * no line, no variance estimate, or a degenerate (zero) variance — not just
 * when the edge is small. */
export function isBettable(projectedValue: number, line: number | null, stdev: number | null): boolean {
  const ratio = computeEdgeRatio(projectedValue, line, stdev);
  return ratio !== null && ratio >= BETTABLE_EDGE_STDEV_MULTIPLIER;
}

/** Pools two independent variance estimates (e.g. the home and away team's
 * own recent-game variance) into one combined standard deviation, for cases
 * where "the line" is a function of both sides rather than one player.
 * Falls back to whichever single estimate is available, `null` if neither. */
export function combineStdev(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  return Math.sqrt((a ** 2 + b ** 2) / 2);
}

// Abramowitz & Stegun 7.1.26 approximation of the standard normal CDF (max
// error ~7.5e-8) — accurate enough for a display win probability, no
// external statistics dependency needed for one function.
function standardNormalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/** Converts a projected home-relative margin and its standard deviation
 * into a home win probability (0-100), treating the margin as normally
 * distributed. `null` when there's no meaningful variance to integrate
 * over (so a caller can't mistake "no estimate" for a 50/50 coin flip). */
export function marginToWinPct(projectedMargin: number, marginStdev: number | null): number | null {
  if (marginStdev === null || marginStdev <= 0) return null;
  return standardNormalCdf(projectedMargin / marginStdev) * 100;
}
