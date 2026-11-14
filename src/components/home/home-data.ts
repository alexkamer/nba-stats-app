"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { L10Game } from "@/components/ui/shared";
import { isBreak } from "@/lib/game-status";
import { useScoreboardToday, type ScoreboardGame } from "@/components/shell/useScoreboardToday";

export interface Standing {
  conferenceRank: number | null;
  wins: number | null;
  losses: number | null;
  winPct: number | null;
  gamesBehind: number | null;
  streak: string | null;
  lastTen: string | null;
  lastTenGames?: L10Game[];
  pointsPerGame: number | null;
  oppPointsPerGame: number | null;
  team: { id: number; name: string; displayName: string; abbreviation: string; logoUrl?: string | null; color?: string | null };
}

export interface Conference {
  conferenceName: string;
  standings: Standing[];
}

export interface LeagueLeader {
  id: number;
  displayName: string;
  headshotUrl: string | null;
  teamId: number | null;
  teamAbbreviation: string | null;
  teamLogoUrl: string | null;
  displayValue: string;
}

export interface LeaderCategory {
  key: string;
  label: string;
  abbreviation: string;
  leaders: LeagueLeader[];
}

export interface Headline {
  id: number;
  headline: string;
  url: string | null;
}

export interface BriefingToday {
  date: string;
  summary: string | null;
}

async function getJson<T>(url: string, pick?: (d: never) => T): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  const data = await res.json();
  return pick ? pick(data as never) : (data as T);
}

/** One data layer for every variant's home page, so the five drafts differ in
 * composition and identity, not in what they fetch. Queries share keys with
 * the baseline home page, so switching layouts reuses cached data. */
export function useHomeData() {
  const games = useScoreboardToday(true);
  const standings = useQuery({
    queryKey: ["standings"],
    queryFn: () => getJson<Conference[]>("/api/standings", (d: { conferences: Conference[] }) => d.conferences),
  });
  const leaders = useQuery({
    queryKey: ["league-leaders"],
    queryFn: () => getJson<LeaderCategory[]>("/api/league-leaders", (d: { categories: LeaderCategory[] }) => d.categories),
  });
  const headlines = useQuery({
    queryKey: ["news", "headlines"],
    queryFn: () => getJson<Headline[]>("/api/news?limit=6&type=HeadlineNews", (d: { articles: Headline[] }) => d.articles),
  });
  const briefing = useQuery({
    queryKey: ["briefing", "today"],
    queryFn: () => getJson<BriefingToday>("/api/briefing"),
  });
  return { games, standings, leaders, headlines, briefing };
}

export type { ScoreboardGame };

/** "5" / "-3" / "W5" / "L2" -> display + direction. */
export function parseStreak(raw: string | null): { label: string; dir: "win" | "loss" | "none" } {
  if (!raw) return { label: "-", dir: "none" };
  const m = /^([WL])?(-?\d+)$/.exec(raw.trim());
  if (!m) return { label: raw, dir: "none" };
  const n = parseInt(m[2], 10);
  const dir = m[1] ? (m[1] === "W" ? "win" : "loss") : n >= 0 ? "win" : "loss";
  return { label: `${dir === "win" ? "W" : "L"}${Math.abs(n)}`, dir };
}

export type GamePhase = "scheduled" | "live" | "final";

export function gamePhase(g: ScoreboardGame): GamePhase {
  if (g.statusName === "STATUS_FINAL") return "final";
  if (g.statusName === "STATUS_SCHEDULED") return "scheduled";
  return "live";
}

/** Short status text for a game: tip-off time, "Q3 4:12" or "Final". */
export function gameStatusText(g: ScoreboardGame): string {
  const phase = gamePhase(g);
  if (phase === "final") return g.statusDetail || "Final";
  if (phase === "scheduled") {
    return new Date(g.date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  // A break inside the game reads as its own state ("Halftime", "End of 1st Quarter"), not a frozen clock.
  if (isBreak(g.statusName)) return g.statusName === "STATUS_HALFTIME" ? "Halftime" : g.statusDetail;
  return `Q${g.period ?? ""} ${g.clock ?? ""}`.trim();
}

/** The current date, resolved after mount. Reading `new Date()` during render
 * is flagged by Next (it would be frozen at prerender time), so variants show
 * a placeholder until this returns a value. */
export function useToday(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
  }, []);
  return now;
}
