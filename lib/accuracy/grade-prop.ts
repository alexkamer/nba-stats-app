/**
 * Grades a frozen `PlayerPropProjection` against the actual final stat
 * value. The over/under lean isn't stored explicitly — it's derived here
 * from comparing the frozen projection to the prop line, the same way the
 * betting-insights-page capability derives it for display.
 */

export interface PropGradeResult {
  /** `null` for a push — either side the projection or the actual result
   * landed exactly on the line, so there's no over/under to grade. */
  correct: boolean | null;
}

export function gradePlayerProp(projectedValue: number, line: number, actualValue: number): PropGradeResult {
  if (projectedValue === line || actualValue === line) return { correct: null };
  const lean = projectedValue > line ? "OVER" : "UNDER";
  const actualSide = actualValue > line ? "OVER" : "UNDER";
  return { correct: lean === actualSide };
}
