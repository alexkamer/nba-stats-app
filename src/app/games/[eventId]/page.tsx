"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useState } from "react";
import { TabPager, useTabQueryParam } from "@/components/TabPager";

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

interface DbOdds {
  provider: string;
  spread: number | null;
  overUnder: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
  favoriteTeamId: number | null;
}

interface LiveOdds {
  provider: string;
  spread: number | null;
  overUnder: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
  favoriteSide: "home" | "away" | null;
}

// Period scores and W-L records are never persisted (SPEC.md Sec 6 has no
// linescore/record columns) — the API pulls these live from ESPN for both
// the DB- and live-sourced game shapes, so this piece of the view model is
// shared rather than duplicated per-source.
interface HeaderExtras {
  statusDetail: string;
  home: { record: string | null; splitRecord: string | null; linescores: number[] };
  away: { record: string | null; splitRecord: string | null; linescores: number[] };
  gameInfo: GameInfo;
  seasonSeries: SeasonSeries | null;
}

interface GameInfo {
  venue: { name: string; city: string | null; state: string | null; imageUrl: string | null } | null;
  attendance: number | null;
  officials: { name: string; position: string }[];
  broadcasts: string[];
}

interface SeasonSeries {
  summary: string;
  seriesScore: string | null;
  events: {
    espnId: string;
    date: string;
    statusDetail: string;
    completed: boolean;
    home: { abbreviation: string; score: number | null; winner: boolean };
    away: { abbreviation: string; score: number | null; winner: boolean };
    broadcasts: string[];
  }[];
}

interface DbGame {
  date: string;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: { id: number; displayName: string; abbreviation: string; logoUrl: string | null; color: string | null };
  awayTeam: { id: number; displayName: string; abbreviation: string; logoUrl: string | null; color: string | null };
  venue: { name: string } | null;
  teamGameStats: (TeamStatFields & { teamId: number; team: { abbreviation: string } })[];
  playerGameStats: (PlayerStatFields & {
    id: number;
    teamId: number;
    player: { id: number; displayName: string; headshotUrl: string | null; jersey: string | null };
  })[];
  plays: PlayFields[];
  odds: DbOdds | null;
  headerExtras: HeaderExtras | null;
}

interface LiveGame {
  date: string;
  statusDetail: string;
  home: { espnId: string; abbreviation: string; displayName: string; score: number | null; logoUrl: string | null; color: string | null };
  away: { espnId: string; abbreviation: string; displayName: string; score: number | null; logoUrl: string | null; color: string | null };
  teamGameStats: (TeamStatFields & { teamEspnId: string })[];
  playerGameStats: (PlayerStatFields & {
    teamEspnId: string;
    playerDisplayName: string;
    headshotUrl: string | null;
    jersey: string | null;
  })[];
  plays: PlayFields[];
  odds: LiveOdds | null;
  headerExtras: HeaderExtras;
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
  offensiveRebounds: number | null;
  defensiveRebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
  fgMade: number | null;
  fgAtt: number | null;
  ftMade: number | null;
  ftAtt: number | null;
}

interface PlayerLeaderRow extends PlayerStatFields {
  key: number;
  linkId: number | null;
  name: string;
  headshotUrl: string | null;
  jersey: string | null;
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

type TabKey = "gamecast" | "recap" | "boxscore" | "playbyplay" | "teamstats";

const GAME_TABS: { value: TabKey; label: string }[] = [
  { value: "gamecast", label: "Gamecast" },
  { value: "recap", label: "Recap" },
  { value: "boxscore", label: "Box Score" },
  { value: "playbyplay", label: "Play-by-Play" },
  { value: "teamstats", label: "Team Stats" },
];

function formatSigned(value: number | null): string {
  if (value === null) return "";
  return value > 0 ? `+${value}` : String(value);
}

function toHexColor(color: string | null): string | null {
  if (!color) return null;
  return color.startsWith("#") ? color : `#${color}`;
}

// Periods beyond the 4th are overtime — ESPN's linescores array has no
// period labels of its own, just one entry per period played.
function periodLabel(index: number): string {
  if (index < 4) return String(index + 1);
  return index === 4 ? "OT" : `OT${index - 3}`;
}

function formatGameDateTime(dateIso: string): string {
  const date = new Date(dateIso);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const day = date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  return `${time}, ${day}`;
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
  const [activeTab, setActiveTab] = useTabQueryParam<TabKey>("boxscore");

  if (isLoading) return <p className="text-neutral-400">Loading…</p>;
  if (error || !data) return <p className="text-red-400">Game not found.</p>;

  const { game, source } = data;

  // Normalize both shapes into one view model.
  const home =
    source === "db"
      ? {
          linkId: (game as DbGame).homeTeam.id,
          abbreviation: (game as DbGame).homeTeam.abbreviation,
          displayName: (game as DbGame).homeTeam.displayName,
          score: (game as DbGame).homeScore,
          logoUrl: (game as DbGame).homeTeam.logoUrl,
          color: toHexColor((game as DbGame).homeTeam.color),
        }
      : {
          linkId: null,
          abbreviation: (game as LiveGame).home.abbreviation,
          displayName: (game as LiveGame).home.displayName,
          score: (game as LiveGame).home.score,
          logoUrl: (game as LiveGame).home.logoUrl,
          color: toHexColor((game as LiveGame).home.color),
        };
  const away =
    source === "db"
      ? {
          linkId: (game as DbGame).awayTeam.id,
          abbreviation: (game as DbGame).awayTeam.abbreviation,
          displayName: (game as DbGame).awayTeam.displayName,
          score: (game as DbGame).awayScore,
          logoUrl: (game as DbGame).awayTeam.logoUrl,
          color: toHexColor((game as DbGame).awayTeam.color),
        }
      : {
          linkId: null,
          abbreviation: (game as LiveGame).away.abbreviation,
          displayName: (game as LiveGame).away.displayName,
          score: (game as LiveGame).away.score,
          logoUrl: (game as LiveGame).away.logoUrl,
          color: toHexColor((game as LiveGame).away.color),
        };

  const headerExtras = (game as DbGame | LiveGame).headerExtras;
  const statusDetail = headerExtras?.statusDetail ?? (source === "live" ? (game as LiveGame).statusDetail : null);

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
        .map((p) => ({
          key: p.id,
          linkId: p.player.id,
          name: p.player.displayName,
          headshotUrl: p.player.headshotUrl,
          jersey: p.player.jersey,
          ...p,
        }))
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

  // Normalize odds too — DB shape knows the favorite by internal team id,
  // live shape only knows home/away side (no FK ids for an unpersisted game).
  const rawOdds = (game as DbGame | LiveGame).odds;
  const odds = rawOdds
    ? {
        provider: rawOdds.provider,
        overUnder: rawOdds.overUnder,
        homeSpread: rawOdds.spread,
        awaySpread: rawOdds.spread !== null ? -rawOdds.spread : null,
        homeMoneyline: rawOdds.homeMoneyline,
        awayMoneyline: rawOdds.awayMoneyline,
        homeIsFavorite:
          source === "db" ? (rawOdds as DbOdds).favoriteTeamId === home.linkId : (rawOdds as LiveOdds).favoriteSide === "home",
      }
    : null;

  const plays = game.plays.map((p, i) => ({ ...p, key: p.id ?? i }));
  const visiblePlays = showAllPlays ? plays : plays.slice(-20);

  const awayPlayerRows = playerRowsByTeam(away.abbreviation, away.linkId);
  const homePlayerRows = playerRowsByTeam(home.abbreviation, home.linkId);
  const awayTeamStats = teamRows.find((r) => r.abbreviation === away.abbreviation) ?? null;
  const homeTeamStats = teamRows.find((r) => r.abbreviation === home.abbreviation) ?? null;

  return (
    <div className="space-y-8">
      <ScoreboardHeader
        away={away}
        home={home}
        statusDetail={statusDetail}
        linescores={headerExtras}
        tabs={GAME_TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {activeTab === "gamecast" && (
        // Full-bleed, same trick as ScoreboardHeader: this grid needs the
        // whole viewport width for its 3-column layout, not just <main>'s
        // centered max-w-6xl column.
        <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr_340px]">
            <div className="space-y-6">
              <GameLeaders away={away} home={home} awayPlayerRows={awayPlayerRows} homePlayerRows={homePlayerRows} />
              <TeamStatsCard away={away} home={home} awayStats={awayTeamStats} homeStats={homeTeamStats} />
              {headerExtras?.gameInfo && <GameInformationCard date={game.date} gameInfo={headerExtras.gameInfo} />}
            </div>
            <div />
            <div className="space-y-6">
              <OddsPanel away={away} home={home} odds={odds} />
              {headerExtras?.seasonSeries && (
                <MatchupsCard
                  away={away}
                  home={home}
                  awayRecord={headerExtras.away.record}
                  homeRecord={headerExtras.home.record}
                  seasonSeries={headerExtras.seasonSeries}
                />
              )}
            </div>
          </div>
        </div>
      )}
      {activeTab === "recap" && <p className="text-neutral-500 text-sm">Coming soon.</p>}
      {activeTab === "teamstats" && <p className="text-neutral-500 text-sm">Coming soon.</p>}

      {activeTab === "boxscore" && (
        <>
          {odds && (
            <section>
              <h2 className="text-lg font-medium text-neutral-300 mb-3">
                Odds <span className="text-neutral-500 text-sm font-normal">({odds.provider})</span>
              </h2>
              <table className="w-full text-sm max-w-md border-collapse">
                <thead>
                  <tr className="text-left text-neutral-500">
                    <th className="py-2 pr-2 border-b border-neutral-700">Team</th>
                    <th className="py-2 pr-2 text-right border-b border-neutral-700">Spread</th>
                    <th className="py-2 text-right border-b border-neutral-700">Moneyline</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={`border-b border-neutral-900 ${!odds.homeIsFavorite ? "font-semibold" : ""}`}>
                    <td className="py-2 pr-2">{away.abbreviation}</td>
                    <td className="py-2 pr-2 text-right">{formatSigned(odds.awaySpread)}</td>
                    <td className="py-2 text-right">{formatSigned(odds.awayMoneyline)}</td>
                  </tr>
                  <tr className={odds.homeIsFavorite ? "font-semibold" : ""}>
                    <td className="py-2 pr-2">{home.abbreviation}</td>
                    <td className="py-2 pr-2 text-right">{formatSigned(odds.homeSpread)}</td>
                    <td className="py-2 text-right">{formatSigned(odds.homeMoneyline)}</td>
                  </tr>
                </tbody>
              </table>
              {odds.overUnder !== null && <p className="text-neutral-500 text-sm mt-2">O/U {odds.overUnder}</p>}
            </section>
          )}

          <section>
            <h2 className="text-lg font-medium text-neutral-300 mb-3">Box score</h2>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="py-2 pr-2 border-b border-neutral-700">Team</th>
                  <th className="py-2 pr-2 text-right border-b border-neutral-700">PTS</th>
                  <th className="py-2 pr-2 text-right border-b border-neutral-700">REB</th>
                  <th className="py-2 pr-2 text-right border-b border-neutral-700">AST</th>
                  <th className="py-2 pr-2 text-right border-b border-neutral-700">STL</th>
                  <th className="py-2 pr-2 text-right border-b border-neutral-700">BLK</th>
                  <th className="py-2 pr-2 text-right border-b border-neutral-700">TO</th>
                  <th className="py-2 pr-2 text-right border-b border-neutral-700">FG</th>
                  <th className="py-2 pr-2 text-right border-b border-neutral-700">3PT</th>
                  <th className="py-2 text-right border-b border-neutral-700">FT</th>
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
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-neutral-500">
                      <th className="py-2 pr-2 border-b border-neutral-700">Player</th>
                      <th className="py-2 pr-2 text-right border-b border-neutral-700">MIN</th>
                      <th className="py-2 pr-2 text-right border-b border-neutral-700">PTS</th>
                      <th className="py-2 pr-2 text-right border-b border-neutral-700">REB</th>
                      <th className="py-2 pr-2 text-right border-b border-neutral-700">AST</th>
                      <th className="py-2 pr-2 text-right border-b border-neutral-700">STL</th>
                      <th className="py-2 text-right border-b border-neutral-700">BLK</th>
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
        </>
      )}

      {activeTab === "playbyplay" && plays.length > 0 && (
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

interface ScoreboardTeam {
  linkId: number | null;
  abbreviation: string;
  displayName: string;
  score: number | null;
  logoUrl: string | null;
  color: string | null;
}

function topBy(rows: PlayerLeaderRow[], key: "points" | "rebounds" | "assists"): PlayerLeaderRow | null {
  if (rows.length === 0) return null;
  return rows.reduce((best, row) => ((row[key] ?? -1) > (best[key] ?? -1) ? row : best), rows[0]);
}

const NAME_SUFFIXES = new Set(["jr.", "jr", "sr.", "sr", "ii", "iii", "iv"]);

// ESPN's Game Leaders card shows "A. Edwards" rather than "Anthony Edwards" —
// collapse the given name(s) to an initial, keeping any suffix (Jr., III, …)
// attached to the surname rather than treated as it.
function toShortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const hasSuffix = parts.length > 2 && NAME_SUFFIXES.has(parts[parts.length - 1].toLowerCase());
  const surname = hasSuffix ? parts.slice(-2).join(" ") : parts[parts.length - 1];
  return `${parts[0][0]}. ${surname}`;
}

function leaderSecondary(category: "points" | "rebounds" | "assists", leader: PlayerLeaderRow): string {
  if (category === "points") return `${leader.fgMade}/${leader.fgAtt} FG, ${leader.ftMade}/${leader.ftAtt} FT`;
  if (category === "rebounds") return `${leader.defensiveRebounds} DREB, ${leader.offensiveRebounds} OREB`;
  return `${leader.turnovers} TO, ${leader.minutes} MIN`;
}

// ESPN's CDN crops/upscales headshots on request rather than serving one
// fixed size — ask for a sharper 144px square instead of whatever the
// un-decorated URL happens to default to.
function headshotSrc(url: string): string {
  return `${url}?quality=80&h=144&w=144&scale=crop&transparent=true`;
}

function LeaderCell({ leader, value, secondary }: { leader: PlayerLeaderRow | null; value: number | null; secondary: string }) {
  if (!leader) return <div className="flex-1" />;
  return (
    <div className="flex flex-1 flex-col items-center gap-1 text-center">
      <div className="flex items-center gap-2">
        {leader.headshotUrl ? (
          <img
            src={headshotSrc(leader.headshotUrl)}
            alt={leader.name}
            className="h-16 w-16 rounded-full bg-neutral-800 object-cover"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-neutral-800" />
        )}
        <div className="text-xl font-bold text-neutral-100">{value}</div>
      </div>
      <div className="text-sm text-neutral-200">
        {leader.linkId ? (
          <Link href={`/players/${leader.linkId}`} className="hover:text-neutral-100">
            {toShortName(leader.name)}
          </Link>
        ) : (
          toShortName(leader.name)
        )}
        {leader.jersey && <span className="text-neutral-500"> #{leader.jersey}</span>}
      </div>
      <div className="text-xs text-neutral-500">{secondary}</div>
    </div>
  );
}

function GameLeaders({
  away,
  home,
  awayPlayerRows,
  homePlayerRows,
}: {
  away: ScoreboardTeam;
  home: ScoreboardTeam;
  awayPlayerRows: PlayerLeaderRow[];
  homePlayerRows: PlayerLeaderRow[];
}) {
  const categories: { label: string; key: "points" | "rebounds" | "assists" }[] = [
    { label: "Points", key: "points" },
    { label: "Rebounds", key: "rebounds" },
    { label: "Assists", key: "assists" },
  ];

  return (
    // Pull flush to the page's hero gutter instead of sitting inside
    // <main>'s centered max-w-6xl column, which leaves a wide empty gap on
    // large screens between the viewport edge and this card.
    <div className="w-full rounded-lg border border-neutral-800">
      <div className="px-4 pt-4">
        <h2 className="text-sm font-semibold text-neutral-200">Game Leaders</h2>
      </div>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          {away.logoUrl && <img src={away.logoUrl} alt={away.displayName} className="h-6 w-6 object-contain" />}
          <span className="text-sm font-medium text-neutral-300">{away.abbreviation}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-300">{home.abbreviation}</span>
          {home.logoUrl && <img src={home.logoUrl} alt={home.displayName} className="h-6 w-6 object-contain" />}
        </div>
      </div>
      <div className="divide-y divide-neutral-900">
        {categories.map((category) => {
          const awayLeader = topBy(awayPlayerRows, category.key);
          const homeLeader = topBy(homePlayerRows, category.key);
          return (
            <div key={category.key} className="flex items-center gap-2 px-4 py-3">
              <LeaderCell
                leader={awayLeader}
                value={awayLeader?.[category.key] ?? null}
                secondary={awayLeader ? leaderSecondary(category.key, awayLeader) : ""}
              />
              <div className="w-20 shrink-0 text-center text-xs font-medium text-neutral-400">{category.label}</div>
              <LeaderCell
                leader={homeLeader}
                value={homeLeader?.[category.key] ?? null}
                secondary={homeLeader ? leaderSecondary(category.key, homeLeader) : ""}
              />
            </div>
          );
        })}
      </div>
      <div className="border-t border-neutral-900 px-4 py-3 text-center">
        <Link href="?tab=boxscore" className="text-sm text-neutral-400 hover:text-neutral-100">
          Full Box Score
        </Link>
      </div>
    </div>
  );
}

function pct(made: number | null, att: number | null): number | null {
  if (made === null || att === null || att === 0) return null;
  return Math.round((made / att) * 100);
}

interface TeamStatRow {
  label: string;
  awayValue: number | null;
  homeValue: number | null;
  awayDisplay: string;
  homeDisplay: string;
  // "pct" bars show the percentage itself as the fill; "count" bars scale
  // each side relative to whichever team has the larger raw count, since a
  // count (rebounds, turnovers) has no natural 0-100 ceiling to fill against.
  kind: "pct" | "count";
}

function TeamStatsCard({
  away,
  home,
  awayStats,
  homeStats,
}: {
  away: ScoreboardTeam;
  home: ScoreboardTeam;
  awayStats: TeamStatFields | null;
  homeStats: TeamStatFields | null;
}) {
  if (!awayStats || !homeStats || awayStats.points === null) return null;

  const fgAwayPct = pct(awayStats.fgMade, awayStats.fgAtt);
  const fgHomePct = pct(homeStats.fgMade, homeStats.fgAtt);
  const threeAwayPct = pct(awayStats.threeMade, awayStats.threeAtt);
  const threeHomePct = pct(homeStats.threeMade, homeStats.threeAtt);
  const ftAwayPct = pct(awayStats.ftMade, awayStats.ftAtt);
  const ftHomePct = pct(homeStats.ftMade, homeStats.ftAtt);

  const rows: TeamStatRow[] = [
    {
      label: "Field Goal %",
      kind: "pct",
      awayValue: fgAwayPct,
      homeValue: fgHomePct,
      awayDisplay: `${fgAwayPct ?? "-"}% (${awayStats.fgMade}-${awayStats.fgAtt})`,
      homeDisplay: `${fgHomePct ?? "-"}% (${homeStats.fgMade}-${homeStats.fgAtt})`,
    },
    {
      label: "Three Point %",
      kind: "pct",
      awayValue: threeAwayPct,
      homeValue: threeHomePct,
      awayDisplay: `${threeAwayPct ?? "-"}% (${awayStats.threeMade}-${awayStats.threeAtt})`,
      homeDisplay: `${threeHomePct ?? "-"}% (${homeStats.threeMade}-${homeStats.threeAtt})`,
    },
    {
      label: "Free Throw %",
      kind: "pct",
      awayValue: ftAwayPct,
      homeValue: ftHomePct,
      awayDisplay: `${ftAwayPct ?? "-"}% (${awayStats.ftMade}-${awayStats.ftAtt})`,
      homeDisplay: `${ftHomePct ?? "-"}% (${homeStats.ftMade}-${homeStats.ftAtt})`,
    },
    {
      label: "Turnovers",
      kind: "count",
      awayValue: awayStats.turnovers,
      homeValue: homeStats.turnovers,
      awayDisplay: String(awayStats.turnovers ?? "-"),
      homeDisplay: String(homeStats.turnovers ?? "-"),
    },
    {
      label: "Rebounds",
      kind: "count",
      awayValue: awayStats.rebounds,
      homeValue: homeStats.rebounds,
      awayDisplay: String(awayStats.rebounds ?? "-"),
      homeDisplay: String(homeStats.rebounds ?? "-"),
    },
  ];

  return (
    <div className="w-full rounded-lg border border-neutral-800">
      <div className="px-4 pt-4">
        <h2 className="text-sm font-semibold text-neutral-200">Team Stats</h2>
      </div>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          {away.logoUrl && <img src={away.logoUrl} alt={away.displayName} className="h-6 w-6 object-contain" />}
          <span className="text-sm font-medium text-neutral-300">{away.abbreviation}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-300">{home.abbreviation}</span>
          {home.logoUrl && <img src={home.logoUrl} alt={home.displayName} className="h-6 w-6 object-contain" />}
        </div>
      </div>
      <div className="divide-y divide-neutral-900 px-4">
        {rows.map((row) => (
          <div key={row.label} className="py-3">
            <div className="flex items-center justify-between text-sm font-medium text-neutral-200">
              <span>{row.awayDisplay}</span>
              <span className="text-xs text-neutral-500">{row.label}</span>
              <span>{row.homeDisplay}</span>
            </div>
            <div className="mt-2">
              {row.kind === "pct" ? (
                <div className="flex items-center gap-1">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className="ml-auto h-full rounded-full"
                      style={{ width: `${Math.min(100, row.awayValue ?? 0)}%`, backgroundColor: away.color ?? "#737373" }}
                    />
                  </div>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, row.homeValue ?? 0)}%`, backgroundColor: home.color ?? "#737373" }}
                    />
                  </div>
                </div>
              ) : (
                // A single shared bar split proportionally — unlike the pct
                // rows above, away/home counts have no independent 0-100
                // scale of their own, only relative to each other.
                <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="h-full"
                    style={{
                      width: `${((row.awayValue ?? 0) / Math.max((row.awayValue ?? 0) + (row.homeValue ?? 0), 1)) * 100}%`,
                      backgroundColor: away.color ?? "#737373",
                    }}
                  />
                  <div
                    className="h-full"
                    style={{
                      width: `${((row.homeValue ?? 0) / Math.max((row.awayValue ?? 0) + (row.homeValue ?? 0), 1)) * 100}%`,
                      backgroundColor: home.color ?? "#737373",
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-neutral-900 px-4 py-3 text-center">
        <Link href="?tab=teamstats" className="text-sm text-neutral-400 hover:text-neutral-100">
          Full Team Stats
        </Link>
      </div>
    </div>
  );
}

function GameInformationCard({ date, gameInfo }: { date: string; gameInfo: GameInfo }) {
  return (
    <div className="w-full rounded-lg border border-neutral-800">
      <div className="px-4 pt-4">
        <h2 className="text-sm font-semibold text-neutral-200">Game Information</h2>
      </div>
      <div className="space-y-4 px-4 py-3 text-sm">
        <div className="text-neutral-200">{formatGameDateTime(date)}</div>

        {gameInfo.venue && (
          <div>
            <div className="text-neutral-200">{gameInfo.venue.name}</div>
            {(gameInfo.venue.city || gameInfo.venue.state) && (
              <div className="text-neutral-500">
                {[gameInfo.venue.city, gameInfo.venue.state].filter(Boolean).join(", ")}
              </div>
            )}
          </div>
        )}

        {gameInfo.venue?.imageUrl && (
          <img src={gameInfo.venue.imageUrl} alt={gameInfo.venue.name} className="w-full rounded-md object-cover" />
        )}

        {gameInfo.attendance !== null && (
          <div className="text-neutral-200">Attendance: {gameInfo.attendance.toLocaleString()}</div>
        )}

        {gameInfo.broadcasts.length > 0 && (
          <div>
            <div className="text-xs text-neutral-500 mb-1">Where to Watch</div>
            <div className="flex flex-wrap gap-2">
              {gameInfo.broadcasts.map((b) => (
                <span key={b} className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300">
                  {b}
                </span>
              ))}
            </div>
          </div>
        )}

        {gameInfo.officials.length > 0 && (
          <div>
            <div className="text-xs text-neutral-500 mb-1">Officiating Crew</div>
            <div className="space-y-1">
              {gameInfo.officials.map((o) => (
                <div key={o.name} className="flex justify-between text-neutral-200">
                  <span className="text-neutral-500">{o.position}</span>
                  <span>{o.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface NormalizedOdds {
  provider: string;
  overUnder: number | null;
  homeSpread: number | null;
  awaySpread: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
  homeIsFavorite: boolean;
}

function OddsPanel({ away, home, odds }: { away: ScoreboardTeam; home: ScoreboardTeam; odds: NormalizedOdds | null }) {
  return (
    <div className="w-full rounded-lg border border-neutral-800">
      <div className="flex items-center justify-between px-4 pt-4">
        <h2 className="text-sm font-semibold text-neutral-200">Game Odds</h2>
        {odds && <span className="text-xs text-neutral-500">Odds by {odds.provider}</span>}
      </div>
      {odds ? (
        <div className="px-4 py-3">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-neutral-500">
                <th className="border-b border-neutral-700 pb-2 font-normal" />
                <th className="border-b border-neutral-700 pb-2 text-right font-normal">Spread</th>
                <th className="border-b border-neutral-700 pb-2 text-right font-normal">Total</th>
                <th className="border-b border-neutral-700 pb-2 text-right font-normal">ML</th>
              </tr>
            </thead>
            <tbody>
              <tr className={`border-b border-neutral-900 ${!odds.homeIsFavorite ? "font-semibold text-neutral-100" : "text-neutral-300"}`}>
                <td className="py-2">{away.abbreviation}</td>
                <td className="py-2 text-right">{formatSigned(odds.awaySpread)}</td>
                <td className="py-2 text-right">{odds.overUnder !== null ? `o${odds.overUnder}` : "-"}</td>
                <td className="py-2 text-right">{formatSigned(odds.awayMoneyline)}</td>
              </tr>
              <tr className={odds.homeIsFavorite ? "font-semibold text-neutral-100" : "text-neutral-300"}>
                <td className="py-2">{home.abbreviation}</td>
                <td className="py-2 text-right">{formatSigned(odds.homeSpread)}</td>
                <td className="py-2 text-right">{odds.overUnder !== null ? `u${odds.overUnder}` : "-"}</td>
                <td className="py-2 text-right">{formatSigned(odds.homeMoneyline)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-3 text-sm text-neutral-500">No odds available for this game.</p>
      )}
    </div>
  );
}

function formatMatchupDate(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}

function formatMatchupDateTime(dateIso: string): string {
  const date = new Date(dateIso);
  const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
  const day = date.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${weekday}, ${day} @ ${time}`;
}

// Matches ESPN's Matchups card exactly: each row's outer left/right value is
// always *our* away/home team (score if the game's done, season record if
// it isn't) — regardless of which of the two was actually the home team in
// that particular meeting. Only the "Game N @ ___" label uses that game's
// real home team.
function MatchupsCard({
  away,
  home,
  awayRecord,
  homeRecord,
  seasonSeries,
}: {
  away: ScoreboardTeam;
  home: ScoreboardTeam;
  awayRecord: string | null;
  homeRecord: string | null;
  seasonSeries: SeasonSeries;
}) {
  return (
    <div className="w-full rounded-lg border border-neutral-800">
      <div className="px-4 pt-4 pb-1">
        <h2 className="text-xs font-semibold tracking-wide text-neutral-400">MATCHUPS</h2>
      </div>
      <div className="flex items-center justify-around px-4 py-4">
        <div className="flex flex-col items-center gap-1">
          {away.logoUrl && <img src={away.logoUrl} alt={away.displayName} className="h-9 w-9 object-contain" />}
          <span className="text-xs text-neutral-400">{away.abbreviation}</span>
        </div>
        <div className="text-center">
          <div className="text-xs text-neutral-400">{seasonSeries.summary}</div>
          {seasonSeries.seriesScore && <div className="text-base font-bold text-neutral-100">{seasonSeries.seriesScore}</div>}
        </div>
        <div className="flex flex-col items-center gap-1">
          {home.logoUrl && <img src={home.logoUrl} alt={home.displayName} className="h-9 w-9 object-contain" />}
          <span className="text-xs text-neutral-400">{home.abbreviation}</span>
        </div>
      </div>
      <div className="divide-y divide-neutral-900 border-t border-neutral-900">
        {seasonSeries.events
          .map((event, i) => ({ event, i }))
          .filter(({ event }) => !event.completed)
          .slice(0, 1)
          .map(({ event, i }) => {
          const awaySide = event.home.abbreviation === away.abbreviation ? event.home : event.away;
          const homeSide = event.home.abbreviation === home.abbreviation ? event.home : event.away;
          return (
            <div key={event.espnId} className="flex items-center gap-2 px-4 py-3">
              <div className="w-10 text-lg text-right">
                <span className={awaySide.winner ? "font-semibold text-neutral-100" : "text-neutral-500"}>
                  {event.completed ? awaySide.score : awayRecord}
                </span>
              </div>
              <div className="flex-1 text-center">
                <div className="text-xs text-neutral-500">
                  Game {i + 1} @ {event.home.abbreviation}
                </div>
                <div className="text-sm font-semibold text-neutral-100">
                  {event.completed ? event.statusDetail : formatMatchupDateTime(event.date)}
                </div>
                {event.completed ? (
                  <div className="text-xs text-neutral-500">{formatMatchupDate(event.date)}</div>
                ) : (
                  event.broadcasts.length > 0 && (
                    <div className="mt-1 flex justify-center gap-2">
                      {event.broadcasts.map((b) => (
                        <span key={b} className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400">
                          {b}
                        </span>
                      ))}
                    </div>
                  )
                )}
              </div>
              <div className="flex w-10 items-center gap-1 text-lg">
                {homeSide.winner && <span className="text-neutral-500">{"›"}</span>}
                <span className={homeSide.winner ? "font-semibold text-neutral-100" : "text-neutral-500"}>
                  {event.completed ? homeSide.score : homeRecord}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamName({ team }: { team: ScoreboardTeam }) {
  if (team.linkId) {
    return (
      <Link href={`/teams/${team.linkId}`} className="hover:text-neutral-300">
        {team.displayName}
      </Link>
    );
  }
  return <>{team.displayName}</>;
}

function ScoreboardHeader({
  away,
  home,
  statusDetail,
  linescores,
  tabs,
  activeTab,
  onTabChange,
}: {
  away: ScoreboardTeam;
  home: ScoreboardTeam;
  statusDetail: string | null;
  linescores: HeaderExtras | null;
  tabs: { value: TabKey; label: string }[];
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}) {
  const periods = linescores
    ? Math.max(linescores.away.linescores.length, linescores.home.linescores.length)
    : 0;

  return (
    // Full-bleed: this page's <main> caps content at max-w-6xl with side
    // gutters, but the scoreboard header should span the whole viewport
    // width like ESPN's real game header, not just the content column.
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen overflow-hidden border-y border-neutral-800 bg-neutral-950">
      <div
        className="h-1 w-full"
        style={{ background: `linear-gradient(90deg, ${away.color ?? "#525252"}, ${home.color ?? "#525252"})` }}
      />
      <div className="relative">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(90deg, ${away.color ?? "#000"}26 0%, transparent 40%, transparent 60%, ${home.color ?? "#000"}26 100%)`,
          }}
        />
        <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-6">
          <div className="flex flex-1 items-center gap-4">
          {away.logoUrl && <img src={away.logoUrl} alt={away.displayName} className="h-14 w-14 shrink-0 object-contain" />}
          <div>
            <div className="font-semibold text-neutral-100 leading-tight">
              <TeamName team={away} />
            </div>
            {linescores && (
              <div className="text-xs text-neutral-500 mt-0.5">
                {linescores.away.record}
                {linescores.away.splitRecord ? `, ${linescores.away.splitRecord} Away` : ""}
              </div>
            )}
          </div>
          <div className="ml-2 text-4xl font-bold tabular-nums text-neutral-100">{away.score ?? "-"}</div>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1 px-2">
          {statusDetail && <div className="text-sm font-medium text-neutral-300">{statusDetail}</div>}
          {linescores && periods > 0 && (
            <table className="text-xs text-neutral-400">
              <thead>
                <tr className="text-neutral-500">
                  <th className="px-1.5 font-normal" />
                  {Array.from({ length: periods }, (_, i) => (
                    <th key={i} className="px-1.5 font-normal">
                      {periodLabel(i)}
                    </th>
                  ))}
                  <th className="px-1.5 font-normal">T</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-1.5 font-semibold text-neutral-300">{away.abbreviation}</td>
                  {Array.from({ length: periods }, (_, i) => (
                    <td key={i} className="px-1.5 text-center">
                      {linescores.away.linescores[i] ?? ""}
                    </td>
                  ))}
                  <td className="px-1.5 text-center font-semibold text-neutral-100">{away.score ?? "-"}</td>
                </tr>
                <tr>
                  <td className="px-1.5 font-semibold text-neutral-300">{home.abbreviation}</td>
                  {Array.from({ length: periods }, (_, i) => (
                    <td key={i} className="px-1.5 text-center">
                      {linescores.home.linescores[i] ?? ""}
                    </td>
                  ))}
                  <td className="px-1.5 text-center font-semibold text-neutral-100">{home.score ?? "-"}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-1 items-center justify-end gap-4">
          <div className="mr-2 text-4xl font-bold tabular-nums text-neutral-100">{home.score ?? "-"}</div>
          <div>
            <div className="font-semibold text-neutral-100 leading-tight">
              <TeamName team={home} />
            </div>
            {linescores && (
              <div className="text-xs text-neutral-500 mt-0.5">
                {linescores.home.record}
                {linescores.home.splitRecord ? `, ${linescores.home.splitRecord} Home` : ""}
              </div>
            )}
          </div>
          {home.logoUrl && <img src={home.logoUrl} alt={home.displayName} className="h-14 w-14 shrink-0 object-contain" />}
        </div>
        </div>
      </div>
      <TabPager tabs={tabs} activeTab={activeTab} onChange={onTabChange} accentColor={home.color ?? "#525252"} />
    </div>
  );
}
