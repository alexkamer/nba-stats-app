/**
 * Aggregates graded prediction rows into a per-source hit rate (see
 * prediction-accuracy-tracking capability). Pure — callers supply already-
 * graded rows (e.g. from `GameProjection`/`PredictorSnapshot`/
 * `PlayerPropProjection` rows with `gradedCorrect` set); a `null`
 * `gradedCorrect` (a push) is excluded from both the numerator and
 * denominator rather than counted as wrong.
 */

export interface AccuracySummary {
  graded: number;
  correct: number;
  hitRate: number | null;
}

export function computeAccuracy(gradedCorrectValues: Array<boolean | null>): AccuracySummary {
  const graded = gradedCorrectValues.filter((v): v is boolean => v !== null);
  const correct = graded.filter((v) => v).length;
  return {
    graded: graded.length,
    correct,
    hitRate: graded.length > 0 ? correct / graded.length : null,
  };
}

export interface AccuracySummaryWithPnl extends AccuracySummary {
  /** Net result at a flat 1-unit stake per pick, standard American-odds
   * payout (win pays `odds/100` units at positive odds, or `100/|odds|` at
   * negative odds; a loss forfeits the stake) — summed across every graded
   * row that has a captured odds value. `null` when nothing graded had
   * odds to settle against, same as `hitRate` being `null` for an empty
   * bucket. A row with no captured odds (never priced, or priced after the
   * fact) is excluded from the sum entirely rather than treated as a push,
   * since "no odds" isn't a bet outcome. */
  unitsPnl: number | null;
}

function settleUnitPnl(odds: number | null, correct: boolean): number | null {
  if (odds === null || odds === 0) return null;
  if (!correct) return -1;
  return odds > 0 ? odds / 100 : 100 / Math.abs(odds);
}

/** Same grouping `computeAccuracy` does, plus the units P/L a flat 1-unit
 * bettor would show for this bucket — one pass over rows that carry both
 * their own graded result and the odds for the side actually picked. */
export function computeAccuracyWithPnl(
  rows: Array<{ correct: boolean | null; odds: number | null }>,
): AccuracySummaryWithPnl {
  const summary = computeAccuracy(rows.map((r) => r.correct));
  let total = 0;
  let settled = 0;
  for (const r of rows) {
    if (r.correct === null) continue;
    const pnl = settleUnitPnl(r.odds, r.correct);
    if (pnl !== null) {
      total += pnl;
      settled += 1;
    }
  }
  return { ...summary, unitsPnl: settled > 0 ? total : null };
}

/** Groups already-graded rows by a key (e.g. `method`, `statType`) and
 * computes accuracy within each group, instead of pooling everything into
 * one number that can't tell groups apart. */
function accuracyByKey<T>(
  rows: T[],
  keyOf: (row: T) => string,
  gradedValue: (row: T) => boolean | null,
): Record<string, AccuracySummary> {
  const byKey = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = byKey.get(key);
    if (group) group.push(row);
    else byKey.set(key, [row]);
  }
  return Object.fromEntries(
    [...byKey.entries()].map(([key, group]) => [key, computeAccuracy(group.map(gradedValue))]),
  );
}

/** Groups already-graded rows by their frozen `method` tag and computes
 * accuracy within each group — lets a methodology change (e.g.
 * `v1-recency-weighted` vs `v2-opponent-rating`) be judged against its
 * predecessor on its own graded track record, instead of being pooled
 * into one number that can't tell them apart. */
export function accuracyByMethod<T extends { method: string }>(
  rows: T[],
  gradedValue: (row: T) => boolean | null,
): Record<string, AccuracySummary> {
  return accuracyByKey(rows, (row) => row.method, gradedValue);
}

/** Groups already-graded player-prop rows by `statType` (e.g. POINTS,
 * ASSISTS) and computes accuracy within each — so a strong points-prop
 * hit rate can't hide a weak assists-prop one, or vice versa. */
export function accuracyByStatType<T extends { statType: string }>(
  rows: T[],
  gradedValue: (row: T) => boolean | null,
): Record<string, AccuracySummary> {
  return accuracyByKey(rows, (row) => row.statType, gradedValue);
}
