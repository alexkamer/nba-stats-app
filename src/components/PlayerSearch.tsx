"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircularBadge } from "@/components/CircularBadge";

interface Player {
  id: number;
  displayName: string;
  headshotUrl: string | null;
  position: { abbreviation: string } | null;
  currentTeam: { abbreviation: string } | null;
}

async function fetchPlayers(): Promise<Player[]> {
  const res = await fetch("/api/players");
  if (!res.ok) throw new Error("Failed to load players");
  const data = await res.json();
  return data.players;
}

const MAX_RESULTS = 8;

/** Lower is more relevant. Ranks a full-name or first-letter-of-a-word
 * match above a mid-name substring match, and either above a team-only
 * match, so e.g. "leb" surfaces LeBron James before someone who merely
 * plays for a team with "leb" in its abbreviation. */
function matchRank(player: Player, q: string): number | null {
  const name = player.displayName.toLowerCase();
  if (name.startsWith(q)) return 0;
  if (name.split(" ").some((word) => word.startsWith(q))) return 1;
  if (name.includes(q)) return 2;
  if (player.currentTeam?.abbreviation.toLowerCase().includes(q)) return 3;
  return null;
}

/** Global player lookup shown in the top bar. Fetches the full player list
 * once (same endpoint the old /players listing page used) and filters
 * client-side as the user types, since there's no per-keystroke server
 * round-trip worth adding for a few hundred rows. */
export function PlayerSearch() {
  const { data: players } = useQuery({ queryKey: ["players"], queryFn: fetchPlayers });
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !players) return [];
    return players
      .map((p) => ({ player: p, rank: matchRank(p, q) }))
      .filter(({ rank }) => rank !== null)
      .sort((a, b) => a.rank! - b.rank!)
      .slice(0, MAX_RESULTS)
      .map(({ player }) => player);
  }, [players, query]);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function goTo(player: Player) {
    router.push(`/players/${player.id}`);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      goTo(results[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-56">
      <input
        type="text"
        placeholder="Search players…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full rounded-md border border-border bg-surface-muted px-3 py-1.5 text-sm outline-none focus:border-accent"
      />

      {open && query.trim() && (
        <div className="absolute right-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-md border border-border bg-surface shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-foreground/60">No players match &ldquo;{query}&rdquo;.</p>
          ) : (
            <ul>
              {results.map((player, i) => (
                <li key={player.id}>
                  <Link
                    href={`/players/${player.id}`}
                    onClick={() => {
                      setQuery("");
                      setOpen(false);
                    }}
                    onMouseEnter={() => setHighlighted(i)}
                    className={`flex items-center gap-2.5 px-3 py-2 text-sm ${
                      i === highlighted ? "bg-surface-muted" : ""
                    }`}
                  >
                    <CircularBadge src={player.headshotUrl} alt="" size="sm" />
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{player.displayName}</div>
                      <div className="text-foreground/60 text-xs">
                        {player.currentTeam?.abbreviation ?? "FA"}
                        {player.position && ` · ${player.position.abbreviation}`}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
