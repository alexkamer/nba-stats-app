"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useState } from "react";

interface GameDetail {
  game: {
    id: number;
    date: string;
    homeScore: number | null;
    awayScore: number | null;
    homeTeam: { id: number; displayName: string; abbreviation: string };
    awayTeam: { id: number; displayName: string; abbreviation: string };
    venue: { name: string } | null;
    teamGameStats: {
      teamId: number;
      points: number | null;
      rebounds: number | null;
      assists: number | null;
      steals: number | null;
      blocks: number | null;
      turnovers: number | null;
      fgMade: number | null;
      fgAtt: number | null;
      threeMade: number | null;
      threeAtt: number | null;
      ftMade: number | null;
      ftAtt: number | null;
      team: { abbreviation: string };
    }[];
    playerGameStats: {
      id: number;
      teamId: number;
      minutes: number | null;
      points: number | null;
      rebounds: number | null;
      assists: number | null;
      steals: number | null;
      blocks: number | null;
      player: { id: number; displayName: string };
    }[];
    plays: {
      id: number;
      period: number | null;
      clock: string | null;
      description: string | null;
      homeScore: number | null;
      awayScore: number | null;
      scoringPlay: boolean;
    }[];
  };
}

async function fetchGame(eventId: string): Promise<GameDetail> {
  const res = await fetch(`/api/games/${eventId}`);
  if (!res.ok) throw new Error("Failed to load game");
  return res.json();
}

export default function GameDetailPage() {
  return (
    <Suspense fallback={<p className="text-neutral-400">Loading…</p>}>
      <GameDetailContent />
    </Suspense>
  );
}

function GameDetailContent() {
  const { eventId } = useParams<{ eventId: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["game", eventId],
    queryFn: () => fetchGame(eventId),
  });
  const [showAllPlays, setShowAllPlays] = useState(false);

  if (isLoading) return <p className="text-neutral-400">Loading…</p>;
  if (error || !data) {
    return (
      <p className="text-red-400">
        Game not found — it may not be final yet (live games aren&rsquo;t supported until M8).
      </p>
    );
  }

  const { game } = data;
  const homeStats = game.teamGameStats.find((s) => s.teamId === game.homeTeam.id);
  const awayStats = game.teamGameStats.find((s) => s.teamId === game.awayTeam.id);
  const plays = showAllPlays ? game.plays : game.plays.slice(-20);

  return (
    <div className="space-y-8">
      <div className="text-center space-y-1">
        <p className="text-neutral-500 text-sm">{new Date(game.date).toLocaleDateString()}</p>
        <div className="flex items-center justify-center gap-6 text-2xl font-semibold">
          <Link href={`/teams/${game.awayTeam.id}`} className="hover:text-neutral-300">
            {game.awayTeam.abbreviation} {game.awayScore}
          </Link>
          <span className="text-neutral-500 text-base">@</span>
          <Link href={`/teams/${game.homeTeam.id}`} className="hover:text-neutral-300">
            {game.homeTeam.abbreviation} {game.homeScore}
          </Link>
        </div>
        {game.venue && <p className="text-neutral-500 text-sm">{game.venue.name}</p>}
      </div>

      <section>
        <h2 className="text-lg font-medium text-neutral-300 mb-3">Box score</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500 border-b border-neutral-800">
              <th className="py-2 pr-2">Team</th>
              <th className="py-2 pr-2 text-right">PTS</th>
              <th className="py-2 pr-2 text-right">REB</th>
              <th className="py-2 pr-2 text-right">AST</th>
              <th className="py-2 pr-2 text-right">STL</th>
              <th className="py-2 pr-2 text-right">BLK</th>
              <th className="py-2 pr-2 text-right">TO</th>
              <th className="py-2 pr-2 text-right">FG</th>
              <th className="py-2 pr-2 text-right">3PT</th>
              <th className="py-2 text-right">FT</th>
            </tr>
          </thead>
          <tbody>
            {[awayStats, homeStats].map(
              (s) =>
                s && (
                  <tr key={s.teamId} className="border-b border-neutral-900">
                    <td className="py-2 pr-2">{s.team.abbreviation}</td>
                    <td className="py-2 pr-2 text-right">{s.points}</td>
                    <td className="py-2 pr-2 text-right">{s.rebounds}</td>
                    <td className="py-2 pr-2 text-right">{s.assists}</td>
                    <td className="py-2 pr-2 text-right">{s.steals}</td>
                    <td className="py-2 pr-2 text-right">{s.blocks}</td>
                    <td className="py-2 pr-2 text-right">{s.turnovers}</td>
                    <td className="py-2 pr-2 text-right">
                      {s.fgMade}-{s.fgAtt}
                    </td>
                    <td className="py-2 pr-2 text-right">
                      {s.threeMade}-{s.threeAtt}
                    </td>
                    <td className="py-2 text-right">
                      {s.ftMade}-{s.ftAtt}
                    </td>
                  </tr>
                ),
            )}
          </tbody>
        </table>
      </section>

      {[game.awayTeam, game.homeTeam].map((team) => (
        <section key={team.id}>
          <h2 className="text-lg font-medium text-neutral-300 mb-3">{team.displayName}</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500 border-b border-neutral-800">
                <th className="py-2 pr-2">Player</th>
                <th className="py-2 pr-2 text-right">MIN</th>
                <th className="py-2 pr-2 text-right">PTS</th>
                <th className="py-2 pr-2 text-right">REB</th>
                <th className="py-2 pr-2 text-right">AST</th>
                <th className="py-2 pr-2 text-right">STL</th>
                <th className="py-2 text-right">BLK</th>
              </tr>
            </thead>
            <tbody>
              {game.playerGameStats
                .filter((p) => p.teamId === team.id)
                .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
                .map((p) => (
                  <tr key={p.id} className="border-b border-neutral-900">
                    <td className="py-2 pr-2">
                      <Link href={`/players/${p.player.id}`} className="hover:text-neutral-100">
                        {p.player.displayName}
                      </Link>
                    </td>
                    <td className="py-2 pr-2 text-right">{p.minutes}</td>
                    <td className="py-2 pr-2 text-right">{p.points}</td>
                    <td className="py-2 pr-2 text-right">{p.rebounds}</td>
                    <td className="py-2 pr-2 text-right">{p.assists}</td>
                    <td className="py-2 pr-2 text-right">{p.steals}</td>
                    <td className="py-2 text-right">{p.blocks}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium text-neutral-300">Play-by-play</h2>
          <button
            onClick={() => setShowAllPlays((v) => !v)}
            className="text-sm text-neutral-400 hover:text-neutral-100"
          >
            {showAllPlays ? "Show less" : `Show all ${game.plays.length} plays`}
          </button>
        </div>
        <div className="space-y-1">
          {plays.map((play) => (
            <div
              key={play.id}
              className={`flex items-center justify-between rounded-md px-3 py-1.5 text-sm ${
                play.scoringPlay ? "bg-neutral-900" : ""
              }`}
            >
              <span className="text-neutral-500 w-20 shrink-0">
                Q{play.period} {play.clock}
              </span>
              <span className="flex-1">{play.description}</span>
              <span className="text-neutral-500 w-16 text-right shrink-0">
                {play.awayScore}-{play.homeScore}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
