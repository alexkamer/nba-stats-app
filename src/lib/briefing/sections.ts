/**
 * Which briefing sections apply to a given calendar date (see
 * daily-briefing-page's today-vs-past-date requirements). Pure so the
 * today/past split can be tested without a database: current-moment
 * sections (headlines, injuries, standings, forward-looking schedule)
 * only apply to today; date-scoped sections (scores, top performers,
 * that date's own slate, Best Bets) apply to every date.
 */
export interface BriefingSectionVisibility {
  isToday: boolean;
  headlines: boolean;
  injuries: boolean;
  standings: boolean;
  schedule: boolean;
  pastSlate: boolean;
  scores: boolean;
  topPerformers: boolean;
  bestBets: boolean;
}

export function sectionsForDate(dateKey: string, todayKey: string): BriefingSectionVisibility {
  const isToday = dateKey === todayKey;
  return {
    isToday,
    headlines: isToday,
    injuries: isToday,
    standings: isToday,
    schedule: isToday,
    pastSlate: !isToday,
    scores: true,
    topPerformers: true,
    bestBets: true,
  };
}
