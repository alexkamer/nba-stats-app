"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export interface ScoreboardGame {
  espnId: string;
  date: string;
  statusName: string;
  statusDetail: string;
  period: number | null;
  clock: string | null;
  spreadDetails: string | null;
  home: { abbreviation: string; name: string; score: number | null; logoUrl: string | null; overallRecord: string | null };
  away: { abbreviation: string; name: string; score: number | null; logoUrl: string | null; overallRecord: string | null };
}

function todayYyyymmdd(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/** Today's games for shell-level surfaces (variant A's live list, variant B's
 * ticker). Polls only while `enabled`, so variants without such a surface
 * (and the baseline) cause no scoreboard traffic. Shares its query key with
 * the home page's own scoreboard query, so the two dedupe. */
export function useScoreboardToday(enabled: boolean) {
  // Read "today" in an effect: calling `new Date()` during render would be
  // evaluated at prerender time (and Next flags it) since this hook runs in
  // the root layout, outside any Suspense boundary.
  const [date, setDate] = useState<string | null>(null);
  useEffect(() => {
    setDate(todayYyyymmdd());
  }, []);

  return useQuery({
    queryKey: ["scoreboard", date],
    queryFn: async (): Promise<ScoreboardGame[]> => {
      const res = await fetch(`/api/scoreboard?date=${date}`);
      if (!res.ok) throw new Error("Failed to load scoreboard");
      return (await res.json()).games;
    },
    enabled: enabled && date !== null,
    refetchInterval: enabled ? 30_000 : false,
  });
}
