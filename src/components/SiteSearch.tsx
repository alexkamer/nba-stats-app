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

interface Team {
  id: number;
  displayName: string;
  abbreviation: string;
  logoUrl: string | null;
}

interface Result {
  kind: "player" | "team";
  id: number;
  href: string;
  label: string;
  sublabel: string;
  imageUrl: string | null;
}

async function fetchPlayers(): Promise<Player[]> {
  const res = await fetch("/api/players");
  if (!res.ok) throw new Error("Failed to load players");
  const data = await res.json();
  return data.players;
}

async function fetchTeams(): Promise<Team[]> {
  const res = await fetch("/api/teams");
  if (!res.ok) throw new Error("Failed to load teams");
  const data = await res.json();
  return data.teams;
}

const MAX_RESULTS = 8;

/** Lower is more relevant. A full-name/full-team-name match ranks above a
 * first-letter-of-a-word match, which ranks above a mid-string substring
 * match, which ranks above a team-abbreviation-only match — so e.g. "leb"
 * surfaces LeBron James before someone who merely plays for a team with
 * "leb" in its abbreviation. */
function matchRank(name: string, abbreviation: string | undefined, q: string): number | null {
  const lower = name.toLowerCase();
  if (lower.startsWith(q)) return 0;
  if (lower.split(" ").some((word) => word.startsWith(q))) return 1;
  if (lower.includes(q)) return 2;
  if (abbreviation?.toLowerCase().includes(q)) return 3;
  return null;
}

/** Global player + team lookup shown in the top bar. Fetches both lists
 * once and filters client-side as the user types, since there's no
 * per-keystroke server round-trip worth adding for a few hundred rows. */
export function SiteSearch() {
  const { data: players } = useQuery({ queryKey: ["players"], queryFn: fetchPlayers });
  const { data: teams } = useQuery({ queryKey: ["teams"], queryFn: fetchTeams });
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const playerResults: { result: Result; rank: number }[] = (players ?? []).flatMap((p) => {
      const rank = matchRank(p.displayName, p.currentTeam?.abbreviation, q);
      if (rank === null) return [];
      return [
        {
          rank,
          result: {
            kind: "player" as const,
            id: p.id,
            href: `/players/${p.id}`,
            label: p.displayName,
            sublabel: `${p.currentTeam?.abbreviation ?? "FA"}${p.position ? ` · ${p.position.abbreviation}` : ""}`,
            imageUrl: p.headshotUrl,
          },
        },
      ];
    });

    const teamResults: { result: Result; rank: number }[] = (teams ?? []).flatMap((t) => {
      const rank = matchRank(t.displayName, t.abbreviation, q);
      if (rank === null) return [];
      return [
        {
          rank,
          result: {
            kind: "team" as const,
            id: t.id,
            href: `/teams/${t.id}`,
            label: t.displayName,
            sublabel: "Team",
            imageUrl: t.logoUrl,
          },
        },
      ];
    });

    return [...playerResults, ...teamResults]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, MAX_RESULTS)
      .map(({ result }) => result);
  }, [players, teams, query]);

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

  function goTo(result: Result) {
    router.push(result.href);
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
        placeholder="Search players, teams…"
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
            <p className="px-3 py-2 text-sm text-foreground/60">No matches for &ldquo;{query}&rdquo;.</p>
          ) : (
            <ul>
              {results.map((result, i) => (
                <li key={`${result.kind}-${result.id}`}>
                  <Link
                    href={result.href}
                    onClick={() => {
                      setQuery("");
                      setOpen(false);
                    }}
                    onMouseEnter={() => setHighlighted(i)}
                    className={`flex items-center gap-2.5 px-3 py-2 text-sm ${
                      i === highlighted ? "bg-surface-muted" : ""
                    }`}
                  >
                    <CircularBadge src={result.imageUrl} alt="" size="sm" />
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{result.label}</div>
                      <div className="text-foreground/60 text-xs">{result.sublabel}</div>
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
