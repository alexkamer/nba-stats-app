"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense } from "react";

interface PlayerDetail {
  player: {
    id: number;
    displayName: string;
    headshotUrl: string | null;
    jersey: string | null;
    heightIn: number | null;
    weightLb: number | null;
    college: string | null;
    position: { name: string } | null;
    currentTeam: { id: number; displayName: string; abbreviation: string } | null;
    playerSeasonStats: {
      season: { year: number; type: string };
      gamesPlayed: number | null;
      pointsPerGame: number | null;
      reboundsPerGame: number | null;
      assistsPerGame: number | null;
      stealsPerGame: number | null;
      blocksPerGame: number | null;
      fieldGoalPct: number | null;
      threePointPct: number | null;
      freeThrowPct: number | null;
    }[];
  };
  recentGames: {
    id: number;
    minutes: number | null;
    points: number | null;
    rebounds: number | null;
    assists: number | null;
    game: {
      espnId: string;
      date: string;
      homeTeam: { abbreviation: string };
      awayTeam: { abbreviation: string };
    };
  }[];
}

async function fetchPlayer(athleteId: string): Promise<PlayerDetail> {
  const res = await fetch(`/api/players/${athleteId}`);
  if (!res.ok) throw new Error("Failed to load player");
  return res.json();
}

function formatHeight(heightIn: number | null): string {
  if (!heightIn) return "—";
  return `${Math.floor(heightIn / 12)}'${heightIn % 12}"`;
}

export default function PlayerDetailPage() {
  return (
    <Suspense fallback={<p className="text-neutral-400">Loading…</p>}>
      <PlayerDetailContent />
    </Suspense>
  );
}

function PlayerDetailContent() {
  const { athleteId } = useParams<{ athleteId: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["player", athleteId],
    queryFn: () => fetchPlayer(athleteId),
  });

  if (isLoading) return <p className="text-neutral-400">Loading…</p>;
  if (error || !data) return <p className="text-red-400">Failed to load player.</p>;

  const { player, recentGames } = data;
  const seasonStat = player.playerSeasonStats[0];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        {player.headshotUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={player.headshotUrl} alt={player.displayName} className="h-20 w-20 rounded-full bg-neutral-800" />
        )}
        <div>
          <h1 className="text-2xl font-semibold">{player.displayName}</h1>
          <p className="text-neutral-400 text-sm">
            {player.currentTeam ? (
              <Link href={`/teams/${player.currentTeam.id}`} className="hover:text-neutral-100">
                {player.currentTeam.displayName}
              </Link>
            ) : (
              "Free agent"
            )}
            {player.position && ` · ${player.position.name}`}
            {player.jersey && ` · #${player.jersey}`}
          </p>
          <p className="text-neutral-500 text-sm">
            {formatHeight(player.heightIn)}
            {player.weightLb && ` · ${player.weightLb} lb`}
            {player.college && ` · ${player.college}`}
          </p>
        </div>
      </div>

      {seasonStat && (
        <section>
          <h2 className="text-lg font-medium text-neutral-300 mb-3">
            {seasonStat.season.year - 1}-{String(seasonStat.season.year).slice(-2)} season
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-8 gap-3">
            <Stat label="GP" value={seasonStat.gamesPlayed ?? "—"} />
            <Stat label="PPG" value={seasonStat.pointsPerGame?.toFixed(1) ?? "—"} />
            <Stat label="RPG" value={seasonStat.reboundsPerGame?.toFixed(1) ?? "—"} />
            <Stat label="APG" value={seasonStat.assistsPerGame?.toFixed(1) ?? "—"} />
            <Stat label="SPG" value={seasonStat.stealsPerGame?.toFixed(1) ?? "—"} />
            <Stat label="BPG" value={seasonStat.blocksPerGame?.toFixed(1) ?? "—"} />
            <Stat label="FG%" value={seasonStat.fieldGoalPct?.toFixed(1) ?? "—"} />
            <Stat label="3P%" value={seasonStat.threePointPct?.toFixed(1) ?? "—"} />
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-medium text-neutral-300 mb-3">Recent games</h2>
        <div className="space-y-1">
          {recentGames.map((entry) => (
            <Link
              key={entry.id}
              href={`/games/${entry.game.espnId}`}
              className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm hover:border-neutral-600"
            >
              <span>
                {entry.game.awayTeam.abbreviation} @ {entry.game.homeTeam.abbreviation}
              </span>
              <span className="text-neutral-400">
                {entry.points ?? 0} pts · {entry.rebounds ?? 0} reb · {entry.assists ?? 0} ast
              </span>
              <span className="text-neutral-500">{new Date(entry.game.date).toLocaleDateString()}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3 text-center">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-lg font-medium">{value}</div>
    </div>
  );
}
