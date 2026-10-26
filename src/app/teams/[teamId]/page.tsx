"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense } from "react";

interface TeamDetail {
  team: {
    id: number;
    displayName: string;
    logoUrl: string | null;
    division: { name: string; conference: { name: string } } | null;
    venue: { name: string; city: string | null; state: string | null } | null;
    players: { id: number; displayName: string; jersey: string | null; position: { abbreviation: string } | null }[];
    standings: {
      wins: number | null;
      losses: number | null;
      conferenceRank: number | null;
      divisionRank: number | null;
      streak: string | null;
      homeRecord: string | null;
      awayRecord: string | null;
    }[];
    teamSeasonStats: { pointsPerGame: number | null; oppPointsPerGame: number | null }[];
  };
  recentGames: {
    id: number;
    espnId: string;
    date: string;
    homeScore: number | null;
    awayScore: number | null;
    homeTeam: { id: number; abbreviation: string };
    awayTeam: { id: number; abbreviation: string };
  }[];
}

async function fetchTeam(teamId: string): Promise<TeamDetail> {
  const res = await fetch(`/api/teams/${teamId}`);
  if (!res.ok) throw new Error("Failed to load team");
  return res.json();
}

export default function TeamDetailPage() {
  return (
    <Suspense fallback={<p className="text-neutral-400">Loading…</p>}>
      <TeamDetailContent />
    </Suspense>
  );
}

function TeamDetailContent() {
  const { teamId } = useParams<{ teamId: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => fetchTeam(teamId),
  });

  if (isLoading) return <p className="text-neutral-400">Loading…</p>;
  if (error || !data) return <p className="text-red-400">Failed to load team.</p>;

  const { team, recentGames } = data;
  const standing = team.standings[0];
  const seasonStat = team.teamSeasonStats[0];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        {team.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.logoUrl} alt={team.displayName} className="h-16 w-16" />
        )}
        <div>
          <h1 className="text-2xl font-semibold">{team.displayName}</h1>
          <p className="text-neutral-400 text-sm">
            {team.division?.conference.name} · {team.division?.name} Division
            {team.venue && ` · ${team.venue.name}`}
          </p>
        </div>
      </div>

      {standing && (
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Record" value={`${standing.wins}-${standing.losses}`} />
          <Stat label="Conf Rank" value={standing.conferenceRank ?? "—"} />
          <Stat label="Div Rank" value={standing.divisionRank ?? "—"} />
          <Stat label="Streak" value={standing.streak ?? "—"} />
          <Stat label="Home" value={standing.homeRecord ?? "—"} />
          <Stat label="Away" value={standing.awayRecord ?? "—"} />
          {seasonStat?.pointsPerGame != null && (
            <Stat label="PPG" value={seasonStat.pointsPerGame.toFixed(1)} />
          )}
          {seasonStat?.oppPointsPerGame != null && (
            <Stat label="Opp PPG" value={seasonStat.oppPointsPerGame.toFixed(1)} />
          )}
        </section>
      )}

      <section>
        <h2 className="text-lg font-medium text-neutral-300 mb-3">Roster</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {team.players.map((player) => (
            <Link
              key={player.id}
              href={`/players/${player.id}`}
              className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm hover:border-neutral-600"
            >
              <span className="text-neutral-500 mr-1">#{player.jersey ?? "—"}</span>
              {player.displayName}
              {player.position && <span className="text-neutral-500 ml-1">({player.position.abbreviation})</span>}
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium text-neutral-300 mb-3">Recent games</h2>
        <div className="space-y-1">
          {recentGames.map((game) => (
            <Link
              key={game.id}
              href={`/games/${game.espnId}`}
              className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm hover:border-neutral-600"
            >
              <span>
                {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
              </span>
              <span className="text-neutral-400">
                {game.awayScore}-{game.homeScore}
              </span>
              <span className="text-neutral-500">{new Date(game.date).toLocaleDateString()}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-lg font-medium">{value}</div>
    </div>
  );
}
