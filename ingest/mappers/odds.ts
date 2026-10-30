// Shapes confirmed against a real completed-game `summary` call during the
// odds-feasibility check: `pickcenter` is an array of sportsbook providers,
// present (non-empty) only for some games/eras (~2015-Jan 2023 solid, Feb
// 2023 through most of 2025-26 mostly empty — likely an ESPN odds-partner
// transition — present again for the current season). Best-effort only.

export interface EspnPickcenterEntry {
  provider: { name: string; priority: number };
  spread?: number;
  overUnder?: number;
  homeTeamOdds?: { favorite: boolean; moneyLine?: number };
  awayTeamOdds?: { favorite: boolean; moneyLine?: number };
}

export interface OddsUpsertInput {
  gameId: number;
  provider: string;
  spread: number | null;
  overUnder: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
  favoriteTeamId: number | null;
  openSpread?: number | null;
  openOverUnder?: number | null;
  openHomeMoneyline?: number | null;
  openAwayMoneyline?: number | null;
}

/** Picks the highest-priority (lowest `priority` number) provider ESPN
 * lists, not every sportsbook — this is informational, not a full odds
 * comparison feature. */
export function pickPrimaryProvider(pickcenter: EspnPickcenterEntry[] | undefined): EspnPickcenterEntry | null {
  if (!pickcenter || pickcenter.length === 0) return null;
  return [...pickcenter].sort((a, b) => a.provider.priority - b.provider.priority)[0];
}

export function mapOdds(
  entry: EspnPickcenterEntry,
  gameId: number,
  homeTeamId: number,
  awayTeamId: number,
): OddsUpsertInput {
  const favoriteTeamId = entry.homeTeamOdds?.favorite
    ? homeTeamId
    : entry.awayTeamOdds?.favorite
      ? awayTeamId
      : null;

  return {
    gameId,
    provider: entry.provider.name,
    spread: entry.spread ?? null,
    overUnder: entry.overUnder ?? null,
    homeMoneyline: entry.homeTeamOdds?.moneyLine ?? null,
    awayMoneyline: entry.awayTeamOdds?.moneyLine ?? null,
    favoriteTeamId,
  };
}

// Shape confirmed against the core API's single-provider odds resource
// (`.../events/{id}/competitions/{id}/odds/{providerId}`), used for
// scheduled games — unlike `pickcenter` above, this carries both the
// opening and current line (see betting-odds-ingest capability / design.md
// "Extend Odds with open-line columns").
export interface EspnCoreOddsEntry {
  provider: { id: string; name: string; priority: number };
  spread?: number;
  overUnder?: number;
  open?: { total?: { american?: string } };
  homeTeamOdds?: {
    favorite: boolean;
    moneyLine?: number;
    open?: { pointSpread?: { american?: string }; moneyLine?: { american?: string } };
  };
  awayTeamOdds?: {
    favorite: boolean;
    moneyLine?: number;
    open?: { pointSpread?: { american?: string }; moneyLine?: { american?: string } };
  };
}

function parseAmerican(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Maps the core API's single-provider odds resource, carrying both the
 * current and opening line, to an `Odds` upsert input. */
export function mapCoreOdds(
  entry: EspnCoreOddsEntry,
  gameId: number,
  homeTeamId: number,
  awayTeamId: number,
): OddsUpsertInput {
  const favoriteTeamId = entry.homeTeamOdds?.favorite
    ? homeTeamId
    : entry.awayTeamOdds?.favorite
      ? awayTeamId
      : null;

  return {
    gameId,
    provider: entry.provider.name,
    spread: entry.spread ?? null,
    overUnder: entry.overUnder ?? null,
    homeMoneyline: entry.homeTeamOdds?.moneyLine ?? null,
    awayMoneyline: entry.awayTeamOdds?.moneyLine ?? null,
    favoriteTeamId,
    openSpread: parseAmerican(entry.homeTeamOdds?.open?.pointSpread?.american),
    openOverUnder: parseAmerican(entry.open?.total?.american),
    openHomeMoneyline: parseAmerican(entry.homeTeamOdds?.open?.moneyLine?.american),
    openAwayMoneyline: parseAmerican(entry.awayTeamOdds?.open?.moneyLine?.american),
  };
}
