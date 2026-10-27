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
    fullStat: {
      gamesPlayed: number | null;
      pointsPerGame: number | null;
      reboundsPerGame: number | null;
      assistsPerGame: number | null;
      stealsPerGame: number | null;
      blocksPerGame: number | null;
      turnoversPerGame: number | null;
      fieldGoalPct: number | null;
      threePointPct: number | null;
      freeThrowPct: number | null;
      gamesStarted: number | null;
      minutesPerGame: number | null;
      offReboundsPerGame: number | null;
      defReboundsPerGame: number | null;
      foulsPerGame: number | null;
      assistTurnoverRatio: number | null;
      fgMadePerGame: number | null;
      fgAttPerGame: number | null;
      threeMadePerGame: number | null;
      threeAttPerGame: number | null;
      ftMadePerGame: number | null;
      ftAttPerGame: number | null;
      twoPointPct: number | null;
      twoMadePerGame: number | null;
      twoAttPerGame: number | null;
      scoringEfficiency: number | null;
      shootingEfficiency: number | null;
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
    key: string;
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

interface GameLeader {
  playerId: number;
  displayName: string;
  value: number;
}

interface GameRow {
  id: number;
  espnId: string;
  date: string;
  status: "SCHEDULED" | "LIVE" | "FINAL";
  // Only set for games pulled live from ESPN's team-schedule endpoint to
  // fill in the rest of the season (see getUpcomingGames) — null for
  // anything already ingested into the DB.
  broadcast: string | null;
  // This team's own box-score leaders — only set for FINAL games.
  leaders: { points: GameLeader | null; rebounds: GameLeader | null; assists: GameLeader | null } | null;
  homeScore: number | null;
  awayScore: number | null;
  homeTeamId: number;
  awayTeamId: number;
  homeTeam: { id: number; abbreviation: string; displayName: string; name: string; logoUrl?: string | null };
  awayTeam: { id: number; abbreviation: string; displayName: string; name: string; logoUrl?: string | null };
}

async function fetchTeam(teamId: string, year: number | null, split: string): Promise<TeamDetail> {
  const params = new URLSearchParams();
  if (year) params.set("year", String(year));
  if (split !== "all") params.set("split", split);
  const query = params.toString();
  const res = await fetch(`/api/teams/${teamId}${query ? `?${query}` : ""}`);
  if (!res.ok) throw new Error("Failed to load team");
  return res.json();
}

interface LeagueTeam {
  id: number;
  displayName: string;
  division: { name: string } | null;
}

async function fetchLeagueTeams(): Promise<LeagueTeam[]> {
  const res = await fetch("/api/teams");
  if (!res.ok) throw new Error("Failed to load teams");
  const data = await res.json();
  return data.teams;
}

const SPLIT_MONTHS: { value: string; label: string }[] = [
  { value: "month-10", label: "October" },
  { value: "month-11", label: "November" },
  { value: "month-12", label: "December" },
  { value: "month-1", label: "January" },
  { value: "month-2", label: "February" },
  { value: "month-3", label: "March" },
  { value: "month-4", label: "April" },
  { value: "month-5", label: "May" },
  { value: "month-6", label: "June" },
  { value: "month-7", label: "July" },
];

const SPLIT_DAYS: { value: string; label: string }[] = [
  { value: "day-1", label: "Monday" },
  { value: "day-2", label: "Tuesday" },
  { value: "day-3", label: "Wednesday" },
  { value: "day-4", label: "Thursday" },
  { value: "day-5", label: "Friday" },
  { value: "day-6", label: "Saturday" },
  { value: "day-0", label: "Sunday" },
];

const SPLIT_STATIC_LABELS: Record<string, string> = {
  all: "All Splits",
  home: "Home",
  road: "Road",
  vsDivision: "vs. Division",
  vsConference: "vs. Conference",
  "rest-0": "0 Days Rest",
  "rest-1": "1 Day Rest",
  "rest-2": "2 Days Rest",
  "rest-3plus": "3+ Days Rest",
  preAllStar: "Pre All-Star",
  postAllStar: "Post All-Star",
  wins: "Wins",
  losses: "Losses",
  ...Object.fromEntries(SPLIT_MONTHS.map((m) => [m.value, m.label])),
  ...Object.fromEntries(SPLIT_DAYS.map((d) => [d.value, d.label])),
};

function resolveSplitLabel(split: string, leagueTeams: LeagueTeam[]): string {
  if (split.startsWith("vsTeam-")) {
    const teamId = Number(split.slice("vsTeam-".length));
    const opponent = leagueTeams.find((t) => t.id === teamId);
    return opponent ? `vs. ${opponent.displayName}` : "All Splits";
  }
  return SPLIT_STATIC_LABELS[split] ?? "All Splits";
}

function seasonLabel(year: number): string {
  return `${year - 1}-${String(year).slice(-2)}`;
}

function seasonTypeLabel(type: string): string {
  switch (type) {
    case "REGULAR":
      return "Regular Season";
    case "POSTSEASON":
      return "Playoffs";
    case "PRESEASON":
      return "Preseason";
    default:
      return type;
  }
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
  const [selectedSeasonYear, setSelectedSeasonYear] = useState<number | null>(null);
  const [statsSplit, setStatsSplit] = useState<string>("all");
  const { data, isLoading, error } = useQuery({
    queryKey: ["team", teamId, selectedSeasonYear, statsSplit],
    queryFn: () => fetchTeam(teamId, selectedSeasonYear, statsSplit),
  });
  const { data: leagueTeams } = useQuery({
    queryKey: ["leagueTeams"],
    queryFn: fetchLeagueTeams,
  });

  if (isLoading) return <p className="text-neutral-400">Loading…</p>;
  if (error || !data) return <p className="text-red-400">Failed to load team.</p>;

  const {
    team,
    season,
    availableSeasons,
    standing,
    roster,
    schedule,
    divisionStandings,
    news,
    teamLeaders,
  } = data;
  const accentColor = team.color ? `#${team.color}` : "#525252";

  const rosterByPoints = roster.slice().sort((a, b) => (b.seasonStat?.pointsPerGame ?? -1) - (a.seasonStat?.pointsPerGame ?? -1));
  const visibleLeaders = teamLeaders.filter((l) => l.group === leadersGroup);
  const splitLabel = resolveSplitLabel(statsSplit, leagueTeams ?? []);
  // `schedule` comes back date-ascending from the API; show the most
  // recently played game first, with anything still upcoming (which has no
  // "most recent" ordering yet) following in chronological order.
  const completedGames = schedule.filter((g) => g.status === "FINAL").reverse();
  const upcomingGames = schedule.filter((g) => g.status !== "FINAL");
  // Home tab sidebar: just the next game on deck, then this season's
  // completed games most-recent-first — not the rest of the full schedule.
  const nextGame = upcomingGames[0] ?? null;
  const orderedSchedule = nextGame ? [nextGame, ...completedGames] : completedGames;
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
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr_320px] gap-6">
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
                    className="flex items-center justify-between gap-2 w-full py-3 text-sm hover:text-neutral-100"
                  >
                    <span className="flex items-center gap-1.5 truncate min-w-0">
                      <span className="text-neutral-500 shrink-0">{isHome ? "vs." : "@"}</span>
                      {opponent.logoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={opponent.logoUrl} alt="" className="h-6 w-6 shrink-0" />
                      )}
                      <span className="truncate font-semibold text-neutral-100">{opponent.name}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      {game.status === "FINAL" ? (
                        <>
                          <span className={`font-bold ${won ? "text-emerald-400" : "text-red-400"}`}>{won ? "W" : "L"}</span>{" "}
                          <span className="font-semibold text-neutral-100">
                            {highScore}-{lowScore}
                          </span>
                        </>
                      ) : (
                        <span className="flex flex-col items-end leading-tight">
                          <span className="font-semibold text-neutral-100">
                            {new Date(game.date).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}
                          </span>
                          <span className="font-semibold text-neutral-100">
                            {new Date(game.date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                          </span>
                        </span>
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

            <TeamLeadersCard
              season={season}
              visibleLeaders={visibleLeaders}
              leadersGroup={leadersGroup}
              setLeadersGroup={setLeadersGroup}
              accentColor={accentColor}
              onViewAll={() => setActiveTab("stats")}
            />
          </aside>
        </div>
      )}

      {activeTab === "stats" && (
        <div className="space-y-8">
          <div className="flex flex-wrap gap-3">
            <select
              value={season?.id ?? ""}
              onChange={(e) => {
                const picked = availableSeasons.find((s) => s.id === Number(e.target.value));
                if (picked) setSelectedSeasonYear(picked.year);
              }}
              className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-600"
            >
              {availableSeasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {seasonLabel(s.year)} {seasonTypeLabel(s.type)}
                </option>
              ))}
            </select>
            <select
              value={statsSplit}
              onChange={(e) => setStatsSplit(e.target.value)}
              className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-600"
            >
              <optgroup label="Season">
                <option value="all">All Splits</option>
              </optgroup>
              <optgroup label="Location">
                <option value="home">Home</option>
                <option value="road">Road</option>
              </optgroup>
              <optgroup label="vs">
                <option value="vsDivision">vs. Division</option>
                <option value="vsConference">vs. Conference</option>
              </optgroup>
              <optgroup label="rest">
                <option value="rest-0">0 Days Rest</option>
                <option value="rest-1">1 Day Rest</option>
                <option value="rest-2">2 Days Rest</option>
                <option value="rest-3plus">3+ Days Rest</option>
              </optgroup>
              <optgroup label="By Month">
                {SPLIT_MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Season Half">
                <option value="preAllStar">Pre All-Star</option>
                <option value="postAllStar">Post All-Star</option>
              </optgroup>
              <optgroup label="Situation">
                <option value="wins">Wins</option>
                <option value="losses">Losses</option>
              </optgroup>
              <optgroup label="day">
                {SPLIT_DAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </optgroup>
              {Object.entries(
                (leagueTeams ?? [])
                  .filter((t) => t.id !== team.id && t.division)
                  .reduce<Record<string, LeagueTeam[]>>((acc, t) => {
                    const name = t.division!.name;
                    (acc[name] ??= []).push(t);
                    return acc;
                  }, {}),
              ).map(([divisionName, teams]) => (
                <optgroup key={divisionName} label={`vs ${divisionName}`}>
                  {teams
                    .slice()
                    .sort((a, b) => a.displayName.localeCompare(b.displayName))
                    .map((t) => (
                      <option key={t.id} value={`vsTeam-${t.id}`}>
                        {t.displayName}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>

          <TeamLeadersRow teamLeaders={teamLeaders} />

          <PlayerStatsTable roster={roster} splitLabel={splitLabel} />
          <ShootingStatsTable roster={roster} splitLabel={splitLabel} />

          <StatsGlossary />
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
        <ScheduleTab
          team={team}
          season={season}
          availableSeasons={availableSeasons}
          schedule={schedule}
          onSeasonChange={(year) => setSelectedSeasonYear(year)}
        />
      )}

      {(activeTab === "depth" || activeTab === "injuries" || activeTab === "transactions") && (
        <p className="text-neutral-500">{TEAM_TABS.find((t) => t.value === activeTab)?.label} — coming soon.</p>
      )}
    </div>
  );
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

type ScheduleRow = {
  game: GameRow;
  isHome: boolean;
  opponent: GameRow["homeTeam"];
  teamScore: number | null;
  oppScore: number | null;
  won: boolean;
  record: string | null;
};

function groupByMonth(rows: ScheduleRow[]): [string, ScheduleRow[]][] {
  const groups = new Map<string, ScheduleRow[]>();
  for (const row of rows) {
    const key = monthLabel(new Date(row.game.date));
    const existing = groups.get(key);
    if (existing) existing.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.entries()];
}

// "Zach LaVine" -> "Z. LaVine" — ESPN's own box-score-leader shorthand.
function shortName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length < 2) return displayName;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

function GameLeaderCell({ leader }: { leader: GameLeader | null }) {
  if (!leader) return <span className="text-neutral-500">—</span>;
  return (
    <Link href={`/players/${leader.playerId}`} className="hover:text-neutral-100">
      <span className="text-neutral-400">{shortName(leader.displayName)}</span> <span className="font-medium">{leader.value}</span>
    </Link>
  );
}

function ScheduleTab({
  team,
  season,
  availableSeasons,
  schedule,
  onSeasonChange,
}: {
  team: TeamDetail["team"];
  season: SeasonInfo | null;
  availableSeasons: SeasonInfo[];
  schedule: GameRow[];
  onSeasonChange: (year: number) => void;
}) {
  // `schedule` comes back date-ascending — walk it in order to build a
  // running W-L record alongside each completed game, the way ESPN's
  // schedule does.
  const rows = schedule.reduce<ScheduleRow[]>((acc, game) => {
    const isHome = game.homeTeamId === team.id;
    const opponent = isHome ? game.awayTeam : game.homeTeam;
    const teamScore = isHome ? game.homeScore : game.awayScore;
    const oppScore = isHome ? game.awayScore : game.homeScore;
    const won = game.status === "FINAL" && teamScore !== null && oppScore !== null && teamScore > oppScore;
    const prev = acc[acc.length - 1];
    const [prevWins, prevLosses] = prev?.record ? prev.record.split("-").map(Number) : [0, 0];
    const record = game.status === "FINAL" ? `${prevWins + (won ? 1 : 0)}-${prevLosses + (won ? 0 : 1)}` : null;
    acc.push({ game, isHome, opponent, teamScore, oppScore, won, record });
    return acc;
  }, []);

  const completedRows = rows.filter((r) => r.game.status === "FINAL");
  const upcomingRows = rows.filter((r) => r.game.status !== "FINAL");

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-neutral-300">{season && seasonLabel(season.year)} Schedule</h2>
        <select
          value={season?.id ?? ""}
          onChange={(e) => {
            const picked = availableSeasons.find((s) => s.id === Number(e.target.value));
            if (picked) onSeasonChange(picked.year);
          }}
          className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-600"
        >
          {availableSeasons.map((s) => (
            <option key={s.id} value={s.id}>
              {seasonLabel(s.year)} {seasonTypeLabel(s.type)}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 && <p className="text-neutral-500 text-sm">No games found.</p>}

      {completedRows.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-neutral-500">{season && seasonTypeLabel(season.type)}</p>
          {groupByMonth(completedRows).map(([label, groupRows]) => (
            <div key={label} className="space-y-1">
              <p className="text-xs font-semibold text-neutral-500 pt-2">{label}</p>
              <div className="overflow-x-auto rounded-lg border border-neutral-800">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="text-left text-neutral-500 border-b border-neutral-800">
                      <th className="py-2 pl-3 pr-3">Date</th>
                      <th className="py-2 pr-3">Opponent</th>
                      <th className="py-2 pr-3 text-right">Result</th>
                      <th className="py-2 pr-3 text-right">W-L</th>
                      <th className="py-2 pr-3">Hi Points</th>
                      <th className="py-2 pr-3">Hi Rebounds</th>
                      <th className="py-2 pr-3">Hi Assists</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupRows.map(({ game, isHome, opponent, teamScore, oppScore, won, record }) => {
                      const date = new Date(game.date);
                      return (
                        <tr key={game.id} className="border-b border-neutral-900 last:border-0">
                          <td className="py-2 pl-3 pr-3 text-neutral-400">
                            {date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                          </td>
                          <td className="py-2 pr-3">
                            <Link href={`/games/${game.espnId}`} className="flex items-center gap-2 hover:text-neutral-100">
                              <span className="text-neutral-500">{isHome ? "vs" : "@"}</span>
                              {opponent.logoUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={opponent.logoUrl} alt="" className="h-5 w-5" />
                              )}
                              <span>{opponent.displayName}</span>
                            </Link>
                          </td>
                          <td className="py-2 pr-3 text-right">
                            <Link href={`/games/${game.espnId}`} className="hover:text-neutral-100">
                              <span className={`font-semibold ${won ? "text-emerald-400" : "text-red-400"}`}>
                                {won ? "W" : "L"}
                              </span>{" "}
                              <span className="text-neutral-400">
                                {teamScore}-{oppScore}
                              </span>
                            </Link>
                          </td>
                          <td className="py-2 pr-3 text-right text-neutral-500">{record ?? "—"}</td>
                          <td className="py-2 pr-3">
                            <GameLeaderCell leader={game.leaders?.points ?? null} />
                          </td>
                          <td className="py-2 pr-3">
                            <GameLeaderCell leader={game.leaders?.rebounds ?? null} />
                          </td>
                          <td className="py-2 pr-3">
                            <GameLeaderCell leader={game.leaders?.assists ?? null} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {upcomingRows.length > 0 && (
        <div className="space-y-3">
          {groupByMonth(upcomingRows).map(([label, groupRows]) => (
            <div key={label} className="space-y-1">
              <p className="text-xs font-semibold text-neutral-500 pt-2">{label}</p>
              <div className="overflow-x-auto rounded-lg border border-neutral-800">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="text-left text-neutral-500 border-b border-neutral-800">
                      <th className="py-2 pl-3 pr-3">Date</th>
                      <th className="py-2 pr-3">Opponent</th>
                      <th className="py-2 pr-3 text-right">Time</th>
                      <th className="py-2 pr-3 text-center">TV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupRows.map(({ game, isHome, opponent }) => {
                      const date = new Date(game.date);
                      return (
                        <tr key={game.id} className="border-b border-neutral-900 last:border-0">
                          <td className="py-2 pl-3 pr-3 text-neutral-400">
                            {date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                          </td>
                          <td className="py-2 pr-3">
                            <Link href={`/games/${game.espnId}`} className="flex items-center gap-2 hover:text-neutral-100">
                              <span className="text-neutral-500">{isHome ? "vs" : "@"}</span>
                              {opponent.logoUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={opponent.logoUrl} alt="" className="h-5 w-5" />
                              )}
                              <span>{opponent.displayName}</span>
                            </Link>
                          </td>
                          <td className="py-2 pr-3 text-right">
                            <Link href={`/games/${game.espnId}`} className="text-neutral-500 hover:text-neutral-100">
                              {game.status === "LIVE"
                                ? "Live"
                                : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                            </Link>
                          </td>
                          <td className="py-2 pr-3 text-center text-neutral-500">{game.broadcast ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const LEADER_ROW_CARDS: { key: string; label: string }[] = [
  { key: "pointsPerGame", label: "Points" },
  { key: "reboundsPerGame", label: "Rebounds" },
  { key: "assistsPerGame", label: "Assists" },
  { key: "stealsPerGame", label: "Steals" },
  { key: "blocksPerGame", label: "Blocks" },
];

function TeamLeadersRow({ teamLeaders }: { teamLeaders: TeamDetail["teamLeaders"] }) {
  const byKey = new Map(teamLeaders.map((l) => [l.key, l]));

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium text-neutral-300">Team Leaders</h2>
      <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-neutral-800 rounded-lg border border-neutral-800 overflow-hidden">
        {LEADER_ROW_CARDS.map(({ key, label }) => {
          const entry = byKey.get(key);
          return (
            <div key={key} className="p-4 space-y-2">
              <p className="text-sm font-medium text-neutral-300">{label}</p>
              {entry?.player ? (
                <Link href={`/players/${entry.player.id}`} className="flex items-start gap-3 hover:text-neutral-100">
                  {entry.player.headshotUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.player.headshotUrl}
                      alt=""
                      className="h-14 w-14 rounded-full bg-neutral-800 object-cover shrink-0"
                    />
                  )}
                  <span className="min-w-0 space-y-1">
                    <span className="block text-sm truncate">
                      {entry.player.displayName}{" "}
                      <span className="text-neutral-500">{entry.player.position?.abbreviation}</span>
                    </span>
                    <span className="block text-2xl font-semibold">{entry.displayValue ?? "—"}</span>
                  </span>
                </Link>
              ) : (
                <p className="text-neutral-500 text-sm">—</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TeamLeadersCard({
  season,
  visibleLeaders,
  leadersGroup,
  setLeadersGroup,
  accentColor,
  onViewAll,
}: {
  season: SeasonInfo | null;
  visibleLeaders: TeamDetail["teamLeaders"];
  leadersGroup: LeadersGroup;
  setLeadersGroup: (group: LeadersGroup) => void;
  accentColor: string;
  onViewAll?: () => void;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 p-4 space-y-3">
      <h2 className="text-lg font-medium text-neutral-300">{season ? seasonLabel(season.year) : ""} Team Leaders</h2>
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
                    <p className="text-sm truncate">
                      {player.displayName}{" "}
                      <span className="text-neutral-500">
                        {player.position?.abbreviation} #{player.jersey ?? "—"}
                      </span>
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
      {onViewAll && (
        <button onClick={onViewAll} className="block w-full text-center text-sm text-neutral-400 hover:text-neutral-100">
          Full Team Statistics
        </button>
      )}
    </div>
  );
}

type RosterRow = TeamDetail["roster"][number];

function fmt1(value: number | null | undefined): string {
  return value == null ? "—" : value.toFixed(1);
}

function sum(values: (number | null | undefined)[]): number {
  return values.reduce((acc: number, v) => acc + (v ?? 0), 0);
}

function ratioPct(made: number, attempted: number): number | null {
  return attempted > 0 ? (made / attempted) * 100 : null;
}

function statRows(roster: RosterRow[]): RosterRow[] {
  return roster.filter((p) => p.fullStat && (p.fullStat.gamesPlayed ?? 0) > 0);
}

type SortDir = "asc" | "desc";

interface StatColumn {
  key: string;
  label: string;
  value: (row: RosterRow) => number | string | null;
}

function useSortableRows(rows: RosterRow[], columns: StatColumn[], initialKey: string) {
  const [sortKey, setSortKey] = useState(initialKey);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const column = columns.find((c) => c.key === sortKey) ?? columns[0];
  const sorted = rows.slice().sort((a, b) => {
    const av = column.value(a);
    const bv = column.value(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === "string" || typeof bv === "string" ? String(av).localeCompare(String(bv)) : av - (bv as number);
    return sortDir === "asc" ? cmp : -cmp;
  });

  function toggleSort(key: string) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "name" ? "asc" : "desc");
  }

  return { sorted, sortKey, sortDir, toggleSort };
}

function SortableTh({
  column,
  sortKey,
  sortDir,
  onSort,
  align = "right",
}: {
  column: StatColumn;
  sortKey: string;
  sortDir: SortDir;
  onSort: (key: string) => void;
  align?: "left" | "right";
}) {
  const active = column.key === sortKey;
  return (
    <th
      className={`py-2 pr-3 cursor-pointer select-none hover:text-neutral-200 ${align === "right" ? "text-right" : "text-left"}`}
      onClick={() => onSort(column.key)}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {column.label}
        <span className="text-[10px] text-neutral-600 w-2 inline-block">{active ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
      </span>
    </th>
  );
}

const PLAYER_STAT_COLUMNS: StatColumn[] = [
  { key: "name", label: "Name", value: (p) => p.displayName },
  { key: "gp", label: "GP", value: (p) => p.fullStat?.gamesPlayed ?? null },
  { key: "gs", label: "GS", value: (p) => p.fullStat?.gamesStarted ?? null },
  { key: "min", label: "MIN", value: (p) => p.fullStat?.minutesPerGame ?? null },
  { key: "pts", label: "PTS", value: (p) => p.fullStat?.pointsPerGame ?? null },
  { key: "or", label: "OR", value: (p) => p.fullStat?.offReboundsPerGame ?? null },
  { key: "dr", label: "DR", value: (p) => p.fullStat?.defReboundsPerGame ?? null },
  { key: "reb", label: "REB", value: (p) => p.fullStat?.reboundsPerGame ?? null },
  { key: "ast", label: "AST", value: (p) => p.fullStat?.assistsPerGame ?? null },
  { key: "stl", label: "STL", value: (p) => p.fullStat?.stealsPerGame ?? null },
  { key: "blk", label: "BLK", value: (p) => p.fullStat?.blocksPerGame ?? null },
  { key: "to", label: "TO", value: (p) => p.fullStat?.turnoversPerGame ?? null },
  { key: "pf", label: "PF", value: (p) => p.fullStat?.foulsPerGame ?? null },
  { key: "astto", label: "AST/TO", value: (p) => p.fullStat?.assistTurnoverRatio ?? null },
];

function PlayerStatsTable({ roster, splitLabel }: { roster: RosterRow[]; splitLabel: string }) {
  const rows = statRows(roster);
  const { sorted, sortKey, sortDir, toggleSort } = useSortableRows(rows, PLAYER_STAT_COLUMNS, "pts");
  const totalGP = rows.reduce((max, p) => Math.max(max, p.fullStat?.gamesPlayed ?? 0), 0);
  const totalAst = sum(rows.map((p) => p.fullStat?.assistsPerGame));
  const totalTo = sum(rows.map((p) => p.fullStat?.turnoversPerGame));
  const totalAstTo = totalTo > 0 ? totalAst / totalTo : null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium text-neutral-300">Player Stats - {splitLabel}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-left text-neutral-500 border-b border-neutral-800">
              {PLAYER_STAT_COLUMNS.map((col) => (
                <SortableTh
                  key={col.key}
                  column={col}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  align={col.key === "name" ? "left" : "right"}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} className="border-b border-neutral-900">
                <td className="py-2 pr-3">
                  <Link href={`/players/${p.id}`} className="hover:text-neutral-100">
                    {p.displayName} <span className="text-neutral-500">{p.position?.abbreviation ?? "—"}</span>
                  </Link>
                </td>
                <td className="py-2 pr-3 text-right">{p.fullStat?.gamesPlayed ?? "—"}</td>
                <td className="py-2 pr-3 text-right">{p.fullStat?.gamesStarted ?? "—"}</td>
                <td className="py-2 pr-3 text-right">{fmt1(p.fullStat?.minutesPerGame)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(p.fullStat?.pointsPerGame)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(p.fullStat?.offReboundsPerGame)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(p.fullStat?.defReboundsPerGame)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(p.fullStat?.reboundsPerGame)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(p.fullStat?.assistsPerGame)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(p.fullStat?.stealsPerGame)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(p.fullStat?.blocksPerGame)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(p.fullStat?.turnoversPerGame)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(p.fullStat?.foulsPerGame)}</td>
                <td className="py-2 text-right">{fmt1(p.fullStat?.assistTurnoverRatio)}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="font-semibold text-neutral-200">
                <td className="py-2 pr-3">Total</td>
                <td className="py-2 pr-3 text-right">{totalGP}</td>
                <td className="py-2 pr-3 text-right"></td>
                <td className="py-2 pr-3 text-right"></td>
                <td className="py-2 pr-3 text-right">{fmt1(sum(rows.map((p) => p.fullStat?.pointsPerGame)))}</td>
                <td className="py-2 pr-3 text-right">{fmt1(sum(rows.map((p) => p.fullStat?.offReboundsPerGame)))}</td>
                <td className="py-2 pr-3 text-right">{fmt1(sum(rows.map((p) => p.fullStat?.defReboundsPerGame)))}</td>
                <td className="py-2 pr-3 text-right">{fmt1(sum(rows.map((p) => p.fullStat?.reboundsPerGame)))}</td>
                <td className="py-2 pr-3 text-right">{fmt1(totalAst)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(sum(rows.map((p) => p.fullStat?.stealsPerGame)))}</td>
                <td className="py-2 pr-3 text-right">{fmt1(sum(rows.map((p) => p.fullStat?.blocksPerGame)))}</td>
                <td className="py-2 pr-3 text-right">{fmt1(totalTo)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(sum(rows.map((p) => p.fullStat?.foulsPerGame)))}</td>
                <td className="py-2 text-right">{fmt1(totalAstTo)}</td>
              </tr>
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={14} className="py-3 text-neutral-500">
                  No stats available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const SHOOTING_STAT_COLUMNS: StatColumn[] = [
  { key: "name", label: "Name", value: (p) => p.displayName },
  { key: "fgm", label: "FGM", value: (p) => p.fullStat?.fgMadePerGame ?? null },
  { key: "fga", label: "FGA", value: (p) => p.fullStat?.fgAttPerGame ?? null },
  { key: "fgpct", label: "FG%", value: (p) => p.fullStat?.fieldGoalPct ?? null },
  { key: "3pm", label: "3PM", value: (p) => p.fullStat?.threeMadePerGame ?? null },
  { key: "3pa", label: "3PA", value: (p) => p.fullStat?.threeAttPerGame ?? null },
  { key: "3ppct", label: "3P%", value: (p) => p.fullStat?.threePointPct ?? null },
  { key: "ftm", label: "FTM", value: (p) => p.fullStat?.ftMadePerGame ?? null },
  { key: "fta", label: "FTA", value: (p) => p.fullStat?.ftAttPerGame ?? null },
  { key: "ftpct", label: "FT%", value: (p) => p.fullStat?.freeThrowPct ?? null },
  { key: "2pm", label: "2PM", value: (p) => p.fullStat?.twoMadePerGame ?? null },
  { key: "2pa", label: "2PA", value: (p) => p.fullStat?.twoAttPerGame ?? null },
  { key: "2ppct", label: "2P%", value: (p) => p.fullStat?.twoPointPct ?? null },
  { key: "sceff", label: "SC-EFF", value: (p) => p.fullStat?.scoringEfficiency ?? null },
  { key: "sheff", label: "SH-EFF", value: (p) => p.fullStat?.shootingEfficiency ?? null },
];

function ShootingStatsTable({ roster, splitLabel }: { roster: RosterRow[]; splitLabel: string }) {
  const rows = statRows(roster);
  const { sorted, sortKey, sortDir, toggleSort } = useSortableRows(rows, SHOOTING_STAT_COLUMNS, "fgm");
  const totalFgm = sum(rows.map((p) => p.fullStat?.fgMadePerGame));
  const totalFga = sum(rows.map((p) => p.fullStat?.fgAttPerGame));
  const total3m = sum(rows.map((p) => p.fullStat?.threeMadePerGame));
  const total3a = sum(rows.map((p) => p.fullStat?.threeAttPerGame));
  const totalFtm = sum(rows.map((p) => p.fullStat?.ftMadePerGame));
  const totalFta = sum(rows.map((p) => p.fullStat?.ftAttPerGame));
  const total2m = sum(rows.map((p) => p.fullStat?.twoMadePerGame));
  const total2a = sum(rows.map((p) => p.fullStat?.twoAttPerGame));

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium text-neutral-300">Shooting Stats - {splitLabel}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-left text-neutral-500 border-b border-neutral-800">
              {SHOOTING_STAT_COLUMNS.map((col) => (
                <SortableTh
                  key={col.key}
                  column={col}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  align={col.key === "name" ? "left" : "right"}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} className="border-b border-neutral-900">
                <td className="py-2 pr-3">
                  <Link href={`/players/${p.id}`} className="hover:text-neutral-100">
                    {p.displayName} <span className="text-neutral-500">{p.position?.abbreviation ?? "—"}</span>
                  </Link>
                </td>
                <td className="py-2 pr-3 text-right">{fmt1(p.fullStat?.fgMadePerGame)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(p.fullStat?.fgAttPerGame)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(p.fullStat?.fieldGoalPct)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(p.fullStat?.threeMadePerGame)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(p.fullStat?.threeAttPerGame)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(p.fullStat?.threePointPct)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(p.fullStat?.ftMadePerGame)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(p.fullStat?.ftAttPerGame)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(p.fullStat?.freeThrowPct)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(p.fullStat?.twoMadePerGame)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(p.fullStat?.twoAttPerGame)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(p.fullStat?.twoPointPct)}</td>
                <td className="py-2 pr-3 text-right">{p.fullStat?.scoringEfficiency?.toFixed(3) ?? "—"}</td>
                <td className="py-2 text-right">{p.fullStat?.shootingEfficiency?.toFixed(2) ?? "—"}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="font-semibold text-neutral-200">
                <td className="py-2 pr-3">Total</td>
                <td className="py-2 pr-3 text-right">{fmt1(totalFgm)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(totalFga)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(ratioPct(totalFgm, totalFga))}</td>
                <td className="py-2 pr-3 text-right">{fmt1(total3m)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(total3a)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(ratioPct(total3m, total3a))}</td>
                <td className="py-2 pr-3 text-right">{fmt1(totalFtm)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(totalFta)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(ratioPct(totalFtm, totalFta))}</td>
                <td className="py-2 pr-3 text-right">{fmt1(total2m)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(total2a)}</td>
                <td className="py-2 pr-3 text-right">{fmt1(ratioPct(total2m, total2a))}</td>
                <td className="py-2 pr-3 text-right">—</td>
                <td className="py-2 text-right">—</td>
              </tr>
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={14} className="py-3 text-neutral-500">
                  No stats available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const STATS_GLOSSARY: { term: string; definition: string }[] = [
  { term: "GP", definition: "Games Played" },
  { term: "GS", definition: "Games Started" },
  { term: "MIN", definition: "Minutes Per Game" },
  { term: "PTS", definition: "Points Per Game" },
  { term: "OR", definition: "Offensive Rebounds Per Game" },
  { term: "DR", definition: "Defensive Rebounds Per Game" },
  { term: "REB", definition: "Rebounds Per Game" },
  { term: "AST", definition: "Assists Per Game" },
  { term: "STL", definition: "Steals Per Game" },
  { term: "BLK", definition: "Blocks Per Game" },
  { term: "TO", definition: "Turnovers Per Game" },
  { term: "PF", definition: "Personal Fouls Per Game" },
  { term: "AST/TO", definition: "Assist to Turnover Ratio" },
  { term: "FGM", definition: "Field Goals Made Per Game" },
  { term: "FGA", definition: "Field Goals Attempted Per Game" },
  { term: "FG%", definition: "Field Goal Percentage" },
  { term: "3PM", definition: "3-Point Field Goals Made Per Game" },
  { term: "3PA", definition: "3-Point Field Goals Attempted Per Game" },
  { term: "3P%", definition: "3-Point Field Goal Percentage" },
  { term: "FTM", definition: "Free Throws Made Per Game" },
  { term: "FTA", definition: "Free Throws Attempted Per Game" },
  { term: "FT%", definition: "Free Throw Percentage" },
  { term: "2PM", definition: "2-Point Field Goals Made Per Game" },
  { term: "2PA", definition: "2-Point Field Goals Attempted Per Game" },
  { term: "2P%", definition: "2-Point Field Goal Percentage" },
  { term: "SC-EFF", definition: "Scoring Efficiency" },
  { term: "SH-EFF", definition: "Shooting Efficiency" },
];

function StatsGlossary() {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium text-neutral-300">Glossary</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
        {STATS_GLOSSARY.map(({ term, definition }) => (
          <p key={term}>
            <span className="text-neutral-200 font-medium">{term}</span>{" "}
            <span className="text-neutral-500">— {definition}</span>
          </p>
        ))}
      </div>
    </section>
  );
}
