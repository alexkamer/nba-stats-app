/**
 * Live proxy for ESPN's team transactions endpoint — nothing here is
 * persisted, same non-DB-writing convention as espn-team-depth-chart.ts
 * and espn-team-injuries.ts. Unlike those, this endpoint returns plain
 * JSON directly rather than a list of `$ref`s to fetch individually.
 *
 * ESPN's `season` query param here is a literal calendar year (it buckets
 * transactions by the calendar year of the transaction date), unlike most
 * other team-scoped endpoints where `season` means an NBA season.
 */
import { fetchEspnJson } from "../../lib/espn/client";
import { espnEndpoints } from "../../lib/espn/endpoints";

interface EspnTransactionsResponse {
  pageCount?: number;
  transactions?: { date: string; description: string }[];
}

export interface TeamTransaction {
  date: string;
  description: string;
}

export async function getTeamTransactions(teamEspnId: string, calendarYear: number): Promise<TeamTransaction[]> {
  const first = await fetchEspnJson<EspnTransactionsResponse>(
    espnEndpoints.teamTransactions(teamEspnId, String(calendarYear)),
  );
  const pageCount = first.pageCount ?? 1;
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) =>
      fetchEspnJson<EspnTransactionsResponse>(espnEndpoints.teamTransactions(teamEspnId, String(calendarYear), i + 2)),
    ),
  );
  return [first, ...rest].flatMap((page) => page.transactions ?? []);
}
