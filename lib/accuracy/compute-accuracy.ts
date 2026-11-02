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
