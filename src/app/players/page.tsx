"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CircularBadge } from "@/components/CircularBadge";

interface Player {
  id: number;
  displayName: string;
  headshotUrl: string | null;
  jersey: string | null;
  position: { abbreviation: string } | null;
  currentTeam: { abbreviation: string; color: string | null } | null;
}

async function fetchPlayers(): Promise<Player[]> {
  const res = await fetch("/api/players");
  if (!res.ok) throw new Error("Failed to load players");
  const data = await res.json();
  return data.players;
}

export default function PlayersPage() {
  const { data: players, isLoading, error } = useQuery({ queryKey: ["players"], queryFn: fetchPlayers });
  const [search, setSearch] = useState("");

  // Client-side search per SPEC.md Sec 9.2: fetch the full list once, filter
  // in the browser, no per-keystroke server round-trip.
  const filtered = useMemo(() => {
    if (!players) return [];
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter(
      (p) => p.displayName.toLowerCase().includes(q) || p.currentTeam?.abbreviation.toLowerCase().includes(q),
    );
  }, [players, search]);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold tracking-tight">Players</h1>
      <input
        type="text"
        placeholder="Search by name or team…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      />

      {isLoading && <p className="text-foreground/82">Loading players…</p>}
      {error && <p className="text-red-600 dark:text-red-400">Failed to load players.</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {filtered.map((player) => {
          const accent = player.currentTeam?.color ? `#${player.currentTeam.color}` : "var(--color-border)";
          return (
            <Link
              key={player.id}
              href={`/players/${player.id}`}
              className="flex items-center gap-2.5 rounded-md bg-surface-muted px-3 py-2 text-sm transition-transform hover:-translate-y-0.5"
              style={{ boxShadow: `inset 3px 0 0 0 ${accent}` }}
            >
              <CircularBadge src={player.headshotUrl} alt="" size="md" />
              <div className="min-w-0">
                <div className="truncate font-semibold">{player.displayName}</div>
                <div className="text-foreground/60 text-xs">
                  {player.currentTeam?.abbreviation ?? "FA"}
                  {player.position && ` · ${player.position.abbreviation}`}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      {players && filtered.length === 0 && <p className="text-foreground/72">No players match &ldquo;{search}&rdquo;.</p>}
    </div>
  );
}
