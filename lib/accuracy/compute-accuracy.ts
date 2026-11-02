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

/** Groups already-graded rows by their frozen `method` tag and computes
 * accuracy within each group — lets a methodology change (e.g.
 * `v1-recency-weighted` vs `v2-opponent-rating`) be judged against its
 * predecessor on its own graded track record, instead of being pooled
 * into one number that can't tell them apart. */
export function accuracyByMethod<T extends { method: string }>(
  rows: T[],
  gradedValue: (row: T) => boolean | null,
): Record<string, AccuracySummary> {
  const byMethod = new Map<string, T[]>();
  for (const row of rows) {
    const group = byMethod.get(row.method);
    if (group) group.push(row);
    else byMethod.set(row.method, [row]);
  }
  return Object.fromEntries(
    [...byMethod.entries()].map(([method, group]) => [method, computeAccuracy(group.map(gradedValue))]),
  );
}
