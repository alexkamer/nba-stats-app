"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTheme } from "next-themes";
import { Suspense, useId, useState } from "react";
import { TabPager, useTabQueryParam } from "@/components/TabPager";
import { getTeamAccent } from "@/lib/team-accent";

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
  homeTeam: { id: number; espnId: string; displayName: string; abbreviation: string; logoUrl: string | null; color: string | null; alternateColor: string | null };
  awayTeam: { id: number; espnId: string; displayName: string; abbreviation: string; logoUrl: string | null; color: string | null; alternateColor: string | null };
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
  winProbability: WinProbabilityPoint[] | null;
  shots: Shot[] | null;
}

interface LiveGame {
  date: string;
  statusDetail: string;
  home: { espnId: string; abbreviation: string; displayName: string; score: number | null; logoUrl: string | null; color: string | null; alternateColor: string | null };
  away: { espnId: string; abbreviation: string; displayName: string; score: number | null; logoUrl: string | null; color: string | null; alternateColor: string | null };
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
  winProbability: WinProbabilityPoint[];
  shots: Shot[];
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
  espnId: string;
  period: number | null;
  clock: string | null;
  description: string | null;
  homeScore: number | null;
  awayScore: number | null;
  scoringPlay: boolean;
}

// Never persisted (SPEC.md Sec 6 has no column for it) — pulled live from
// ESPN for both DB- and live-sourced games, keyed by playId so it can be
// zipped against `plays[].espnId`.
interface WinProbabilityPoint {
  playId: string;
  homeWinPercentage: number;
}

// Shot locations are never persisted (SPEC.md Sec 6 has no columns for
// them) — pulled live from ESPN for both DB- and live-sourced games.
// x/y are half-court feet relative to the hoop (x: 0-50 cross-court,
// 25 = straight on; y: distance from the basket).
interface Shot {
  playId: string;
  teamId: string;
  made: boolean;
  x: number;
  y: number;
  period: number | null;
  playType: string;
  playerName: string | null;
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


// Periods beyond the 4th are overtime — ESPN's linescores array has no
// period labels of its own, just one entry per period played.
function periodLabel(index: number): string {
  if (index < 4) return String(index + 1);
  return index === 4 ? "OT" : `OT${index - 3}`;
}

// ESPN's own sequenceNumber occasionally orders a clock-buzzer play (e.g. a
// substitution logged with "3.9" seconds left) after that period's "End of
// Nth Quarter" marker, even though the marker's clock (0.0) is later. Re-sort
// by period, then by time remaining within the period, forcing end-of-period
// markers to the end of their period — falling back to the original
// (sequenceNumber) order for any remaining ties, since Array#sort is stable.
function parseClockSeconds(clock: string | null): number {
  if (!clock) return 0;
  if (clock.includes(":")) {
    const [minutes, seconds] = clock.split(":").map(Number);
    return minutes * 60 + (seconds || 0);
  }
  return parseFloat(clock) || 0;
}

function isEndOfPeriodPlay(description: string | null): boolean {
  return /^end of/i.test(description?.trim() ?? "");
}

function sortPlaysChronologically<T extends { period: number | null; clock: string | null; description: string | null }>(
  plays: T[],
): T[] {
  return [...plays].sort((a, b) => {
    const periodDiff = (a.period ?? 0) - (b.period ?? 0);
    if (periodDiff !== 0) return periodDiff;

    const aEnd = isEndOfPeriodPlay(a.description);
    const bEnd = isEndOfPeriodPlay(b.description);
    if (aEnd !== bEnd) return aEnd ? 1 : -1;

    return parseClockSeconds(b.clock) - parseClockSeconds(a.clock);
  });
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
    <Suspense fallback={<p className="text-foreground/60">Loading…</p>}>
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
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";

  if (isLoading) return <p className="text-foreground/60">Loading…</p>;
  if (error || !data) return <p className="text-red-600 dark:text-red-400">Game not found.</p>;

  const { game, source } = data;

  // Each side's accent comes from that team's own ESPN color, contrast-checked
  // against the active theme's background independently — so the home and
  // away accents never collapse onto the same fallback together, and one
  // side having bad color data doesn't affect the other's real color.
  const home =
    source === "db"
      ? {
          linkId: (game as DbGame).homeTeam.id,
          abbreviation: (game as DbGame).homeTeam.abbreviation,
          displayName: (game as DbGame).homeTeam.displayName,
          score: (game as DbGame).homeScore,
          logoUrl: (game as DbGame).homeTeam.logoUrl,
          accent: getTeamAccent((game as DbGame).homeTeam.color, theme).accent,
        }
      : {
          linkId: null,
          abbreviation: (game as LiveGame).home.abbreviation,
          displayName: (game as LiveGame).home.displayName,
          score: (game as LiveGame).home.score,
          logoUrl: (game as LiveGame).home.logoUrl,
          accent: getTeamAccent((game as LiveGame).home.color, theme).accent,
        };
  const away =
    source === "db"
      ? {
          linkId: (game as DbGame).awayTeam.id,
          abbreviation: (game as DbGame).awayTeam.abbreviation,
          displayName: (game as DbGame).awayTeam.displayName,
          score: (game as DbGame).awayScore,
          logoUrl: (game as DbGame).awayTeam.logoUrl,
          accent: getTeamAccent((game as DbGame).awayTeam.color, theme).accent,
        }
      : {
          linkId: null,
          abbreviation: (game as LiveGame).away.abbreviation,
          displayName: (game as LiveGame).away.displayName,
          score: (game as LiveGame).away.score,
          logoUrl: (game as LiveGame).away.logoUrl,
          accent: getTeamAccent((game as LiveGame).away.color, theme).accent,
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

  const plays = sortPlaysChronologically(game.plays).map((p, i) => ({ ...p, key: p.id ?? i }));
  const visiblePlays = showAllPlays ? plays : plays.slice(-20);
  const winProbability = (game as DbGame | LiveGame).winProbability ?? [];
  const shots = (game as DbGame | LiveGame).shots ?? [];
  const awayEspnId = source === "db" ? (game as DbGame).awayTeam.espnId : (game as LiveGame).away.espnId;
  const homeEspnId = source === "db" ? (game as DbGame).homeTeam.espnId : (game as LiveGame).home.espnId;

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
            <div className="space-y-6">
              <ProbabilityGameFlowCard away={away} home={home} plays={plays} winProbability={winProbability} />
              <ShotChartCard away={away} home={home} awayEspnId={awayEspnId} homeEspnId={homeEspnId} shots={shots} />
            </div>
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
      {activeTab === "recap" && <p className="text-foreground/50 text-sm">Coming soon.</p>}
      {activeTab === "teamstats" && <p className="text-foreground/50 text-sm">Coming soon.</p>}

      {activeTab === "boxscore" && (
        <>
          {odds && (
            <section>
              <h2 className="text-lg font-medium text-foreground/80 mb-3">
                Odds <span className="text-foreground/50 text-sm font-normal">({odds.provider})</span>
              </h2>
              <table className="w-full text-sm max-w-md border-collapse">
                <thead>
                  <tr className="text-left text-foreground/50">
                    <th className="py-2 pr-2 border-b border-border">Team</th>
                    <th className="py-2 pr-2 text-right border-b border-border">Spread</th>
                    <th className="py-2 text-right border-b border-border">Moneyline</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={`border-b border-border/60 ${!odds.homeIsFavorite ? "font-semibold" : ""}`}>
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
              {odds.overUnder !== null && <p className="text-foreground/50 text-sm mt-2">O/U {odds.overUnder}</p>}
            </section>
          )}

          <section>
            <h2 className="text-lg font-medium text-foreground/80 mb-3">Box score</h2>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-foreground/50">
                  <th className="py-2 pr-2 border-b border-border">Team</th>
                  <th className="py-2 pr-2 text-right border-b border-border">PTS</th>
                  <th className="py-2 pr-2 text-right border-b border-border">REB</th>
                  <th className="py-2 pr-2 text-right border-b border-border">AST</th>
                  <th className="py-2 pr-2 text-right border-b border-border">STL</th>
                  <th className="py-2 pr-2 text-right border-b border-border">BLK</th>
                  <th className="py-2 pr-2 text-right border-b border-border">TO</th>
                  <th className="py-2 pr-2 text-right border-b border-border">FG</th>
                  <th className="py-2 pr-2 text-right border-b border-border">3PT</th>
                  <th className="py-2 text-right border-b border-border">FT</th>
                </tr>
              </thead>
              <tbody>
                {teamRows.every((s) => s.points === null) ? (
                  <tr>
                    <td colSpan={10} className="py-4 text-center text-foreground/50">
                      No box score yet
                      {source === "live" ? ` — ${(game as LiveGame).statusDetail}` : ""}.
                    </td>
                  </tr>
                ) : (
                  teamRows.map((s) => (
                    <tr key={s.key} className="border-b border-border/60">
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
                <h2 className="text-lg font-medium text-foreground/80 mb-3">{team.displayName}</h2>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-foreground/50">
                      <th className="py-2 pr-2 border-b border-border">Player</th>
                      <th className="py-2 pr-2 text-right border-b border-border">MIN</th>
                      <th className="py-2 pr-2 text-right border-b border-border">PTS</th>
                      <th className="py-2 pr-2 text-right border-b border-border">REB</th>
                      <th className="py-2 pr-2 text-right border-b border-border">AST</th>
                      <th className="py-2 pr-2 text-right border-b border-border">STL</th>
                      <th className="py-2 text-right border-b border-border">BLK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.key} className="border-b border-border/60">
                        <td className="py-2 pr-2">
                          {p.linkId ? (
                            <Link href={`/players/${p.linkId}`} className="hover:text-foreground">
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
            <h2 className="text-lg font-medium text-foreground/80">Play-by-play</h2>
            <button
              onClick={() => setShowAllPlays((v) => !v)}
              className="text-sm text-foreground/60 hover:text-foreground"
            >
              {showAllPlays ? "Show less" : `Show all ${plays.length} plays`}
            </button>
          </div>
          <div className="space-y-1">
            {visiblePlays.map((play) => (
              <div
                key={play.key}
                className={`flex items-center justify-between rounded-md px-3 py-1.5 text-sm ${
                  play.scoringPlay ? "bg-surface-muted" : ""
                }`}
              >
                <span className="text-foreground/50 w-20 shrink-0">
                  Q{play.period} {play.clock}
                </span>
                <span className="flex-1">{play.description}</span>
                <span className="text-foreground/50 w-16 text-right shrink-0">
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
  accent: string;
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

function LeaderCell({
  leader,
  value,
  secondary,
  flip = false,
}: {
  leader: PlayerLeaderRow | null;
  value: number | null;
  secondary: string;
  flip?: boolean;
}) {
  if (!leader) return <div className="flex-1" />;
  return (
    <div className="flex flex-1 flex-col items-center gap-1 text-center">
      <div className={`flex items-center gap-3 ${flip ? "flex-row-reverse" : ""}`}>
        {leader.headshotUrl ? (
          <img
            src={headshotSrc(leader.headshotUrl)}
            alt={leader.name}
            className="h-16 w-16 shrink-0 rounded-full bg-surface-muted object-cover"
          />
        ) : (
          <div className="h-16 w-16 shrink-0 rounded-full bg-surface-muted" />
        )}
        <div className="w-10 shrink-0 text-center text-xl font-bold tabular-nums text-foreground">{value}</div>
      </div>
      <div className="text-sm font-semibold text-foreground">
        {leader.linkId ? (
          <Link href={`/players/${leader.linkId}`} className="hover:text-accent">
            {toShortName(leader.name)}
          </Link>
        ) : (
          toShortName(leader.name)
        )}
        {leader.jersey && <span className="text-foreground/50 font-normal"> #{leader.jersey}</span>}
      </div>
      <div className="text-xs text-foreground/60">{secondary}</div>
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
    <div className="w-full rounded-lg border border-border">
      <div className="px-4 pt-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Game Leaders</h2>
      </div>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          {away.logoUrl && <img src={away.logoUrl} alt={away.displayName} className="h-6 w-6 object-contain" />}
          <span className="text-sm font-bold text-foreground">{away.abbreviation}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground">{home.abbreviation}</span>
          {home.logoUrl && <img src={home.logoUrl} alt={home.displayName} className="h-6 w-6 object-contain" />}
        </div>
      </div>
      <div className="divide-y divide-border/60">
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
              <div className="w-20 shrink-0 text-center text-xs font-bold uppercase tracking-wide text-foreground/70">
                {category.label}
              </div>
              <LeaderCell
                leader={homeLeader}
                value={homeLeader?.[category.key] ?? null}
                secondary={homeLeader ? leaderSecondary(category.key, homeLeader) : ""}
                flip
              />
            </div>
          );
        })}
      </div>
      <div className="border-t border-border/60 px-4 py-3 text-center">
        <Link href="?tab=boxscore" className="text-sm text-foreground/60 hover:text-foreground">
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
    <div className="w-full rounded-lg border border-border">
      <div className="px-4 pt-4">
        <h2 className="text-sm font-semibold text-foreground/80">Team Stats</h2>
      </div>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          {away.logoUrl && <img src={away.logoUrl} alt={away.displayName} className="h-6 w-6 object-contain" />}
          <span className="text-sm font-medium text-foreground/80">{away.abbreviation}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground/80">{home.abbreviation}</span>
          {home.logoUrl && <img src={home.logoUrl} alt={home.displayName} className="h-6 w-6 object-contain" />}
        </div>
      </div>
      <div className="divide-y divide-border/60 px-4">
        {rows.map((row) => (
          <div key={row.label} className="py-3">
            <div className="flex items-center justify-between text-sm font-medium text-foreground/80">
              <span>{row.awayDisplay}</span>
              <span className="text-xs text-foreground/50">{row.label}</span>
              <span>{row.homeDisplay}</span>
            </div>
            <div className="mt-2">
              {row.kind === "pct" ? (
                <div className="flex items-center gap-1">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, row.awayValue ?? 0)}%`, backgroundColor: away.accent }}
                    />
                  </div>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="ml-auto h-full rounded-full"
                      style={{ width: `${Math.min(100, row.homeValue ?? 0)}%`, backgroundColor: home.accent }}
                    />
                  </div>
                </div>
              ) : (
                // A single shared bar split proportionally — unlike the pct
                // rows above, away/home counts have no independent 0-100
                // scale of their own, only relative to each other.
                <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full"
                    style={{
                      width: `${((row.awayValue ?? 0) / Math.max((row.awayValue ?? 0) + (row.homeValue ?? 0), 1)) * 100}%`,
                      backgroundColor: away.accent,
                    }}
                  />
                  <div
                    className="h-full"
                    style={{
                      width: `${((row.homeValue ?? 0) / Math.max((row.awayValue ?? 0) + (row.homeValue ?? 0), 1)) * 100}%`,
                      backgroundColor: home.accent,
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border/60 px-4 py-3 text-center">
        <Link href="?tab=teamstats" className="text-sm text-foreground/60 hover:text-foreground">
          Full Team Stats
        </Link>
      </div>
    </div>
  );
}

function GameInformationCard({ date, gameInfo }: { date: string; gameInfo: GameInfo }) {
  return (
    <div className="w-full rounded-lg border border-border">
      <div className="px-4 pt-4">
        <h2 className="text-sm font-semibold text-foreground/80">Game Information</h2>
      </div>
      <div className="space-y-4 px-4 py-3 text-sm">
        <div className="text-foreground/80">{formatGameDateTime(date)}</div>

        {gameInfo.venue && (
          <div>
            <div className="text-foreground/80">{gameInfo.venue.name}</div>
            {(gameInfo.venue.city || gameInfo.venue.state) && (
              <div className="text-foreground/50">
                {[gameInfo.venue.city, gameInfo.venue.state].filter(Boolean).join(", ")}
              </div>
            )}
          </div>
        )}

        {gameInfo.venue?.imageUrl && (
          <img src={gameInfo.venue.imageUrl} alt={gameInfo.venue.name} className="w-full rounded-md object-cover" />
        )}

        {gameInfo.attendance !== null && (
          <div className="text-foreground/80">Attendance: {gameInfo.attendance.toLocaleString()}</div>
        )}

        {gameInfo.broadcasts.length > 0 && (
          <div>
            <div className="text-xs text-foreground/50 mb-1">Where to Watch</div>
            <div className="flex flex-wrap gap-2">
              {gameInfo.broadcasts.map((b) => (
                <span key={b} className="rounded border border-border px-2 py-0.5 text-xs text-foreground/80">
                  {b}
                </span>
              ))}
            </div>
          </div>
        )}

        {gameInfo.officials.length > 0 && (
          <div>
            <div className="text-xs text-foreground/50 mb-1">Officiating Crew</div>
            <div className="space-y-1">
              {gameInfo.officials.map((o) => (
                <div key={o.name} className="flex justify-between text-foreground/80">
                  <span className="text-foreground/50">{o.position}</span>
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

// Highlights the market-winning cell (covered spread, hit total side, actual
// game winner's moneyline) in green — distinct from the favorite/dog bolding
// above, which reflects the pregame line rather than the result.
function winningCell(won: boolean): string {
  return won ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "";
}

function OddsPanel({ away, home, odds }: { away: ScoreboardTeam; home: ScoreboardTeam; odds: NormalizedOdds | null }) {
  const awayScore = away.score;
  const homeScore = home.score;
  const hasFinalScore = awayScore !== null && homeScore !== null;

  let awayCovered = false;
  let homeCovered = false;
  if (hasFinalScore && odds?.awaySpread !== null && odds?.homeSpread !== null && odds) {
    const awayMargin = awayScore! - homeScore! + odds.awaySpread!;
    const homeMargin = homeScore! - awayScore! + odds.homeSpread!;
    if (awayMargin > 0) awayCovered = true;
    else if (homeMargin > 0) homeCovered = true;
  }

  let overHit = false;
  let underHit = false;
  if (hasFinalScore && odds?.overUnder !== null && odds) {
    const total = awayScore! + homeScore!;
    if (total > odds.overUnder!) overHit = true;
    else if (total < odds.overUnder!) underHit = true;
  }

  const awayWon = hasFinalScore && awayScore! > homeScore!;
  const homeWon = hasFinalScore && homeScore! > awayScore!;

  return (
    <div className="w-full rounded-lg border border-border">
      <div className="flex items-center justify-between px-4 pt-4">
        <h2 className="text-sm font-semibold text-foreground/80">Game Odds</h2>
        {odds && <span className="text-xs text-foreground/50">Odds by {odds.provider}</span>}
      </div>
      {odds ? (
        <div className="px-4 py-3">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-foreground/50">
                <th className="border-b border-border pb-2 font-normal" />
                <th className="border-b border-border pb-2 text-right font-normal">Spread</th>
                <th className="border-b border-border pb-2 text-right font-normal">Total</th>
                <th className="border-b border-border pb-2 text-right font-normal">ML</th>
              </tr>
            </thead>
            <tbody>
              <tr className={`border-b border-border/60 ${!odds.homeIsFavorite ? "font-semibold text-foreground" : "text-foreground/80"}`}>
                <td className="py-2">{away.abbreviation}</td>
                <td className={`py-2 text-right ${winningCell(awayCovered)}`}>{formatSigned(odds.awaySpread)}</td>
                <td className={`py-2 text-right ${winningCell(overHit)}`}>{odds.overUnder !== null ? `o${odds.overUnder}` : "-"}</td>
                <td className={`py-2 text-right ${winningCell(awayWon)}`}>{formatSigned(odds.awayMoneyline)}</td>
              </tr>
              <tr className={odds.homeIsFavorite ? "font-semibold text-foreground" : "text-foreground/80"}>
                <td className="py-2">{home.abbreviation}</td>
                <td className={`py-2 text-right ${winningCell(homeCovered)}`}>{formatSigned(odds.homeSpread)}</td>
                <td className={`py-2 text-right ${winningCell(underHit)}`}>{odds.overUnder !== null ? `u${odds.overUnder}` : "-"}</td>
                <td className={`py-2 text-right ${winningCell(homeWon)}`}>{formatSigned(odds.homeMoneyline)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-3 text-sm text-foreground/50">No odds available for this game.</p>
      )}
    </div>
  );
}

const CHART_WIDTH = 400;
const CHART_HEIGHT = 140;

// "1st/2nd/3rd/4th/OT", distinct from periodLabel's plain "1/2/3/4/OT" used
// in the header's linescore table columns.
function ordinalPeriodLabel(index: number): string {
  if (index === 4) return "OT";
  if (index > 4) return `OT${index - 3}`;
  return ["1st", "2nd", "3rd", "4th"][index];
}

function periodTicks(items: { period: number | null }[]): { label: string; x: number }[] {
  if (items.length < 2) return [];
  const seen = new Set<number>();
  const ticks: { label: string; x: number }[] = [];
  items.forEach((item, i) => {
    if (item.period !== null && !seen.has(item.period)) {
      seen.add(item.period);
      ticks.push({ label: ordinalPeriodLabel(item.period - 1), x: i / (items.length - 1) });
    }
  });
  return ticks;
}

interface ProbabilityPoint extends PlayFields {
  homeWinPct: number;
}

// Win probability is never persisted (SPEC.md Sec 6 has no column for it) —
// zipped here against this game's plays by espnId/playId, both pulled live.
// Carries the full play along so hovering a point can drive the shared
// last-play info bar below the chart.
function buildWinProbabilitySeries(plays: PlayFields[], winProbability: WinProbabilityPoint[]): ProbabilityPoint[] {
  if (winProbability.length === 0) return [];
  const pctByPlayId = new Map(winProbability.map((w) => [w.playId, w.homeWinPercentage]));
  return plays
    .filter((p) => pctByPlayId.has(p.espnId))
    .map((p) => ({ ...p, homeWinPct: (pctByPlayId.get(p.espnId) ?? 0.5) * 100 }));
}

// ESPN's play-by-play feed occasionally cuts off before the actual final
// play (seen on some OT games — the last logged play's score trails the
// real final score by several points), which would otherwise leave both
// charts' last point short of the true result. If the series' last score
// doesn't match the scoreboard's final score, append a synthetic "End of
// Game" point snapped to it.
function withFinalScoreFallback<T extends PlayFields>(
  series: T[],
  finalHome: number | null,
  finalAway: number | null,
  extra?: (last: T) => Partial<T>,
): T[] {
  if (series.length === 0 || finalHome === null || finalAway === null) return series;
  const last = series[series.length - 1];
  if (last.homeScore === finalHome && last.awayScore === finalAway) return series;
  return [
    ...series,
    {
      ...last,
      ...(extra ? extra(last) : null),
      description: "End of Game",
      homeScore: finalHome,
      awayScore: finalAway,
    },
  ];
}

// Translates mouse position over the chart into a data index — a fraction
// of the hovered element's rendered width (0-1), independent of the SVG's
// internal viewBox units, so it's unaffected by the non-uniform CSS scaling
// `preserveAspectRatio="none"` applies. Hover state itself lives in the
// parent card so both the chart and the percentage/last-play text below it
// can react to the same index.
function hoverIndexFromEvent(e: { currentTarget: HTMLElement; clientX: number }, length: number): number {
  const rect = e.currentTarget.getBoundingClientRect();
  const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  return Math.round(fraction * (length - 1));
}

function TeamProbabilityRow({ team }: { team: ScoreboardTeam }) {
  return (
    <div className="flex items-center gap-2">
      {team.logoUrl && <img src={team.logoUrl} alt={team.displayName} className="h-6 w-6 object-contain" />}
      <span className="text-sm font-medium text-foreground/80">{team.abbreviation}</span>
      <span className="h-0.5 w-4 rounded" style={{ backgroundColor: team.accent }} />
    </div>
  );
}

// The fill/line color flips at the 50% baseline — same shape clipped to its
// top half (home color, home favored) vs bottom half (away color, away
// favored) rather than computing separate polygons per crossing.
function ProbabilityChart({
  series,
  homeColor,
  awayColor,
  hoverIndex,
  onHover,
}: {
  series: ProbabilityPoint[];
  homeColor: string;
  awayColor: string;
  hoverIndex: number | null;
  onHover: (index: number | null) => void;
}) {
  const clipId = useId();
  const baseline = CHART_HEIGHT / 2;
  // Top of the chart tracks the away team (whose row sits above it), bottom
  // tracks home — so the away row is high when the line is high, not when
  // home's win% happens to be low.
  const points = series.map((s, i) => ({
    x: (i / Math.max(series.length - 1, 1)) * CHART_WIDTH,
    y: (s.homeWinPct / 100) * CHART_HEIGHT,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  const areaPath = `${linePath} L${last.x.toFixed(1)},${baseline} L${first.x.toFixed(1)},${baseline} Z`;
  const ticks = periodTicks(series);
  const hovered = hoverIndex !== null ? points[hoverIndex] ?? null : null;

  return (
    <div className="px-4 py-2">
      <div
        className="relative"
        onMouseMove={(e) => onHover(hoverIndexFromEvent(e, series.length))}
        onMouseLeave={() => onHover(null)}
      >
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          className="h-36 w-full overflow-visible"
        >
          <defs>
            <clipPath id={`${clipId}-top`}>
              <rect x="0" y="0" width={CHART_WIDTH} height={baseline} />
            </clipPath>
            <clipPath id={`${clipId}-bottom`}>
              <rect x="0" y={baseline} width={CHART_WIDTH} height={baseline} />
            </clipPath>
          </defs>
          <line
            x1="0"
            y1={baseline}
            x2={CHART_WIDTH}
            y2={baseline}
            stroke="var(--border)"
            strokeDasharray="2,3"
            vectorEffect="non-scaling-stroke"
          />
          <path d={areaPath} fill={awayColor} opacity={0.18} clipPath={`url(#${clipId}-top)`} />
          <path d={areaPath} fill={homeColor} opacity={0.18} clipPath={`url(#${clipId}-bottom)`} />
          <path
            d={linePath}
            fill="none"
            stroke={awayColor}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            clipPath={`url(#${clipId}-top)`}
          />
          <path
            d={linePath}
            fill="none"
            stroke={homeColor}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            clipPath={`url(#${clipId}-bottom)`}
          />
        </svg>
        {/* Permanent marker on the final result — visible with or without
            hover, so the winner's end-of-game value is never missed. */}
        <div
          className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background"
          style={{
            left: `${(last.x / CHART_WIDTH) * 100}%`,
            top: `${(last.y / CHART_HEIGHT) * 100}%`,
            backgroundColor: last.y <= baseline ? awayColor : homeColor,
          }}
        />
        {hovered && (
          <>
            <div
              className="absolute top-0 bottom-0 w-px bg-border"
              style={{ left: `${(hovered.x / CHART_WIDTH) * 100}%` }}
            />
            <div
              className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground"
              style={{ left: `${(hovered.x / CHART_WIDTH) * 100}%`, top: `${(hovered.y / CHART_HEIGHT) * 100}%` }}
            />
          </>
        )}
      </div>
      <div className="relative mt-1 h-4 text-[10px] text-foreground/50">
        {ticks.map((t) => (
          <span key={t.label + t.x} className="absolute -translate-x-1/2" style={{ left: `${t.x * 100}%` }}>
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ESPN's play-by-play feed occasionally logs a play (e.g. a turnover) with a
// stale score snapshot lower than the previous play's — a score can only
// ever go up, so each line is forced to a running max to avoid a fake dip.
function runningMax(values: number[]): number[] {
  let max = -Infinity;
  return values.map((v) => (max = Math.max(max, v)));
}

function GameFlowChart({
  plays,
  homeColor,
  awayColor,
  hoverIndex,
  onHover,
}: {
  plays: PlayFields[];
  homeColor: string;
  awayColor: string;
  hoverIndex: number | null;
  onHover: (index: number | null) => void;
}) {
  const homeScores = runningMax(plays.map((p) => p.homeScore ?? 0));
  const awayScores = runningMax(plays.map((p) => p.awayScore ?? 0));
  const maxScore = Math.max(1, ...homeScores, ...awayScores);
  const toPoints = (scores: number[]) =>
    scores.map((score, i) => ({
      x: (i / Math.max(plays.length - 1, 1)) * CHART_WIDTH,
      y: CHART_HEIGHT - (score / maxScore) * CHART_HEIGHT,
    }));
  const homePoints = toPoints(homeScores);
  const awayPoints = toPoints(awayScores);
  const toPath = (points: { x: number; y: number }[]) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const ticks = periodTicks(plays);
  const hoveredHome = hoverIndex !== null ? homePoints[hoverIndex] ?? null : null;
  const hoveredAway = hoverIndex !== null ? awayPoints[hoverIndex] ?? null : null;

  return (
    <div className="px-4 py-2">
      <div
        className="relative"
        onMouseMove={(e) => onHover(hoverIndexFromEvent(e, plays.length))}
        onMouseLeave={() => onHover(null)}
      >
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          className="h-36 w-full overflow-visible"
        >
          <path d={toPath(awayPoints)} fill="none" stroke={awayColor} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <path
            d={toPath(homePoints)}
            fill="none"
            stroke={homeColor}
            strokeWidth={1.5}
            strokeDasharray="3,2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {hoveredHome && hoveredAway && (
          <>
            <div
              className="absolute top-0 bottom-0 w-px bg-border"
              style={{ left: `${(hoveredHome.x / CHART_WIDTH) * 100}%` }}
            />
            <div
              className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background"
              style={{
                left: `${(hoveredAway.x / CHART_WIDTH) * 100}%`,
                top: `${(hoveredAway.y / CHART_HEIGHT) * 100}%`,
                backgroundColor: awayColor,
              }}
            />
            <div
              className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background"
              style={{
                left: `${(hoveredHome.x / CHART_WIDTH) * 100}%`,
                top: `${(hoveredHome.y / CHART_HEIGHT) * 100}%`,
                backgroundColor: homeColor,
              }}
            />
          </>
        )}
      </div>
      <div className="relative mt-1 h-4 text-[10px] text-foreground/50">
        {ticks.map((t) => (
          <span key={t.label + t.x} className="absolute -translate-x-1/2" style={{ left: `${t.x * 100}%` }}>
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProbabilityGameFlowCard({
  away,
  home,
  plays,
  winProbability,
}: {
  away: ScoreboardTeam;
  home: ScoreboardTeam;
  plays: (PlayFields & { key: number })[];
  winProbability: WinProbabilityPoint[];
}) {
  const [tab, setTab] = useState<"winprob" | "gameflow">("winprob");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const scoredPlaysRaw = plays.filter((p) => p.homeScore !== null && p.awayScore !== null);
  if (scoredPlaysRaw.length === 0) return null;
  const scoredPlays = withFinalScoreFallback(scoredPlaysRaw, home.score, away.score);

  const probSeriesRaw = buildWinProbabilitySeries(plays, winProbability);
  const probSeries = withFinalScoreFallback(probSeriesRaw, home.score, away.score, (last) => ({
    homeWinPct:
      home.score !== null && away.score !== null
        ? home.score > away.score
          ? 100
          : home.score < away.score
            ? 0
            : last.homeWinPct
        : last.homeWinPct,
  }));
  const awayColor = away.accent;
  const homeColor = home.accent;

  // Each chart clamps the shared hover index against its own series length
  // independently — tab switching resets it, but this also keeps things
  // sane if the two series happen to differ in length.
  const gameFlowIndex = hoverIndex !== null ? Math.min(hoverIndex, scoredPlays.length - 1) : scoredPlays.length - 1;
  const hoveredProb =
    probSeries.length > 0 ? probSeries[hoverIndex !== null ? Math.min(hoverIndex, probSeries.length - 1) : probSeries.length - 1] : null;
  const homeWinPct = hoveredProb?.homeWinPct ?? null;
  const displayedPlay = tab === "winprob" && hoveredProb ? hoveredProb : scoredPlays[gameFlowIndex];

  let leadChanges = 0;
  let prevLeader: "home" | "away" | "tie" = "tie";
  scoredPlays.forEach((p) => {
    const diff = (p.homeScore ?? 0) - (p.awayScore ?? 0);
    const leader = diff > 0 ? "home" : diff < 0 ? "away" : "tie";
    if (leader !== "tie" && prevLeader !== "tie" && leader !== prevLeader) leadChanges++;
    if (leader !== "tie") prevLeader = leader;
  });

  const switchTab = (key: "winprob" | "gameflow") => {
    setTab(key);
    setHoverIndex(null);
  };

  const TABS: { key: "winprob" | "gameflow"; label: string }[] = [
    { key: "winprob", label: "Win Probability" },
    { key: "gameflow", label: "Game Flow" },
  ];

  return (
    <div className="w-full rounded-lg border border-border">
      <div className="px-4 pt-4">
        <h2 className="text-xs font-semibold tracking-wide text-foreground/60">PROBABILITIES & GAME FLOW</h2>
      </div>
      <div className="flex gap-1 px-4 pt-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`flex-1 rounded-full py-1.5 text-xs font-medium transition-colors ${
              tab === t.key ? "bg-accent text-accent-foreground" : "text-foreground/50 hover:text-foreground/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "winprob" ? (
        probSeries.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-foreground/50">Win probability not available for this game.</p>
        ) : (
          <>
            <div className="flex items-center justify-between px-4 pt-4">
              <TeamProbabilityRow team={away} />
              <span className="text-lg font-semibold text-foreground">{(100 - (homeWinPct ?? 50)).toFixed(1)}%</span>
            </div>
            <ProbabilityChart
              series={probSeries}
              homeColor={homeColor}
              awayColor={awayColor}
              hoverIndex={hoverIndex}
              onHover={setHoverIndex}
            />
            <div className="flex items-center justify-between px-4 pb-3">
              <TeamProbabilityRow team={home} />
              <span className="text-lg font-semibold text-foreground">{(homeWinPct ?? 50).toFixed(1)}%</span>
            </div>
          </>
        )
      ) : (
        <>
          <div className="flex items-center justify-between px-4 pt-4 text-sm">
            <div className="flex items-center gap-2">
              {away.logoUrl && <img src={away.logoUrl} alt={away.displayName} className="h-6 w-6 object-contain" />}
              <div>
                <div className="font-semibold text-foreground">{away.score}</div>
                <div className="text-xs text-foreground/50">{away.abbreviation}</div>
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-foreground">{leadChanges}</div>
              <div className="text-xs text-foreground/50">Lead Changes</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="font-semibold text-foreground">{home.score}</div>
                <div className="text-xs text-foreground/50">{home.abbreviation}</div>
              </div>
              {home.logoUrl && <img src={home.logoUrl} alt={home.displayName} className="h-6 w-6 object-contain" />}
            </div>
          </div>
          <GameFlowChart
            plays={scoredPlays}
            homeColor={homeColor}
            awayColor={awayColor}
            hoverIndex={hoverIndex}
            onHover={setHoverIndex}
          />
        </>
      )}

      <div className="border-t border-border/60 px-4 py-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-foreground/80">{displayedPlay.description ?? "—"}</span>
            <div className="mt-0.5 text-xs text-foreground/50">
              Q{displayedPlay.period} {displayedPlay.clock}
            </div>
          </div>
          <div className="flex shrink-0 gap-3 text-right">
            <div>
              <div className="tabular-nums text-foreground/80">{displayedPlay.awayScore}</div>
              <div className="text-xs text-foreground/50">{away.abbreviation}</div>
            </div>
            <div>
              <div className="tabular-nums text-foreground/80">{displayedPlay.homeScore}</div>
              <div className="text-xs text-foreground/50">{home.abbreviation}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-border/60 px-4 py-2 text-center text-xs text-foreground/40">
        According to ESPN Analytics
      </div>
    </div>
  );
}

// court-image.svg's viewBox: a 94x50ft NBA court at a flat 10px/ft, baskets
// drawn at (48,250) and (892,250). Shot coordinates are half-court feet
// relative to a single hoop (x: 0-50 cross-court, 25 = straight on; y:
// distance from the basket) — mirrored onto whichever basket the shooting
// team is drawn at here (away always left, home always right).
const SHOT_SVG_WIDTH = 940;
const SHOT_SVG_HEIGHT = 500;
const SHOT_SCALE = 10;
const LEFT_BASKET_X = 48;
const RIGHT_BASKET_X = 892;
const COURT_CENTER_Y = 250;

function shotPosition(shot: Shot, isAway: boolean): { leftPct: number; topPct: number } {
  const svgX = isAway ? LEFT_BASKET_X + shot.y * SHOT_SCALE : RIGHT_BASKET_X - shot.y * SHOT_SCALE;
  const svgY = COURT_CENTER_Y - (shot.x - 25) * SHOT_SCALE;
  return {
    leftPct: Math.min(100, Math.max(0, (svgX / SHOT_SVG_WIDTH) * 100)),
    topPct: Math.min(100, Math.max(0, (svgY / SHOT_SVG_HEIGHT) * 100)),
  };
}

function ShotChartFilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground/80 focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function LegendDot({ color, label, made }: { color: string; label: string; made: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: made ? color : "transparent", border: `1.5px solid ${color}` }}
      />
      <span>{label}</span>
    </div>
  );
}

function ShotChartCard({
  away,
  home,
  awayEspnId,
  homeEspnId,
  shots,
}: {
  away: ScoreboardTeam;
  home: ScoreboardTeam;
  awayEspnId: string;
  homeEspnId: string;
  shots: Shot[];
}) {
  const [quarterFilter, setQuarterFilter] = useState("all");
  const [playTypeFilter, setPlayTypeFilter] = useState("all");
  const [playerFilter, setPlayerFilter] = useState("all");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (shots.length === 0) return null;

  const quarters = Array.from(new Set(shots.map((s) => s.period).filter((p): p is number => p !== null))).sort(
    (a, b) => a - b,
  );
  const playTypes = Array.from(new Set(shots.map((s) => s.playType))).sort();
  const players = Array.from(new Set(shots.map((s) => s.playerName).filter((n): n is string => !!n))).sort();

  const filtered = shots.filter(
    (s) =>
      (quarterFilter === "all" || s.period === Number(quarterFilter)) &&
      (playTypeFilter === "all" || s.playType === playTypeFilter) &&
      (playerFilter === "all" || s.playerName === playerFilter),
  );

  const awayColor = away.accent;
  const homeColor = home.accent;

  return (
    <div className="w-full rounded-lg border border-border">
      <div className="px-4 pt-4">
        <h2 className="text-xs font-semibold tracking-wide text-foreground/60">SHOT CHART</h2>
      </div>
      <div className="flex flex-wrap gap-2 px-4 pt-3">
        <ShotChartFilterSelect
          value={quarterFilter}
          onChange={setQuarterFilter}
          options={[
            { value: "all", label: "All Quarters" },
            ...quarters.map((q) => ({ value: String(q), label: ordinalPeriodLabel(q - 1) })),
          ]}
        />
        <ShotChartFilterSelect
          value={playTypeFilter}
          onChange={setPlayTypeFilter}
          options={[{ value: "all", label: "All Play Types" }, ...playTypes.map((t) => ({ value: t, label: t }))]}
        />
        <ShotChartFilterSelect
          value={playerFilter}
          onChange={setPlayerFilter}
          options={[{ value: "all", label: "All Players" }, ...players.map((p) => ({ value: p, label: p }))]}
        />
      </div>
      <div className="relative mx-4 mt-3">
        <img src="/court-image.svg" alt="" className="block w-full rounded-md" />
        {home.logoUrl && (
          <img
            src={home.logoUrl}
            alt=""
            className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 object-contain opacity-80"
          />
        )}
        {filtered.map((shot) => {
          const isAway = shot.teamId === awayEspnId;
          const isHome = shot.teamId === homeEspnId;
          if (!isAway && !isHome) return null;
          const color = isAway ? awayColor : homeColor;
          const { leftPct, topPct } = shotPosition(shot, isAway);
          const isHovered = hoveredId === shot.playId;
          return (
            <div
              key={shot.playId}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform ${
                isHovered ? "z-10 h-3.5 w-3.5" : "h-2.5 w-2.5"
              }`}
              style={{
                left: `${leftPct}%`,
                top: `${topPct}%`,
                backgroundColor: shot.made ? color : "transparent",
                border: `1.5px solid ${color}`,
              }}
              onMouseEnter={() => setHoveredId(shot.playId)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {isHovered && (
                <div
                  className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-xs shadow-lg"
                  style={{ marginTop: "-6px" }}
                >
                  <div className="font-medium text-foreground">{shot.playerName ?? "Unknown"}</div>
                  <div className="text-foreground/60">
                    {shot.playType} · {shot.made ? "Made" : "Missed"}
                    {shot.period !== null && ` · ${ordinalPeriodLabel(shot.period - 1)}`}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4 px-4 py-3 text-xs text-foreground/60">
        <LegendDot color={awayColor} label="Shot Made" made />
        <LegendDot color={awayColor} label="Shot Missed" made={false} />
        <div className="flex items-center gap-2">
          {away.logoUrl && <img src={away.logoUrl} alt={away.displayName} className="h-5 w-5 object-contain" />}
          <span className="text-foreground/30">|</span>
          {home.logoUrl && <img src={home.logoUrl} alt={home.displayName} className="h-5 w-5 object-contain" />}
        </div>
        <LegendDot color={homeColor} label="Shot Made" made />
        <LegendDot color={homeColor} label="Shot Missed" made={false} />
      </div>
      <div className="border-t border-border/60 px-4 py-3 text-center">
        <Link href="?tab=playbyplay" className="text-sm text-foreground/60 hover:text-foreground">
          Full Play-By-Play
        </Link>
      </div>
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
    <div className="w-full rounded-lg border border-border">
      <div className="px-4 pt-4 pb-1">
        <h2 className="text-xs font-semibold tracking-wide text-foreground/60">MATCHUPS</h2>
      </div>
      <div className="flex items-center justify-around px-4 py-4">
        <div className="flex flex-col items-center gap-1">
          {away.logoUrl && <img src={away.logoUrl} alt={away.displayName} className="h-9 w-9 object-contain" />}
          <span className="text-xs text-foreground/60">{away.abbreviation}</span>
        </div>
        <div className="text-center">
          <div className="text-xs text-foreground/60">{seasonSeries.summary}</div>
          {seasonSeries.seriesScore && <div className="text-base font-bold text-foreground">{seasonSeries.seriesScore}</div>}
        </div>
        <div className="flex flex-col items-center gap-1">
          {home.logoUrl && <img src={home.logoUrl} alt={home.displayName} className="h-9 w-9 object-contain" />}
          <span className="text-xs text-foreground/60">{home.abbreviation}</span>
        </div>
      </div>
      <div className="divide-y divide-border/60 border-t border-border/60">
        {(() => {
          const rows = seasonSeries.events.map((event, i) => ({ event, i }));
          // Every finished meeting, plus just the single next one still to
          // come — not every remaining scheduled game in the series.
          const firstUpcoming = rows.findIndex(({ event }) => !event.completed);
          return firstUpcoming === -1 ? rows : rows.filter(({ i }) => i <= firstUpcoming);
        })().map(({ event, i }) => {
          const awaySide = event.home.abbreviation === away.abbreviation ? event.home : event.away;
          const homeSide = event.home.abbreviation === home.abbreviation ? event.home : event.away;
          return (
            <div key={event.espnId} className="flex items-center gap-2 px-4 py-3">
              <div className="w-10 text-lg text-right">
                <span className={awaySide.winner ? "font-semibold text-foreground" : "text-foreground/50"}>
                  {event.completed ? awaySide.score : awayRecord}
                </span>
              </div>
              <div className="flex-1 text-center">
                <div className="text-xs text-foreground/50">
                  Game {i + 1} @ {event.home.abbreviation}
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {event.completed ? event.statusDetail : formatMatchupDateTime(event.date)}
                </div>
                {event.completed ? (
                  <div className="text-xs text-foreground/50">{formatMatchupDate(event.date)}</div>
                ) : (
                  event.broadcasts.length > 0 && (
                    <div className="mt-1 flex justify-center gap-2">
                      {event.broadcasts.map((b) => (
                        <span key={b} className="rounded border border-border px-2 py-0.5 text-xs text-foreground/60">
                          {b}
                        </span>
                      ))}
                    </div>
                  )
                )}
              </div>
              <div className="flex w-10 items-center gap-1 text-lg">
                {homeSide.winner && <span className="text-foreground/50">{"›"}</span>}
                <span className={homeSide.winner ? "font-semibold text-foreground" : "text-foreground/50"}>
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
      <Link href={`/teams/${team.linkId}`} className="hover:text-foreground/80">
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
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen overflow-hidden border-y border-border bg-background">
      <div
        className="h-1 w-full"
        style={{ background: `linear-gradient(90deg, ${away.accent}, ${home.accent})` }}
      />
      <div className="relative">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(90deg, ${away.accent}26 0%, transparent 40%, transparent 60%, ${home.accent}26 100%)`,
          }}
        />
        <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-6">
          <div className="flex flex-1 items-center gap-4">
          {away.logoUrl && <img src={away.logoUrl} alt={away.displayName} className="h-14 w-14 shrink-0 object-contain" />}
          <div>
            <div className="font-semibold text-foreground leading-tight">
              <TeamName team={away} />
            </div>
            {linescores && (
              <div className="text-xs text-foreground/50 mt-0.5">
                {linescores.away.record}
                {linescores.away.splitRecord ? `, ${linescores.away.splitRecord} Away` : ""}
              </div>
            )}
          </div>
          <div className="ml-2 text-4xl font-bold tabular-nums text-foreground">{away.score ?? "-"}</div>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1 px-2">
          {statusDetail && <div className="text-sm font-medium text-foreground/80">{statusDetail}</div>}
          {linescores && periods > 0 && (
            <table className="text-xs text-foreground/60">
              <thead>
                <tr className="text-foreground/50">
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
                  <td className="px-1.5 font-semibold text-foreground/80">{away.abbreviation}</td>
                  {Array.from({ length: periods }, (_, i) => (
                    <td key={i} className="px-1.5 text-center">
                      {linescores.away.linescores[i] ?? ""}
                    </td>
                  ))}
                  <td className="px-1.5 text-center font-semibold text-foreground">{away.score ?? "-"}</td>
                </tr>
                <tr>
                  <td className="px-1.5 font-semibold text-foreground/80">{home.abbreviation}</td>
                  {Array.from({ length: periods }, (_, i) => (
                    <td key={i} className="px-1.5 text-center">
                      {linescores.home.linescores[i] ?? ""}
                    </td>
                  ))}
                  <td className="px-1.5 text-center font-semibold text-foreground">{home.score ?? "-"}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-1 items-center justify-end gap-4">
          <div className="mr-2 text-4xl font-bold tabular-nums text-foreground">{home.score ?? "-"}</div>
          <div>
            <div className="font-semibold text-foreground leading-tight">
              <TeamName team={home} />
            </div>
            {linescores && (
              <div className="text-xs text-foreground/50 mt-0.5">
                {linescores.home.record}
                {linescores.home.splitRecord ? `, ${linescores.home.splitRecord} Home` : ""}
              </div>
            )}
          </div>
          {home.logoUrl && <img src={home.logoUrl} alt={home.displayName} className="h-14 w-14 shrink-0 object-contain" />}
        </div>
        </div>
      </div>
      <TabPager tabs={tabs} activeTab={activeTab} onChange={onTabChange} accentColor={home.accent} />
    </div>
  );
}
