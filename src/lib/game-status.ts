// ESPN reports a game that has started and not finished under three statuses:
// STATUS_IN_PROGRESS while the clock is running, and STATUS_HALFTIME and
// STATUS_END_PERIOD for the breaks inside it. All three mean the game is being
// played. Matching only STATUS_IN_PROGRESS made a game at halftime or between
// quarters look like one that hadn't started.
const UNDERWAY = new Set(["STATUS_IN_PROGRESS", "STATUS_HALFTIME", "STATUS_END_PERIOD"]);
const BREAKS = new Set(["STATUS_HALFTIME", "STATUS_END_PERIOD"]);

/** True while a game is being played, including halftime and breaks between periods. */
export function isUnderway(statusName: string): boolean {
  return UNDERWAY.has(statusName);
}

/** True for a pause inside a game in progress: halftime, or the end of a period. */
export function isBreak(statusName: string): boolean {
  return BREAKS.has(statusName);
}
