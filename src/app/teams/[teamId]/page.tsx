"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useState } from "react";

interface SeasonInfo {
  id: number;
  year: number;
  type: string;
}

interface TeamDetail {
  team: {
    id: number;
    displayName: string;
    abbreviation: string;
    logoUrl: string | null;
    color: string | null;
    alternateColor: string | null;
    division: { name: string; conference: { name: string } } | null;
    venue: { name: string; city: string | null; state: string | null } | null;
  };
  season: SeasonInfo | null;
  availableSeasons: SeasonInfo[];
  standing: {
    wins: number | null;
    losses: number | null;
    winPct: number | null;
    conferenceRank: number | null;
    divisionRank: number | null;
    gamesBehind: number | null;
    streak: string | null;
    homeRecord: string | null;
    awayRecord: string | null;
    divRecord: string | null;
    confRecord: string | null;
    lastTen: string | null;
  } | null;
  teamSeasonStat: { pointsPerGame: number | null; oppPointsPerGame: number | null } | null;
  extendedStats: {
    fieldGoalPct: string | null;
    threePointPct: string | null;
    freeThrowPct: string | null;
    reboundsPerGame: string | null;
    assistsPerGame: string | null;
    turnoversPerGame: string | null;
    stealsPerGame: string | null;
    blocksPerGame: string | null;
  } | null;
  nbaCupStanding: {
    groupName: string;
    seed: number | null;
    wins: number | null;
    losses: number | null;
    streak: string | null;
  } | null;
  roster: {
    id: number;
    displayName: string;
    jersey: string | null;
    position: { abbreviation: string } | null;
    seasonStat: {
      gamesPlayed: number | null;
      pointsPerGame: number | null;
      reboundsPerGame: number | null;
      assistsPerGame: number | null;
      stealsPerGame: number | null;
      blocksPerGame: number | null;
      fieldGoalPct: number | null;
    } | null;
  }[];
  schedule: GameRow[];
  divisionStandings: {
    id: number;
    divisionRank: number | null;
    wins: number | null;
    losses: number | null;
    winPct: number | null;
    gamesBehind: number | null;
    streak: string | null;
    team: { id: number; displayName: string; abbreviation: string; location: string; logoUrl?: string | null };
  }[];
  news: {
    id: number;
    headline: string;
    description: string | null;
    url: string | null;
    imageUrl: string | null;
    publishedAt: string | null;
  }[];
  teamLeaders: {
    group: "offense" | "defense";
    statName: string;
    player: {
      id: number;
      displayName: string;
      headshotUrl: string | null;
      jersey: string | null;
      position: { abbreviation: string } | null;
    } | null;
    displayValue: string | null;
    secondary: { label: string; value: string | null }[];
  }[];
}

interface GameRow {
  id: number;
  espnId: string;
  date: string;
  status: "SCHEDULED" | "LIVE" | "FINAL";
  homeScore: number | null;
  awayScore: number | null;
  homeTeamId: number;
  awayTeamId: number;
  homeTeam: { id: number; abbreviation: string; displayName: string; name: string; logoUrl?: string | null };
  awayTeam: { id: number; abbreviation: string; displayName: string; name: string; logoUrl?: string | null };
}

async function fetchTeam(teamId: string): Promise<TeamDetail> {
  const res = await fetch(`/api/teams/${teamId}`);
  if (!res.ok) throw new Error("Failed to load team");
  return res.json();
}

function seasonLabel(year: number): string {
  return `${year - 1}-${String(year).slice(-2)}`;
}

function ordinal(n: number | null): string {
  if (n == null) return "—";
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function formatStreak(streak: string | null): string {
  if (!streak) return "—";
  if (streak.startsWith("-")) return `L${streak.slice(1)}`;
  return `W${streak}`;
}

type TeamTab = "home" | "stats" | "schedule" | "roster" | "depth" | "injuries" | "transactions";

type LeadersGroup = "offense" | "defense";

const LEADERS_GROUPS: { value: LeadersGroup; label: string }[] = [
  { value: "offense", label: "Offense" },
  { value: "defense", label: "Defense" },
];

const TEAM_TABS: { value: TeamTab; label: string }[] = [
  { value: "home", label: "Home" },
  { value: "stats", label: "Stats" },
  { value: "schedule", label: "Schedule" },
  { value: "roster", label: "Roster" },
  { value: "depth", label: "Depth" },
  { value: "injuries", label: "Injuries" },
  { value: "transactions", label: "Transactions" },
];

export default function TeamDetailPage() {
  return (
    <Suspense fallback={<p className="text-neutral-400">Loading…</p>}>
      <TeamDetailContent />
    </Suspense>
  );
}

function TeamDetailContent() {
  const { teamId } = useParams<{ teamId: string }>();
  const [activeTab, setActiveTab] = useState<TeamTab>("home");
  const [leadersGroup, setLeadersGroup] = useState<LeadersGroup>("offense");
  const { data, isLoading, error } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => fetchTeam(teamId),
  });

  if (isLoading) return <p className="text-neutral-400">Loading…</p>;
  if (error || !data) return <p className="text-red-400">Failed to load team.</p>;

  const {
    team,
    season,
    standing,
    teamSeasonStat,
    extendedStats,
    nbaCupStanding,
    roster,
    schedule,
    divisionStandings,
    news,
    teamLeaders,
  } = data;
  const accentColor = team.color ? `#${team.color}` : "#525252";

  const rosterByPoints = roster.slice().sort((a, b) => (b.seasonStat?.pointsPerGame ?? -1) - (a.seasonStat?.pointsPerGame ?? -1));
  const visibleLeaders = teamLeaders.filter((l) => l.group === leadersGroup);
  // `schedule` comes back date-ascending from the API; show the most
  // recently played game first, with anything still upcoming (which has no
  // "most recent" ordering yet) following in chronological order.
  const completedGames = schedule.filter((g) => g.status === "FINAL").reverse();
  const upcomingGames = schedule.filter((g) => g.status !== "FINAL");
  const orderedSchedule = [...completedGames, ...upcomingGames];
  const mostRecentGame = completedGames[0] ?? null;

  return (
    <div className="space-y-8">
      <div
        className="relative left-1/2 right-1/2 -mx-[50vw] w-screen bg-neutral-900 border-b border-neutral-800"
        style={{ borderTopColor: accentColor, borderTopWidth: 4 }}
      >
        <div className="mx-auto max-w-6xl flex items-center gap-4 px-6 py-5 sm:py-6">
          {team.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={team.logoUrl} alt={team.displayName} className="h-16 w-16" />
          )}
          <div>
            <h1 className="text-2xl font-semibold">{team.displayName}</h1>
            <p className="text-neutral-400 text-sm">
              {standing
                ? `${standing.wins}-${standing.losses} · ${ordinal(standing.divisionRank)} in ${team.division?.name} Division`
                : `${team.division?.conference.name} · ${team.division?.name} Division`}
            </p>
          </div>
        </div>
        <div className="mx-auto max-w-6xl flex border-t border-neutral-800 px-6 text-sm">
          {TEAM_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`flex-1 px-3 py-2 text-center whitespace-nowrap ${
                activeTab === tab.value
                  ? "text-neutral-100 font-semibold border-b-2"
                  : "text-neutral-400 hover:text-neutral-200 border-b-2 border-transparent"
              }`}
              style={activeTab === tab.value ? { borderColor: accentColor } : undefined}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "home" && (
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr_260px] gap-6">
          <aside className="self-start rounded-lg border border-neutral-800 p-4 space-y-3">
            <h2 className="text-lg font-medium text-neutral-300">
              {season ? seasonLabel(season.year) : ""} Schedule
            </h2>
            {orderedSchedule.length > 0 && <p className="text-xs font-semibold text-neutral-500">Regular Season</p>}
            <div className="divide-y divide-neutral-800">
              {orderedSchedule.map((game) => {
                const isHome = game.homeTeamId === team.id;
                const opponent = isHome ? game.awayTeam : game.homeTeam;
                const teamScore = isHome ? game.homeScore : game.awayScore;
                const oppScore = isHome ? game.awayScore : game.homeScore;
                const won = game.status === "FINAL" && teamScore !== null && oppScore !== null && teamScore > oppScore;
                const highScore = teamScore !== null && oppScore !== null ? Math.max(teamScore, oppScore) : null;
                const lowScore = teamScore !== null && oppScore !== null ? Math.min(teamScore, oppScore) : null;
                return (
                  <Link
                    key={game.id}
                    href={`/games/${game.espnId}`}
                    className="flex items-center justify-between gap-2 w-full py-3 text-xs hover:text-neutral-100"
                  >
                    <span className="flex items-center gap-1.5 truncate min-w-0">
                      <span className="text-neutral-500 shrink-0">{isHome ? "vs." : "@"}</span>
                      {opponent.logoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={opponent.logoUrl} alt="" className="h-5 w-5 shrink-0" />
                      )}
                      <span className="truncate">{opponent.name}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      {game.status === "FINAL" ? (
                        <>
                          <span className={`font-semibold ${won ? "text-emerald-400" : "text-red-400"}`}>{won ? "W" : "L"}</span>{" "}
                          <span className="text-neutral-500">
                            {highScore}-{lowScore}
                          </span>
                        </>
                      ) : (
                        <span className="text-neutral-500">{new Date(game.date).toLocaleDateString()}</span>
                      )}
                    </span>
                  </Link>
                );
              })}
              {orderedSchedule.length === 0 && <p className="text-neutral-500 text-sm p-3">No games found.</p>}
            </div>
            <button
              onClick={() => setActiveTab("schedule")}
              className="block w-full text-center text-sm text-neutral-400 hover:text-neutral-100"
            >
              Full Schedule
            </button>
          </aside>

          <main className="space-y-4">
            <h2 className="text-lg font-medium text-neutral-300">News</h2>
            {mostRecentGame && (
              <Link
                href={`/games/${mostRecentGame.espnId}`}
                className="block rounded-lg border border-neutral-800 bg-neutral-900 p-4 hover:border-neutral-600"
              >
                <p className="text-xs text-neutral-500 mb-1">Latest game</p>
                <p className="font-medium">
                  {mostRecentGame.awayTeam.displayName} {mostRecentGame.awayScore} @ {mostRecentGame.homeTeam.displayName}{" "}
                  {mostRecentGame.homeScore}
                </p>
                <p className="text-neutral-500 text-sm">{new Date(mostRecentGame.date).toLocaleDateString()}</p>
              </Link>
            )}
            <div className="space-y-3">
              {news.map((article) => (
                <div key={article.id} className="flex gap-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
                  {article.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- external ESPN CDN images
                    <img src={article.imageUrl} alt="" className="h-20 w-32 object-cover rounded-md shrink-0" />
                  )}
                  <div className="space-y-1">
                    <a
                      href={article.url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium hover:text-neutral-300"
                    >
                      {article.headline}
                    </a>
                    {article.description && article.description !== article.headline && (
                      <p className="text-neutral-400 text-sm">{article.description}</p>
                    )}
                    {article.publishedAt && (
                      <p className="text-neutral-500 text-xs">{new Date(article.publishedAt).toLocaleDateString()}</p>
                    )}
                  </div>
                </div>
              ))}
              {news.length === 0 && <p className="text-neutral-500 text-sm">No recent news.</p>}
            </div>
          </main>

          <aside className="space-y-6">
            <div className="space-y-3">
              <h2 className="text-lg font-medium text-neutral-300">{team.division?.name} Division</h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-neutral-500 border-b border-neutral-800">
                    <th className="py-1.5 pr-2">Team</th>
                    <th className="py-1.5 pr-2 text-right">W</th>
                    <th className="py-1.5 pr-2 text-right">L</th>
                    <th className="py-1.5 pr-2 text-right">PCT</th>
                    <th className="py-1.5 pr-2 text-right">GB</th>
                    <th className="py-1.5 text-right">STRK</th>
                  </tr>
                </thead>
                <tbody>
                  {divisionStandings.map((s) => (
                    <tr
                      key={s.id}
                      className={`border-b border-neutral-900 ${
                        s.team.id === team.id ? "text-neutral-100 font-semibold" : "text-neutral-400"
                      }`}
                    >
                      <td className="py-1.5 pr-2">
                        <Link href={`/teams/${s.team.id}`} className="flex items-center gap-1.5 hover:text-neutral-100">
                          {s.team.logoUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={s.team.logoUrl} alt="" className="h-4 w-4" />
                          )}
                          {s.team.location}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-2 text-right">{s.wins}</td>
                      <td className="py-1.5 pr-2 text-right">{s.losses}</td>
                      <td className="py-1.5 pr-2 text-right">{s.winPct?.toFixed(3) ?? "—"}</td>
                      <td className="py-1.5 pr-2 text-right">{s.gamesBehind ?? "—"}</td>
                      <td className="py-1.5 text-right">{formatStreak(s.streak)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Link href="/standings" className="block w-full text-center text-sm text-neutral-400 hover:text-neutral-100">
                Full Standings
              </Link>
            </div>

            <div className="rounded-lg border border-neutral-800 p-4 space-y-3">
              <h2 className="text-lg font-medium text-neutral-300">
                {season ? seasonLabel(season.year) : ""} Team Leaders
              </h2>
              <div className="flex border-b border-neutral-800 text-sm">
                {LEADERS_GROUPS.map((group) => (
                  <button
                    key={group.value}
                    onClick={() => setLeadersGroup(group.value)}
                    className={`flex-1 pb-2 text-center border-b-2 ${
                      leadersGroup === group.value
                        ? "text-neutral-100 font-semibold"
                        : "text-neutral-500 border-transparent hover:text-neutral-300"
                    }`}
                    style={leadersGroup === group.value ? { borderColor: accentColor } : undefined}
                  >
                    {group.label}
                  </button>
                ))}
              </div>
              <div className="divide-y divide-neutral-800">
                {visibleLeaders.map(({ statName, player, displayValue, secondary }) => (
                  <div key={statName} className="w-full py-3 space-y-2">
                    <p className="text-sm text-neutral-300">{statName}</p>
                    {player ? (
                      <Link href={`/players/${player.id}`} className="flex items-center justify-between gap-3 hover:text-neutral-100">
                        <div className="flex items-center gap-3 min-w-0">
                          {player.headshotUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={player.headshotUrl}
                              alt=""
                              className="h-12 w-12 rounded-full bg-neutral-800 object-cover shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm truncate">{player.displayName}</p>
                            <p className="text-xs text-neutral-500 truncate">
                              {player.position?.abbreviation} #{player.jersey ?? "—"}
                            </p>
                            <p className="text-2xl font-semibold">{displayValue}</p>
                          </div>
                        </div>
                        <div className="text-right text-xs text-neutral-500 shrink-0 space-y-0.5">
                          {secondary.map((s) => (
                            <p key={s.label}>
                              {s.label} <span className="text-neutral-300 font-medium">{s.value ?? "—"}</span>
                            </p>
                          ))}
                        </div>
                      </Link>
                    ) : (
                      <p className="text-neutral-500 text-sm">—</p>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={() => setActiveTab("stats")}
                className="block w-full text-center text-sm text-neutral-400 hover:text-neutral-100"
              >
                Full Team Statistics
              </button>
            </div>
          </aside>
        </div>
      )}

      {activeTab === "stats" && (
        <div className="space-y-8">
          {standing && (
            <section className="space-y-3">
              <h2 className="text-lg font-medium text-neutral-300">{season && seasonLabel(season.year)} Record</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                <Stat label="Record" value={`${standing.wins}-${standing.losses}`} />
                <Stat label="PCT" value={standing.winPct?.toFixed(3) ?? "—"} />
                <Stat label="Conf Rank" value={standing.conferenceRank ?? "—"} />
                <Stat label="Div Rank" value={standing.divisionRank ?? "—"} />
                <Stat label="GB" value={standing.gamesBehind ?? "—"} />
                <Stat label="Streak" value={formatStreak(standing.streak)} />
                <Stat label="Home" value={standing.homeRecord ?? "—"} />
                <Stat label="Away" value={standing.awayRecord ?? "—"} />
                <Stat label="Div" value={standing.divRecord ?? "—"} />
                <Stat label="Conf" value={standing.confRecord ?? "—"} />
                <Stat label="Last 10" value={standing.lastTen ?? "—"} />
              </div>
            </section>
          )}

          {(teamSeasonStat || extendedStats) && (
            <section className="space-y-3">
              <h2 className="text-lg font-medium text-neutral-300">Team stats</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
                <Stat label="PPG" value={teamSeasonStat?.pointsPerGame?.toFixed(1) ?? "—"} />
                <Stat label="Opp PPG" value={teamSeasonStat?.oppPointsPerGame?.toFixed(1) ?? "—"} />
                <Stat label="FG%" value={extendedStats?.fieldGoalPct ?? "—"} />
                <Stat label="3P%" value={extendedStats?.threePointPct ?? "—"} />
                <Stat label="FT%" value={extendedStats?.freeThrowPct ?? "—"} />
                <Stat label="RPG" value={extendedStats?.reboundsPerGame ?? "—"} />
                <Stat label="APG" value={extendedStats?.assistsPerGame ?? "—"} />
                <Stat label="TOPG" value={extendedStats?.turnoversPerGame ?? "—"} />
              </div>
            </section>
          )}

          {nbaCupStanding && (
            <section className="space-y-3">
              <h2 className="text-lg font-medium text-neutral-300">NBA Cup</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Group" value={nbaCupStanding.groupName} />
                <Stat label="Seed" value={nbaCupStanding.seed ?? "—"} />
                <Stat label="Record" value={`${nbaCupStanding.wins}-${nbaCupStanding.losses}`} />
                <Stat label="Streak" value={formatStreak(nbaCupStanding.streak)} />
              </div>
            </section>
          )}
        </div>
      )}

      {activeTab === "roster" && (
        <section>
          <h2 className="text-lg font-medium text-neutral-300 mb-3">Roster</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-left text-neutral-500 border-b border-neutral-800">
                  <th className="py-2 pr-3">Player</th>
                  <th className="py-2 pr-3">Pos</th>
                  <th className="py-2 pr-3 text-right">GP</th>
                  <th className="py-2 pr-3 text-right">PPG</th>
                  <th className="py-2 pr-3 text-right">RPG</th>
                  <th className="py-2 pr-3 text-right">APG</th>
                  <th className="py-2 text-right">FG%</th>
                </tr>
              </thead>
              <tbody>
                {rosterByPoints.map((player) => (
                  <tr key={player.id} className="border-b border-neutral-900">
                    <td className="py-2 pr-3">
                      <Link href={`/players/${player.id}`} className="hover:text-neutral-100">
                        <span className="text-neutral-500 mr-1">#{player.jersey ?? "—"}</span>
                        {player.displayName}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-neutral-400">{player.position?.abbreviation ?? "—"}</td>
                    <td className="py-2 pr-3 text-right">{player.seasonStat?.gamesPlayed ?? "—"}</td>
                    <td className="py-2 pr-3 text-right">{player.seasonStat?.pointsPerGame?.toFixed(1) ?? "—"}</td>
                    <td className="py-2 pr-3 text-right">{player.seasonStat?.reboundsPerGame?.toFixed(1) ?? "—"}</td>
                    <td className="py-2 pr-3 text-right">{player.seasonStat?.assistsPerGame?.toFixed(1) ?? "—"}</td>
                    <td className="py-2 text-right">{player.seasonStat?.fieldGoalPct?.toFixed(1) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "schedule" && (
        <section>
          <h2 className="text-lg font-medium text-neutral-300 mb-3">{season && seasonLabel(season.year)} Schedule</h2>
          <div className="space-y-1">
            {orderedSchedule.map((game) => {
              const isHome = game.homeTeamId === team.id;
              const opponent = isHome ? game.awayTeam : game.homeTeam;
              const teamScore = isHome ? game.homeScore : game.awayScore;
              const oppScore = isHome ? game.awayScore : game.homeScore;
              const won = game.status === "FINAL" && teamScore !== null && oppScore !== null && teamScore > oppScore;
              return (
                <Link
                  key={game.id}
                  href={`/games/${game.espnId}`}
                  className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm hover:border-neutral-600"
                >
                  <span className="flex items-center gap-2">
                    {game.status === "FINAL" && (
                      <span className={`font-semibold ${won ? "text-emerald-400" : "text-red-400"}`}>{won ? "W" : "L"}</span>
                    )}
                    {isHome ? "vs" : "@"} {opponent.abbreviation}
                  </span>
                  <span className="text-neutral-400">{game.status === "FINAL" ? `${teamScore}-${oppScore}` : "—"}</span>
                  <span className="text-neutral-500">{new Date(game.date).toLocaleDateString()}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {(activeTab === "depth" || activeTab === "injuries" || activeTab === "transactions") && (
        <p className="text-neutral-500">{TEAM_TABS.find((t) => t.value === activeTab)?.label} — coming soon.</p>
      )}
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
