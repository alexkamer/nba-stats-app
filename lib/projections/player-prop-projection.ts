/**
 * v1 projection methodology (design.md "recency-weighted statistical
 * baseline"): blend a player's season per-game average for the tracked
 * stat with a recency-weighted average of their recent games for that same
 * stat, then adjust for a recent minutes trend and an opponent factor (see
 * lib/projections/opponent-factor.ts). The caller is responsible
 * for extracting the right raw value per `PropStatType` (e.g. points +
 * rebounds for POINTS_REBOUNDS) — this module only blends numbers.
 */

export interface PlayerPropProjectionInput {
  seasonAverage: number | null;
  /** Per-game values for the tracked stat, oldest first. */
  recentValues: number[];
  /** Minutes played per game, same order/length as `recentValues`. */
  recentMinutes: number[];
  /** How much more/less than average the opponent tends to allow in this
   * stat (see `computeOpponentFactors`) - 1 (neutral) when unknown. */
  opponentFactor?: number;
}

const MIN_RECENT_GAMES_FOR_BLEND = 3;
const RECENT_FORM_WEIGHT = 0.6;
// How many of the most recent games count as "recent" for the minutes
// trend, vs. the whole recent window used for the stat blend above.
const TREND_WINDOW_GAMES = 3;
// Trend multiplier is clamped so a tiny sample (e.g. one blowout-garbage-time
// game) can't swing the projection wildly.
const MIN_TREND_MULTIPLIER = 0.7;
const MAX_TREND_MULTIPLIER = 1.3;

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function minutesTrendMultiplier(recentMinutes: number[]): number {
  if (recentMinutes.length < TREND_WINDOW_GAMES) return 1;
  const overallAvg = average(recentMinutes);
  const trendAvg = average(recentMinutes.slice(-TREND_WINDOW_GAMES));
  if (!overallAvg || !trendAvg) return 1;
  const multiplier = trendAvg / overallAvg;
  return Math.min(MAX_TREND_MULTIPLIER, Math.max(MIN_TREND_MULTIPLIER, multiplier));
}

/** Returns `null` when the player has no season average and no recent
 * games for this stat — never fabricates a projection. */
export function projectPlayerStat(input: PlayerPropProjectionInput): number | null {
  const recentAvg = average(input.recentValues);
  let blended: number | null;
  if (recentAvg !== null && input.recentValues.length >= MIN_RECENT_GAMES_FOR_BLEND) {
    blended =
      input.seasonAverage !== null
        ? RECENT_FORM_WEIGHT * recentAvg + (1 - RECENT_FORM_WEIGHT) * input.seasonAverage
        : recentAvg;
  } else {
    blended = input.seasonAverage;
  }
  if (blended === null) return null;

  return blended * minutesTrendMultiplier(input.recentMinutes) * (input.opponentFactor ?? 1);
}
