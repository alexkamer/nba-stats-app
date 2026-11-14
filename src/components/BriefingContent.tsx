"use client";

import { BriefingC } from "@/components/briefing/BriefingC";

export function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDateHeading(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export interface TeamRef {
  id: number;
  abbreviation: string;
  name: string;
  logoUrl: string | null;
}
export interface FinalGame {
  id: number;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: TeamRef;
  awayTeam: TeamRef;
}
export interface DailyLeaderEntry {
  playerId: number;
  pointsReboundsAssists: number;
  hadTripleDouble: boolean;
  player: { id: number; displayName: string; headshotUrl: string | null };
}
export interface TopScorer {
  playerId: number;
  points: number;
  player: { id: number; displayName: string; headshotUrl: string | null };
  team: { id: number; abbreviation: string } | null;
}
interface Headline {
  id: number;
  headline: string;
  url: string | null;
}
export interface StandingsRow {
  conferenceName: string;
  team: TeamRef;
  conferenceRank: number | null;
  wins: number | null;
  losses: number | null;
}
export interface InjuryRow {
  playerId: number;
  status: string;
  player: { id: number; displayName: string };
  team: { id: number; abbreviation: string } | null;
}
export interface ScheduleGame {
  id: number;
  date: string;
  status: string;
  homeTeam: TeamRef;
  awayTeam: TeamRef;
  pick: { projectedHomeScore: number; projectedAwayScore: number; projectedMargin: number } | null;
  market: { spread: number | null; overUnder: number | null } | null;
}
export interface BestBetPick {
  rank: number;
  statType: string;
  player: { id: number; displayName: string; headshotUrl: string | null };
  line: number | null;
  lean: "OVER" | "UNDER" | null;
  gradedCorrect: boolean | null;
}
export interface BriefingPayload {
  date: string;
  isToday: boolean;
  nextDate: string | null;
  prevDate: string | null;
  summary: string | null;
  yesterdaysScores: { date: string; games: FinalGame[] };
  topPerformers: { date: string; leaders: DailyLeaderEntry[]; topScorers: TopScorer[] };
  headlines: Headline[] | null;
  standings: StandingsRow[] | null;
  injuryReport: InjuryRow[] | null;
  schedule: ScheduleGame[] | null;
  pastSlate: { date: string; games: FinalGame[] } | null;
  bestBets: {
    date: string;
    picks: BestBetPick[] | null;
    priorDay: {
      date: string;
      picks: BestBetPick[] | null;
      record: { wins: number; losses: number; record: string } | null;
    };
  };
}

export async function fetchBriefing(dateKey: string | null): Promise<BriefingPayload> {
  const url = dateKey ? `/api/briefing?date=${dateKey}` : "/api/briefing";
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status === 404 ? "No briefing available for that date." : "Failed to load briefing");
  return res.json();
}

export const STAT_LABELS: Record<string, string> = {
  POINTS: "Points",
  REBOUNDS: "Rebounds",
  ASSISTS: "Assists",
  THREE_POINTERS_MADE: "3PM",
  STEALS: "Steals",
  BLOCKS: "Blocks",
  POINTS_ASSISTS: "Pts+Ast",
  POINTS_REBOUNDS: "Pts+Reb",
  REBOUNDS_ASSISTS: "Reb+Ast",
  POINTS_REBOUNDS_ASSISTS: "PRA",
  DOUBLE_DOUBLE: "Double-Double",
  TRIPLE_DOUBLE: "Triple-Double",
};

export function BriefingContent({ dateKey }: { dateKey: string | null }) {
  return <BriefingC dateKey={dateKey} />;
}
