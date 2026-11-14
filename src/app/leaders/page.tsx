"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { CircularBadge } from "@/components/CircularBadge";
import type { LeaderCategory } from "@/components/home/home-data";
import { Segmented } from "@/components/ui/shared";

async function fetchLeaders(): Promise<LeaderCategory[]> {
  const res = await fetch("/api/league-leaders?limit=25");
  if (!res.ok) throw new Error("Failed to load league leaders");
  return (await res.json()).categories;
}

function LeadersView() {
  const router = useRouter();
  const stat = useSearchParams().get("stat");
  const { data, isLoading, error } = useQuery({ queryKey: ["league-leaders", 25], queryFn: fetchLeaders });

  if (error)
    return (
      <p className="flex items-center gap-2 text-red-600 dark:text-red-400">
        <AlertCircle className="h-4 w-4" /> Failed to load league leaders.
      </p>
    );
  if (isLoading || !data) return <div aria-hidden="true" className="h-96 animate-pulse rounded-lg bg-surface motion-reduce:animate-none" />;

  const category = data.find((c) => c.key === stat) ?? data[0];
  return (
    <div className="space-y-4">
      <Segmented
        label="Statistic"
        value={category.key}
        options={data.map((c) => ({ value: c.key, label: c.label }))}
        onChange={(key) => router.replace(`/leaders?stat=${key}`, { scroll: false })}
      />
      <table className="w-full rounded-lg bg-surface text-[15px]">
        <thead>
          <tr className="border-b border-border text-sm text-foreground/60">
            <th className="w-12 py-2 pl-4 text-left font-semibold">#</th>
            <th className="py-2 text-left font-semibold">Player</th>
            <th className="py-2 text-left font-semibold">Team</th>
            <th className="py-2 pl-2 pr-4 text-right font-semibold">{category.abbreviation || category.label}</th>
          </tr>
        </thead>
        <tbody>
          {category.leaders.map((l, i) => (
            <tr key={l.espnId} className="border-b border-border/60 last:border-b-0">
              <td className="py-2 pl-4 font-semibold text-foreground/50 tabular-nums">{i + 1}</td>
              <td className="py-2">
                <Link href={`/players/${l.espnId}`} className="flex items-center gap-3 font-semibold outline-none hover:text-accent focus-visible:underline">
                  <CircularBadge src={l.headshotUrl} alt="" size="md" />
                  {l.displayName}
                </Link>
              </td>
              <td className="py-2">
                {l.teamId ? (
                  <Link href={`/teams/${l.teamId}`} className="inline-flex items-center gap-2 text-foreground/70 outline-none hover:text-accent focus-visible:underline">
                    <CircularBadge src={l.teamLogoUrl} alt="" size="sm" />
                    {l.teamAbbreviation}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-2 text-foreground/70">
                    <CircularBadge src={l.teamLogoUrl} alt="" size="sm" />
                    {l.teamAbbreviation}
                  </span>
                )}
              </td>
              <td className="py-2 pl-2 pr-4 text-right font-bold tabular-nums">{l.displayValue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LeadersPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold tracking-tight">League leaders</h1>
      <Suspense fallback={null}>
        <LeadersView />
      </Suspense>
    </div>
  );
}
