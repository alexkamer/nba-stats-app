"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useState } from "react";

// The API returns one of two shapes depending on whether the game has been
// ingested as `final` (SPEC.md Sec 4): a DB-backed shape with real internal
// FK ids (safe to link to /teams/[id], /players/[id]), or a live-proxied
// shape keyed by ESPN ids/display names only (nothing persisted, so there
// may be no corresponding local row to link to). This page normalizes both
// into one view model rather than branching the whole render.
interface ApiResponse {
  source: "db" | "live";
  game: DbGame | LiveGame;
}

interface DbGame {
  date: string;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: { id: number; displayName: string; abbreviation: string };
  awayTeam: { id: number; displayName: string; abbreviation: string };
  venue: { name: string } | null;
  teamGameStats: (TeamStatFields & { teamId: number; team: { abbreviation: string } })[];
  playerGameStats: (PlayerStatFields & { id: number; teamId: number; player: { id: number; displayName: string } })[];
  plays: PlayFields[];
}

interface LiveGame {
  date: string;
  statusDetail: string;
  home: { espnId: string; abbreviation: string; displayName: string; score: number | null };
  away: { espnId: string; abbreviation: string; displayName: string; score: number | null };
  teamGameStats: (TeamStatFields & { teamEspnId: string })[];
  playerGameStats: (PlayerStatFields & { teamEspnId: string; playerDisplayName: string })[];
  plays: PlayFields[];
}

interface TeamStatFields {
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
}

interface PlayerStatFields {
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
}

interface PlayFields {
  id?: number;
  period: number | null;
  clock: string | null;
  description: string | null;
  homeScore: number | null;
  awayScore: number | null;
  scoringPlay: boolean;
}

async function fetchGame(eventId: string): Promise<ApiResponse> {
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
  if (error || !data) return <p className="text-red-400">Game not found.</p>;

  const { game, source } = data;

  // Normalize both shapes into one view model.
  const home =
    source === "db"
      ? { linkId: (game as DbGame).homeTeam.id, abbreviation: (game as DbGame).homeTeam.abbreviation, displayName: (game as DbGame).homeTeam.displayName, score: (game as DbGame).homeScore }
      : { linkId: null, abbreviation: (game as LiveGame).home.abbreviation, displayName: (game as LiveGame).home.displayName, score: (game as LiveGame).home.score };
  const away =
    source === "db"
      ? { linkId: (game as DbGame).awayTeam.id, abbreviation: (game as DbGame).awayTeam.abbreviation, displayName: (game as DbGame).awayTeam.displayName, score: (game as DbGame).awayScore }
      : { linkId: null, abbreviation: (game as LiveGame).away.abbreviation, displayName: (game as LiveGame).away.displayName, score: (game as LiveGame).away.score };

  const teamRows =
    source === "db"
      ? (game as DbGame).teamGameStats.map((s) => ({ key: s.team.abbreviation, abbreviation: s.team.abbreviation, ...s }))
      : (game as LiveGame).teamGameStats.map((s) => {
          const abbreviation = s.teamEspnId === (game as LiveGame).home.espnId ? home.abbreviation : away.abbreviation;
          return { key: s.teamEspnId, abbreviation, ...s };
        });

  const playerRowsByTeam = (teamAbbreviation: string, teamLinkId: number | null) => {
    if (source === "db") {
      return (game as DbGame).playerGameStats
        .filter((p) => p.teamId === teamLinkId)
        .map((p) => ({ key: p.id, linkId: p.player.id, name: p.player.displayName, ...p }))
        .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
    }
    const liveHome = (game as LiveGame).home;
    const liveAway = (game as LiveGame).away;
    const targetEspnId = teamAbbreviation === liveHome.abbreviation ? liveHome.espnId : liveAway.espnId;
    return (game as LiveGame).playerGameStats
      .filter((p) => p.teamEspnId === targetEspnId)
      .map((p, i) => ({ key: i, linkId: null, name: p.playerDisplayName, ...p }))
      .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
  };

  const plays = game.plays.map((p, i) => ({ ...p, key: p.id ?? i }));
  const visiblePlays = showAllPlays ? plays : plays.slice(-20);

  return (
    <div className="space-y-8">
      <div className="text-center space-y-1">
        <p className="text-neutral-500 text-sm">{new Date(game.date).toLocaleDateString()}</p>
        <div className="flex items-center justify-center gap-6 text-2xl font-semibold">
          <TeamLabel team={away} />
          <span className="text-neutral-500 text-base">@</span>
          <TeamLabel team={home} />
        </div>
        {source === "db" && (game as DbGame).venue && (
          <p className="text-neutral-500 text-sm">{(game as DbGame).venue!.name}</p>
        )}
        {source === "live" && <p className="text-neutral-500 text-sm">{(game as LiveGame).statusDetail}</p>}
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
            {teamRows.every((s) => s.points === null) ? (
              <tr>
                <td colSpan={10} className="py-4 text-center text-neutral-500">
                  No box score yet
                  {source === "live" ? ` — ${(game as LiveGame).statusDetail}` : ""}.
                </td>
              </tr>
            ) : (
              teamRows.map((s) => (
                <tr key={s.key} className="border-b border-neutral-900">
                  <td className="py-2 pr-2">{s.abbreviation}</td>
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
              ))
            )}
          </tbody>
        </table>
      </section>

      {[away, home].map((team) => {
        const rows = playerRowsByTeam(team.abbreviation, team.linkId);
        if (rows.length === 0) return null;
        return (
          <section key={team.abbreviation}>
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
                {rows.map((p) => (
                  <tr key={p.key} className="border-b border-neutral-900">
                    <td className="py-2 pr-2">
                      {p.linkId ? (
                        <Link href={`/players/${p.linkId}`} className="hover:text-neutral-100">
                          {p.name}
                        </Link>
                      ) : (
                        p.name
                      )}
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
        );
      })}

      {plays.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium text-neutral-300">Play-by-play</h2>
            <button
              onClick={() => setShowAllPlays((v) => !v)}
              className="text-sm text-neutral-400 hover:text-neutral-100"
            >
              {showAllPlays ? "Show less" : `Show all ${plays.length} plays`}
            </button>
          </div>
          <div className="space-y-1">
            {visiblePlays.map((play) => (
              <div
                key={play.key}
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
      )}
    </div>
  );
}

function TeamLabel({ team }: { team: { linkId: number | null; abbreviation: string; score: number | null } }) {
  const content = (
    <>
      {team.abbreviation} {team.score ?? "-"}
    </>
  );
  if (team.linkId) {
    return (
      <Link href={`/teams/${team.linkId}`} className="hover:text-neutral-300">
        {content}
      </Link>
    );
  }
  return <span>{content}</span>;
}
