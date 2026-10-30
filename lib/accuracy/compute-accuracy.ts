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
