/**
 * How much more or less than league average a team tends to allow in a
 * given stat, derived from completed games already ingested (no new data
 * source) — `TeamGameStat` already records what each team put up, so what
 * team X "allowed" in a game is just what X's opponent put up that game.
 */

export interface AllowedStatRow {
  teamId: number;
  /** The value the opposing team produced for this stat in that game —
   * i.e. what `teamId` allowed. */
  allowedValue: number;
}

// Below this many games, a team's allowed-average is too noisy to trust as
// a multiplier — leave that team's factor at the neutral 1.
const MIN_GAMES_FOR_FACTOR = 5;
// Clamped so a small early-season sample (or a single blowout) can't swing
// a player's projection too far on an unrelated opponent signal.
const MIN_FACTOR = 0.85;
const MAX_FACTOR = 1.15;

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Maps each team to a multiplier: >1 means that team allows more of this
 * stat than league average (a softer matchup), <1 means less. Teams with
 * too few games default to 1 (neutral) rather than being omitted, so
 * callers can look up any team id without a fallback branch. */
export function computeOpponentFactors(rows: AllowedStatRow[]): Map<number, number> {
  const leagueAvg = average(rows.map((r) => r.allowedValue));
  const factors = new Map<number, number>();
  if (leagueAvg === null || leagueAvg === 0) return factors;

  const byTeam = new Map<number, number[]>();
  for (const row of rows) {
    const list = byTeam.get(row.teamId);
    if (list) list.push(row.allowedValue);
    else byTeam.set(row.teamId, [row.allowedValue]);
  }

  for (const [teamId, allowedValues] of byTeam) {
    if (allowedValues.length < MIN_GAMES_FOR_FACTOR) {
      factors.set(teamId, 1);
      continue;
    }
    const teamAvg = average(allowedValues)!;
    const factor = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, teamAvg / leagueAvg));
    factors.set(teamId, factor);
  }
  return factors;
}
