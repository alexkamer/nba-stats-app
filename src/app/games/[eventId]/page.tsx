"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTheme } from "next-themes";
import { Suspense, useId, useState, type ReactNode } from "react";
import { TabPager, useTabQueryParam } from "@/components/TabPager";
import { FullBleed } from "@/components/FullBleed";
import { useBreadcrumbLabel } from "@/components/Breadcrumb";
import { getTeamAccent } from "@/lib/team-accent";
import { GamePerformanceCard, type TeamPerformanceSummary } from "@/components/GamePerformanceCard";
import { SkeletonDetailPage } from "@/components/Skeleton";

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

// Never persisted (SPEC.md Sec 6 has no column for it) — pulled live from
// ESPN for both DB- and live-sourced games, same as HeaderExtras. The body
// is already stripped to plain paragraphs server-side; this page never
// renders raw HTML.
interface RecapArticle {
  headline: string;
  description: string | null;
  source: string | null;
  publishedAt: string | null;
  paragraphs: string[];
}

// Never persisted — the full set of ESPN-labeled team stat categories,
// beyond the handful of fields SPEC.md Sec 6 persists per team.
interface TeamStatCategory {
  name: string;
  label: string;
  awayDisplay: string;
  homeDisplay: string;
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

// Pre-game-only data (see openspec/changes/add-pregame-preview) — attached
// to the live-sourced game shape only while the game is still scheduled
// (the DB-backed shape never carries it, since only FINAL games are served
// from the DB). Lineups are depth-chart-derived (ESPN's summary carries no
// confirmed-starters field pre-tipoff), always labeled "Projected".
interface ProjectedStarter {
  espnId: string;
  displayName: string;
  position: string | null;
}

interface AvailabilityEntry {
  playerId: number;
  displayName: string;
  status: "OUT" | "DOUBTFUL" | "QUESTIONABLE" | "PROBABLE" | "AVAILABLE";
  comment: string | null;
}

interface PlayerPropPreview {
  playerId: number;
  playerName: string;
  statType: string;
  projectedValue: number;
  line: number;
  lean: "OVER" | "UNDER" | "PUSH";
  odds: number | null;
}

interface GamePreview {
  projection: { projectedHomeScore: number; projectedAwayScore: number; homeWinPct: number | null; awayWinPct: number | null } | null;
  availability: { home: AvailabilityEntry[]; away: AvailabilityEntry[] } | null;
  lineups: { home: ProjectedStarter[] | null; away: ProjectedStarter[] | null };
  playerProps: PlayerPropPreview[];
  article: RecapArticle | null;
  // ESPN's own win-probability model, shown separately from our
  // GameProjection-derived win% above — the two are independent and can
  // disagree, so they must never be visually conflated (see
  // openspec/changes/add-pregame-preview/design.md).
  espnPredictor: { homeWinPct: number; awayWinPct: number } | null;
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
    player: {
      id: number;
      displayName: string;
      headshotUrl: string | null;
      jersey: string | null;
      position: { abbreviation: string } | null;
    };
  })[];
  plays: PlayFields[];
  odds: DbOdds | null;
  headerExtras: HeaderExtras | null;
  winProbability: WinProbabilityPoint[] | null;
  shots: Shot[] | null;
  recap: RecapArticle | null;
  teamStatsBreakdown: TeamStatCategory[] | null;
  homePerformance: TeamPerformanceSummary | null;
  awayPerformance: TeamPerformanceSummary | null;
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
    position: string | null;
  })[];
  plays: PlayFields[];
  odds: LiveOdds | null;
  headerExtras: HeaderExtras;
  winProbability: WinProbabilityPoint[];
  shots: Shot[];
  recap: RecapArticle | null;
  teamStatsBreakdown: TeamStatCategory[] | null;
  preview?: GamePreview;
}

interface TeamStatFields {
  points: number | null;
  rebounds: number | null;
  offensiveRebounds: number | null;
  defensiveRebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
  fouls: number | null;
  fgMade: number | null;
  fgAtt: number | null;
  threeMade: number | null;
  threeAtt: number | null;
  ftMade: number | null;
  ftAtt: number | null;
}

interface PlayerStatFields {
  starter: boolean | null;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  offensiveRebounds: number | null;
  defensiveRebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
  fouls: number | null;
  fgMade: number | null;
  fgAtt: number | null;
  threeMade: number | null;
  threeAtt: number | null;
  ftMade: number | null;
  ftAtt: number | null;
  plusMinus: number | null;
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
  teamId?: number | null;
  teamEspnId?: string | null;
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

type TabKey = "gamecast" | "recap" | "boxscore" | "playbyplay" | "teamstats" | "preview" | "odds";

const GAME_TABS: { value: TabKey; label: string }[] = [
  { value: "gamecast", label: "Gamecast" },
  { value: "recap", label: "Recap" },
  { value: "boxscore", label: "Box Score" },
  { value: "playbyplay", label: "Play-by-Play" },
  { value: "teamstats", label: "Team Stats" },
];

// Shown instead of GAME_TABS while a game is still scheduled — recap/box
// score/play-by-play/team stats have nothing to show before tip-off (see
// game-pregame-preview spec's tab-visibility requirement). The "gamecast"
// key is shared with GAME_TABS (its content differs by game state); the
// "preview"/"odds" keys only ever appear in this set.
const PREGAME_TABS: { value: TabKey; label: string }[] = [
  { value: "gamecast", label: "Gamecast" },
  { value: "preview", label: "Preview" },
  { value: "odds", label: "Odds" },
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
    <Suspense fallback={<SkeletonDetailPage />}>
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
  const [activeTab, setActiveTab] = useTabQueryParam<TabKey>("boxscore");
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";

  useBreadcrumbLabel(
    data
      ? data.source === "db"
        ? `${(data.game as DbGame).awayTeam.abbreviation} @ ${(data.game as DbGame).homeTeam.abbreviation}`
        : `${(data.game as LiveGame).away.abbreviation} @ ${(data.game as LiveGame).home.abbreviation}`
      : null,
  );

  if (isLoading) return <SkeletonDetailPage />;
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

  // `sortByPoints` serves Game Leaders (wants the top scorer/rebounder/
  // assister regardless of lineup slot); box score tables instead keep
  // ESPN's own starters-then-bench ordering, so they skip the points sort.
  const playerRowsByTeam = (
    teamAbbreviation: string,
    teamLinkId: number | null,
    { sortByPoints = true }: { sortByPoints?: boolean } = {},
  ) => {
    const rows =
      source === "db"
        ? (game as DbGame).playerGameStats
            .filter((p) => p.teamId === teamLinkId)
            .map((p) => ({
              key: p.id,
              linkId: p.player.id,
              name: p.player.displayName,
              headshotUrl: p.player.headshotUrl,
              jersey: p.player.jersey,
              positionAbbr: p.player.position?.abbreviation ?? null,
              ...p,
            }))
        : (() => {
            const liveHome = (game as LiveGame).home;
            const liveAway = (game as LiveGame).away;
            const targetEspnId = teamAbbreviation === liveHome.abbreviation ? liveHome.espnId : liveAway.espnId;
            return (game as LiveGame).playerGameStats
              .filter((p) => p.teamEspnId === targetEspnId)
              .map((p, i) => ({ key: i, linkId: null, name: p.playerDisplayName, positionAbbr: p.position, ...p }));
          })();
    return sortByPoints ? [...rows].sort((a, b) => (b.points ?? 0) - (a.points ?? 0)) : rows;
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

  const plays = sortPlaysChronologically(game.plays).map((p, i) => {
    let side: "home" | "away" | null = null;
    if (source === "db") {
      if (p.teamId === (game as DbGame).homeTeam.id) side = "home";
      else if (p.teamId === (game as DbGame).awayTeam.id) side = "away";
    } else {
      if (p.teamEspnId === (game as LiveGame).home.espnId) side = "home";
      else if (p.teamEspnId === (game as LiveGame).away.espnId) side = "away";
    }
    return { ...p, key: p.id ?? i, side };
  });
  const winProbability = (game as DbGame | LiveGame).winProbability ?? [];
  const shots = (game as DbGame | LiveGame).shots ?? [];
  const recap = (game as DbGame | LiveGame).recap;
  const teamStatsBreakdown = (game as DbGame | LiveGame).teamStatsBreakdown;
  const awayEspnId = source === "db" ? (game as DbGame).awayTeam.espnId : (game as LiveGame).away.espnId;
  const homeEspnId = source === "db" ? (game as DbGame).homeTeam.espnId : (game as LiveGame).home.espnId;
  // Only ever present for DB-sourced (final, regular-season, graded) games — route.ts omits it otherwise.
  const awayPerformance = source === "db" ? (game as DbGame).awayPerformance : null;
  const homePerformance = source === "db" ? (game as DbGame).homePerformance : null;

  const awayPlayerRows = playerRowsByTeam(away.abbreviation, away.linkId);
  const homePlayerRows = playerRowsByTeam(home.abbreviation, home.linkId);
  const awayTeamStats = teamRows.find((r) => r.abbreviation === away.abbreviation) ?? null;
  const homeTeamStats = teamRows.find((r) => r.abbreviation === home.abbreviation) ?? null;

  // The Preview tab's data only exists on the live-sourced shape, and only
  // while the game is scheduled (route.ts only attaches it in that case).
  // Its presence, not a separate status flag, is what the UI keys off of.
  const preview = source === "live" ? (game as LiveGame).preview ?? null : null;
  const isScheduled = preview !== null;
  const visibleTabs = isScheduled ? PREGAME_TABS : GAME_TABS;
  // `activeTab` reflects the URL's `?tab=` (or its static default) with no
  // knowledge of which tabs apply to this game — fall back to this game's
  // first visible tab whenever the requested one isn't actually shown
  // (e.g. a bookmarked `?tab=boxscore` for a game that's since gone final,
  // or simply loading a scheduled game with no `?tab=` at all).
  const displayTab = visibleTabs.some((t) => t.value === activeTab) ? activeTab : visibleTabs[0].value;

  return (
    <div className="space-y-8">
      <ScoreboardHeader
        away={away}
        home={home}
        statusDetail={statusDetail}
        linescores={headerExtras}
        tabs={visibleTabs}
        activeTab={displayTab}
        onTabChange={setActiveTab}
      />

      {displayTab === "gamecast" &&
        (isScheduled && preview ? (
          <PregameGamecastTab
            away={away}
            home={home}
            preview={preview}
            odds={odds}
            gameInfo={headerExtras?.gameInfo ?? null}
            gameDate={game.date}
            seasonSeries={headerExtras?.seasonSeries ?? null}
            awayRecord={headerExtras?.away.record ?? null}
            homeRecord={headerExtras?.home.record ?? null}
          />
        ) : (
          // Full-bleed, same trick as ScoreboardHeader: this grid needs the
          // whole content area's width for its 3-column layout, not just
          // <main>'s centered max-w-6xl column.
          <FullBleed className="px-6">
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
                <GamePerformanceCard away={away} home={home} awayPerformance={awayPerformance} homePerformance={homePerformance} />
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
          </FullBleed>
        ))}

      {displayTab === "preview" && preview && (
        <PreviewArticleTab away={away} home={home} article={preview.article} gameDate={game.date} />
      )}
      {displayTab === "recap" && <RecapTab away={away} home={home} recap={recap} />}
      {displayTab === "teamstats" && <TeamStatsTab away={away} home={home} teamStatsBreakdown={teamStatsBreakdown} />}

      {displayTab === "odds" && preview && (
        <OddsAndPropsTab away={away} home={home} odds={odds} playerProps={preview.playerProps} />
      )}

      {displayTab === "boxscore" && (
        <>
          {odds && <OddsTable away={away} home={home} odds={odds} />}

          {teamRows.every((s) => s.points === null) ? (
            <p className="text-foreground/72 text-sm">
              No box score yet{source === "live" ? ` — ${(game as LiveGame).statusDetail}` : ""}.
            </p>
          ) : (
            [away, home].map((team) => {
              const rows = playerRowsByTeam(team.abbreviation, team.linkId, { sortByPoints: false });
              const teamStats = teamRows.find((r) => r.abbreviation === team.abbreviation) ?? null;
              if (rows.length === 0) return null;
              return <BoxScoreTeamTable key={team.abbreviation} team={team} rows={rows} teamStats={teamStats} />;
            })
          )}
        </>
      )}

      {displayTab === "playbyplay" && <PlayByPlayTab away={away} home={home} plays={plays} />}
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

// No image here — article.images from ESPN's summary payload are generic
// cross-promotional thumbnails, frequently unrelated to the actual game
// (design.md). A team-colored score banner stands in for the hero image
// instead of leaving the tab bare text.
// Shared by RecapTab (post-game) and PreviewArticleTab (pregame) — same
// ESPN `article` shape either way, just a different `type` filter upstream
// (see extractRecap/extractPreviewArticle) and a different banner/empty
// message for each tab's own context.
function ArticleTab({
  away,
  home,
  article,
  emptyMessage,
  banner,
}: {
  away: ScoreboardTeam;
  home: ScoreboardTeam;
  article: RecapArticle | null;
  emptyMessage: string;
  banner: ReactNode;
}) {
  if (!article) return <p className="text-foreground/72 text-sm">{emptyMessage}</p>;

  const byline = [article.source, article.publishedAt ? formatGameDateTime(article.publishedAt) : null]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${away.accent}, ${home.accent})` }} />
        <div
          className="flex items-center justify-center gap-8 px-6 py-5"
          style={{
            background: `linear-gradient(90deg, ${away.accent}1a 0%, transparent 45%, transparent 55%, ${home.accent}1a 100%)`,
          }}
        >
          <div className="flex flex-col items-center gap-1">
            {away.logoUrl && <img src={away.logoUrl} alt={away.displayName} className="h-12 w-12 object-contain" />}
            <span className="text-sm font-semibold text-foreground">{away.abbreviation}</span>
          </div>
          {banner}
          <div className="flex flex-col items-center gap-1">
            {home.logoUrl && <img src={home.logoUrl} alt={home.displayName} className="h-12 w-12 object-contain" />}
            <span className="text-sm font-semibold text-foreground">{home.abbreviation}</span>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold leading-tight text-foreground">{article.headline}</h2>
        {byline && <p className="mt-2 text-sm text-foreground/72">{byline}</p>}
      </div>

      <div className="space-y-4 text-[15px] leading-relaxed text-foreground/92">
        {article.paragraphs.map((paragraph, i) => (
          <p
            key={i}
            className={
              i === 0
                ? "first-letter:float-left first-letter:mr-1 first-letter:text-4xl first-letter:font-bold first-letter:leading-none first-letter:text-foreground"
                : undefined
            }
          >
            {paragraph}
          </p>
        ))}
      </div>
    </section>
  );
}

function RecapTab({ away, home, recap }: { away: ScoreboardTeam; home: ScoreboardTeam; recap: RecapArticle | null }) {
  return (
    <ArticleTab
      away={away}
      home={home}
      article={recap}
      emptyMessage="No recap available for this game."
      banner={
        <div className="text-center">
          <div className="text-2xl font-bold tabular-nums text-foreground">
            {away.score} – {home.score}
          </div>
          <div className="text-xs text-foreground/72">Final</div>
        </div>
      }
    />
  );
}

function PreviewArticleTab({
  away,
  home,
  article,
  gameDate,
}: {
  away: ScoreboardTeam;
  home: ScoreboardTeam;
  article: RecapArticle | null;
  gameDate: string;
}) {
  return (
    <ArticleTab
      away={away}
      home={home}
      article={article}
      emptyMessage="No preview available for this game."
      banner={
        <div className="text-center">
          <div className="text-sm font-semibold tabular-nums text-foreground">{formatGameDateTime(gameDate)}</div>
          <div className="text-xs text-foreground/72">Preview</div>
        </div>
      }
    />
  );
}

function TeamStatsTab({
  away,
  home,
  teamStatsBreakdown,
}: {
  away: ScoreboardTeam;
  home: ScoreboardTeam;
  teamStatsBreakdown: TeamStatCategory[] | null;
}) {
  if (!teamStatsBreakdown) {
    return <p className="text-foreground/72 text-sm">Team stats are not yet available for this game.</p>;
  }

  return (
    <section className="mx-auto max-w-2xl">
      <h2 className="text-lg font-medium text-foreground/92 mb-3 text-center">Team Stats</h2>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-foreground/72">
            <th className="py-2.5 pr-2 w-28 text-right border-b border-border">
              <span className="inline-flex items-center justify-end gap-2">
                {away.logoUrl && <img src={away.logoUrl} alt={away.displayName} className="h-5 w-5 object-contain" />}
                {away.abbreviation}
              </span>
            </th>
            <th className="py-2.5 px-3 border-b border-border" />
            <th className="py-2.5 pl-2 w-28 text-left border-b border-border">
              <span className="inline-flex items-center gap-2">
                {home.logoUrl && <img src={home.logoUrl} alt={home.displayName} className="h-5 w-5 object-contain" />}
                {home.abbreviation}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {teamStatsBreakdown.map((row) => (
            <tr key={row.name} className="border-b border-border/60">
              <td className="py-2.5 pr-2 text-right font-medium text-foreground/92">{row.awayDisplay}</td>
              <td className="py-2.5 px-3 text-center text-xs text-foreground/72">{row.label}</td>
              <td className="py-2.5 pl-2 text-left font-medium text-foreground/92">{row.homeDisplay}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const AVAILABILITY_STATUS_LABEL: Record<AvailabilityEntry["status"], string> = {
  OUT: "Out",
  DOUBTFUL: "Doubtful",
  QUESTIONABLE: "Questionable",
  PROBABLE: "Probable",
  AVAILABLE: "Available",
};

function ProjectionSummaryCard({
  away,
  home,
  projection,
  odds,
}: {
  away: ScoreboardTeam;
  home: ScoreboardTeam;
  projection: NonNullable<GamePreview["projection"]>;
  odds: NormalizedOdds | null;
}) {
  const side = (team: ScoreboardTeam, score: number, winPct: number | null) => (
    <div className="flex flex-col items-center gap-1">
      {team.logoUrl && <img src={team.logoUrl} alt={team.displayName} className="h-10 w-10 object-contain" />}
      <span className="text-sm font-semibold text-foreground">{team.abbreviation}</span>
      <span className="text-xl font-bold tabular-nums text-foreground">{score.toFixed(1)}</span>
      {winPct !== null && <span className="text-xs text-foreground/72">{winPct.toFixed(0)}% to win</span>}
    </div>
  );

  return (
    <div className="rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground/92 mb-3">Projection</h2>
      <div className="flex items-center justify-around gap-4">
        {side(away, projection.projectedAwayScore, projection.awayWinPct)}
        <span className="text-xs text-foreground/72">PROJECTED</span>
        {side(home, projection.projectedHomeScore, projection.homeWinPct)}
      </div>
      {odds && (
        <p className="mt-3 text-center text-xs text-foreground/72">
          Market: {odds.homeIsFavorite ? home.abbreviation : away.abbreviation}{" "}
          {formatSigned(odds.homeIsFavorite ? odds.homeSpread : odds.awaySpread)}
          {odds.overUnder !== null && ` · O/U ${odds.overUnder}`}
        </p>
      )}
    </div>
  );
}

// ESPN's own "Matchup Predictor" win%, shown as its own container below
// ProjectionSummaryCard rather than merged into it - the two are
// independent models (ours is score-margin-derived, ESPN's is their own)
// and can disagree, so they stay visually and structurally separate.
// A short blurb pulled from the pregame preview article's own headline and
// description (distinct from its full body, which lives on the Preview
// tab) — not a card of its own, just context sitting above the
// projection/predictor cards in the Gamecast dashboard's middle column.
function PreviewBlurb({ article }: { article: RecapArticle | null }) {
  if (!article) return null;
  const byline = [article.publishedAt ? formatGameDateTime(article.publishedAt) : null, article.source]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  return (
    <div className="rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground mb-1">{article.headline}</h2>
      {article.description && <p className="text-sm text-foreground/82 mb-2">{article.description}</p>}
      {byline && <p className="text-xs text-foreground/72">{byline}</p>}
    </div>
  );
}

function EspnPredictorCard({
  away,
  home,
  predictor,
}: {
  away: ScoreboardTeam;
  home: ScoreboardTeam;
  predictor: NonNullable<GamePreview["espnPredictor"]>;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground/92 mb-3">ESPN Predictor</h2>
      <div className="flex items-center justify-around gap-4">
        <div className="flex flex-col items-center gap-1">
          {away.logoUrl && <img src={away.logoUrl} alt={away.displayName} className="h-8 w-8 object-contain" />}
          <span className="text-sm font-semibold text-foreground">{away.abbreviation}</span>
          <span className="text-lg font-bold tabular-nums text-foreground">{predictor.awayWinPct.toFixed(1)}%</span>
        </div>
        <span className="text-xs text-foreground/72">TO WIN</span>
        <div className="flex flex-col items-center gap-1">
          {home.logoUrl && <img src={home.logoUrl} alt={home.displayName} className="h-8 w-8 object-contain" />}
          <span className="text-sm font-semibold text-foreground">{home.abbreviation}</span>
          <span className="text-lg font-bold tabular-nums text-foreground">{predictor.homeWinPct.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

function LineupPanel({ team, starters }: { team: ScoreboardTeam; starters: ProjectedStarter[] | null }) {
  if (!starters) return null;
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center gap-2 mb-3">
        {team.logoUrl && <img src={team.logoUrl} alt={team.displayName} className="h-5 w-5 object-contain" />}
        <h3 className="text-sm font-semibold text-foreground/92">{team.abbreviation} Projected Starters</h3>
      </div>
      <ul className="space-y-1.5 text-sm text-foreground/92">
        {starters.map((starter) => (
          <li key={starter.espnId} className="flex items-center justify-between">
            <span>{starter.displayName}</span>
            {starter.position && <span className="text-xs text-foreground/72">{starter.position}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AvailabilityPanel({ team, entries }: { team: ScoreboardTeam; entries: AvailabilityEntry[] }) {
  const flagged = entries.filter((entry) => entry.status !== "AVAILABLE");
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center gap-2 mb-3">
        {team.logoUrl && <img src={team.logoUrl} alt={team.displayName} className="h-5 w-5 object-contain" />}
        <h3 className="text-sm font-semibold text-foreground/92">{team.abbreviation} Availability</h3>
      </div>
      {flagged.length === 0 ? (
        <p className="text-sm text-foreground/72">No reported availability concerns.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {flagged.map((entry) => (
            <li key={entry.playerId}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground/92">{entry.displayName}</span>
                <span className="text-xs font-semibold text-foreground/72">{AVAILABILITY_STATUS_LABEL[entry.status]}</span>
              </div>
              {entry.comment && <p className="mt-0.5 text-xs text-foreground/72">{entry.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Pregame counterpart to the live Gamecast tab's 3-column FullBleed grid —
// same layout, with cards that have pregame data in place of the
// live-only ones (game leaders, this-game team stats, win-probability
// flow, shot chart) that have nothing to show before tip-off.
function PregameGamecastTab({
  away,
  home,
  preview,
  odds,
  gameInfo,
  gameDate,
  seasonSeries,
  awayRecord,
  homeRecord,
}: {
  away: ScoreboardTeam;
  home: ScoreboardTeam;
  preview: GamePreview;
  odds: NormalizedOdds | null;
  gameInfo: GameInfo | null;
  gameDate: string;
  seasonSeries: SeasonSeries | null;
  awayRecord: string | null;
  homeRecord: string | null;
}) {
  return (
    <FullBleed className="px-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr_340px]">
        <div className="space-y-6">
          <LineupPanel team={away} starters={preview.lineups.away} />
          <LineupPanel team={home} starters={preview.lineups.home} />
        </div>
        <div className="space-y-6">
          <PreviewBlurb article={preview.article} />
          {preview.projection && (
            <ProjectionSummaryCard away={away} home={home} projection={preview.projection} odds={odds} />
          )}
          {preview.espnPredictor && (
            <EspnPredictorCard away={away} home={home} predictor={preview.espnPredictor} />
          )}
          {preview.availability && (
            <>
              <AvailabilityPanel team={away} entries={preview.availability.away} />
              <AvailabilityPanel team={home} entries={preview.availability.home} />
            </>
          )}
        </div>
        <div className="space-y-6">
          {gameInfo && <GameInformationCard date={gameDate} gameInfo={gameInfo} />}
          {seasonSeries && (
            <MatchupsCard
              away={away}
              home={home}
              awayRecord={awayRecord}
              homeRecord={homeRecord}
              seasonSeries={seasonSeries}
            />
          )}
        </div>
      </div>
    </FullBleed>
  );
}

function OddsTable({ away, home, odds }: { away: ScoreboardTeam; home: ScoreboardTeam; odds: NormalizedOdds }) {
  const rows = [
    { team: away, spread: odds.awaySpread, moneyline: odds.awayMoneyline, isFavorite: !odds.homeIsFavorite },
    { team: home, spread: odds.homeSpread, moneyline: odds.homeMoneyline, isFavorite: odds.homeIsFavorite },
  ];
  return (
    <section className="max-w-md rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground/92">Odds</h2>
        <span className="text-xs text-foreground/60">{odds.provider}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-border pb-1.5 text-xs font-medium text-foreground/60">
        <span>Team</span>
        <span className="text-right">Spread</span>
        <span className="text-right">Moneyline</span>
      </div>
      {rows.map(({ team, spread, moneyline, isFavorite }) => (
        <div
          key={team.abbreviation}
          className="-mx-2 grid grid-cols-[1fr_auto_auto] items-center gap-x-4 rounded-md px-2 py-2"
          style={isFavorite ? { backgroundColor: `${team.accent}14` } : undefined}
        >
          <span className="flex items-center gap-2">
            {team.logoUrl && <img src={team.logoUrl} alt={team.displayName} className="h-5 w-5 object-contain" />}
            {team.linkId ? (
              <Link
                href={`/teams/${team.linkId}`}
                className={`text-sm hover:text-accent ${isFavorite ? "font-semibold text-foreground" : "text-foreground/85"}`}
              >
                {team.abbreviation}
              </Link>
            ) : (
              <span className={`text-sm ${isFavorite ? "font-semibold text-foreground" : "text-foreground/85"}`}>
                {team.abbreviation}
              </span>
            )}
            {isFavorite && (
              <span className="rounded border border-border bg-foreground/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/72">
                Favorite
              </span>
            )}
          </span>
          <span className="text-right text-sm tabular-nums text-foreground/92">{formatSigned(spread) || "—"}</span>
          <span className="text-right text-sm tabular-nums text-foreground/92">{formatSigned(moneyline) || "—"}</span>
        </div>
      ))}
      {odds.overUnder !== null && (
        <div className="mt-3 flex items-center justify-between rounded-md bg-foreground/5 px-3 py-2">
          <span className="text-xs font-medium text-foreground/72">Total (O/U)</span>
          <span className="text-sm font-semibold tabular-nums text-foreground/92">{odds.overUnder}</span>
        </div>
      )}
    </section>
  );
}

const PROP_STAT_LABEL: Record<string, string> = {
  POINTS: "Points",
  REBOUNDS: "Rebounds",
  ASSISTS: "Assists",
  THREE_POINTERS_MADE: "3PT Made",
  STEALS: "Steals",
  BLOCKS: "Blocks",
  POINTS_ASSISTS: "Pts + Ast",
  POINTS_REBOUNDS: "Pts + Reb",
  REBOUNDS_ASSISTS: "Reb + Ast",
  POINTS_REBOUNDS_ASSISTS: "Pts + Reb + Ast",
};

const LEAN_BADGE_CLASSES: Record<PlayerPropPreview["lean"], string> = {
  OVER: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  UNDER: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  PUSH: "bg-foreground/10 text-foreground/72",
};

function OddsAndPropsTab({
  away,
  home,
  odds,
  playerProps,
}: {
  away: ScoreboardTeam;
  home: ScoreboardTeam;
  odds: NormalizedOdds | null;
  playerProps: PlayerPropPreview[];
}) {
  if (!odds && playerProps.length === 0) {
    return <p className="text-foreground/72 text-sm">No odds or player props available for this game.</p>;
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      {odds && <OddsTable away={away} home={home} odds={odds} />}
      {playerProps.length > 0 && <PlayerPropsTable playerProps={playerProps} />}
    </section>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active ? "bg-accent text-accent-foreground" : "border border-border text-foreground/72 hover:text-foreground/92"
      }`}
    >
      {label}
    </button>
  );
}

function PlayerPropsTable({ playerProps }: { playerProps: PlayerPropPreview[] }) {
  const [filter, setFilter] = useState<string>("ALL");

  const statTypes = Array.from(new Set(playerProps.map((prop) => prop.statType)));
  const filtered = filter === "ALL" ? playerProps : playerProps.filter((prop) => prop.statType === filter);
  const sorted = [...filtered].sort(
    (a, b) => Math.abs(b.projectedValue - b.line) - Math.abs(a.projectedValue - a.line),
  );

  return (
    <div>
      <h2 className="mb-3 text-lg font-medium text-foreground/92">Player Props</h2>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <FilterChip label="All" active={filter === "ALL"} onClick={() => setFilter("ALL")} />
        {statTypes.map((statType) => (
          <FilterChip
            key={statType}
            label={PROP_STAT_LABEL[statType] ?? statType}
            active={filter === statType}
            onClick={() => setFilter(statType)}
          />
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-foreground/60">
              <th className="border-b border-border py-2 pl-3 pr-2 font-medium">Player</th>
              <th className="border-b border-border py-2 pr-2 font-medium">Stat</th>
              <th className="border-b border-border py-2 pr-2 text-right font-medium">Line</th>
              <th className="border-b border-border py-2 pr-2 text-right font-medium">Proj</th>
              <th className="border-b border-border py-2 pr-2 text-right font-medium">Edge</th>
              <th className="border-b border-border py-2 pr-3 text-right font-medium">Lean</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((prop) => {
              const edge = prop.projectedValue - prop.line;
              return (
                <tr
                  key={`${prop.playerId}-${prop.statType}`}
                  className="border-b border-border/60 last:border-0 hover:bg-foreground/[0.03]"
                >
                  <td className="py-2 pl-3 pr-2 text-foreground/92">
                    <Link href={`/players/${prop.playerId}`} className="hover:text-accent">
                      {prop.playerName}
                    </Link>
                  </td>
                  <td className="py-2 pr-2 text-foreground/72">
                    <Link
                      href={`/betting/research/${prop.playerId}?stat=${prop.statType}`}
                      className="hover:text-accent"
                    >
                      {PROP_STAT_LABEL[prop.statType] ?? prop.statType}
                    </Link>
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-foreground/92">{prop.line}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-foreground/92">
                    {prop.projectedValue.toFixed(1)}
                  </td>
                  <td
                    className={`py-2 pr-2 text-right font-medium tabular-nums ${
                      edge > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : edge < 0
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-foreground/60"
                    }`}
                  >
                    {edge > 0 ? "+" : ""}
                    {edge.toFixed(1)}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <span
                      className={`inline-block rounded px-2 py-1 text-xs font-semibold tabular-nums ${LEAN_BADGE_CLASSES[prop.lean]}`}
                    >
                      {prop.lean}
                      {prop.odds !== null ? ` ${formatSigned(prop.odds)}` : ""}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface BoxScoreRow extends PlayerStatFields {
  key: string | number;
  linkId: number | null;
  name: string;
  positionAbbr: string | null;
}

const BOX_SCORE_COLUMNS: { key: string; label: string }[] = [
  { key: "min", label: "MIN" },
  { key: "fg", label: "FG" },
  { key: "3pt", label: "3PT" },
  { key: "ft", label: "FT" },
  { key: "oreb", label: "OREB" },
  { key: "dreb", label: "DREB" },
  { key: "reb", label: "REB" },
  { key: "ast", label: "AST" },
  { key: "stl", label: "STL" },
  { key: "blk", label: "BLK" },
  { key: "to", label: "TO" },
  { key: "pf", label: "PF" },
  { key: "plusminus", label: "+/-" },
  { key: "pts", label: "PTS" },
];

function BoxScorePlayerRow({ row }: { row: BoxScoreRow }) {
  // The ingest mapper (and its live-proxy counterpart) leave every stat
  // null and minutes at 0 specifically to mean "didn't play" — distinct
  // from an actual 0-minute/0-stat line, which can't happen.
  const didNotPlay = row.minutes === 0 && row.points === null;
  return (
    <tr className="border-b border-border/60">
      <td className="py-2 pr-2">
        {row.linkId ? (
          <Link href={`/players/${row.linkId}`} className="font-medium text-foreground/92 hover:text-foreground">
            {row.name}
          </Link>
        ) : (
          <span className="font-medium text-foreground/92">{row.name}</span>
        )}
        {row.positionAbbr && <span className="ml-1 text-foreground/62">{row.positionAbbr}</span>}
      </td>
      {didNotPlay ? (
        <td colSpan={BOX_SCORE_COLUMNS.length} className="py-2 text-foreground/62">
          DNP
        </td>
      ) : (
        <>
          <td className="py-2 pr-2 text-right">{row.minutes}</td>
          <td className="py-2 pr-2 text-right">
            {row.fgMade}-{row.fgAtt}
          </td>
          <td className="py-2 pr-2 text-right">
            {row.threeMade}-{row.threeAtt}
          </td>
          <td className="py-2 pr-2 text-right">
            {row.ftMade}-{row.ftAtt}
          </td>
          <td className="py-2 pr-2 text-right">{row.offensiveRebounds}</td>
          <td className="py-2 pr-2 text-right">{row.defensiveRebounds}</td>
          <td className="py-2 pr-2 text-right">{row.rebounds}</td>
          <td className="py-2 pr-2 text-right">{row.assists}</td>
          <td className="py-2 pr-2 text-right">{row.steals}</td>
          <td className="py-2 pr-2 text-right">{row.blocks}</td>
          <td className="py-2 pr-2 text-right">{row.turnovers}</td>
          <td className="py-2 pr-2 text-right">{row.fouls}</td>
          <td className="py-2 pr-2 text-right">{formatSigned(row.plusMinus)}</td>
          <td className="py-2 text-right font-semibold text-foreground">{row.points}</td>
        </>
      )}
    </tr>
  );
}

function BoxScoreTeamTable({
  team,
  rows,
  teamStats,
}: {
  team: ScoreboardTeam;
  rows: BoxScoreRow[];
  teamStats: (TeamStatFields & { key: string | number }) | null;
}) {
  const starters = rows.filter((r) => r.starter);
  const bench = rows.filter((r) => !r.starter);

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        {team.logoUrl && <img src={team.logoUrl} alt={team.displayName} className="h-7 w-7 object-contain" />}
        <h2 className="text-lg font-medium text-foreground/92">{team.displayName}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse whitespace-nowrap text-sm">
          <thead>
            <tr className="text-left text-foreground/72">
              <th className="py-2 pr-2 border-b border-border font-normal">Starters</th>
              {BOX_SCORE_COLUMNS.map((c) => (
                <th key={c.key} className="py-2 pr-2 text-right border-b border-border font-normal">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {starters.map((row) => (
              <BoxScorePlayerRow key={row.key} row={row} />
            ))}
            {bench.length > 0 && (
              <tr>
                <td
                  colSpan={BOX_SCORE_COLUMNS.length + 1}
                  className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-foreground/62"
                >
                  Bench
                </td>
              </tr>
            )}
            {bench.map((row) => (
              <BoxScorePlayerRow key={row.key} row={row} />
            ))}
            {teamStats && (
              <tr className="border-t-2 border-border font-semibold text-foreground">
                <td className="py-2 pr-2">Totals</td>
                <td className="py-2 pr-2 text-right" />
                <td className="py-2 pr-2 text-right">
                  {teamStats.fgMade}-{teamStats.fgAtt}
                </td>
                <td className="py-2 pr-2 text-right">
                  {teamStats.threeMade}-{teamStats.threeAtt}
                </td>
                <td className="py-2 pr-2 text-right">
                  {teamStats.ftMade}-{teamStats.ftAtt}
                </td>
                <td className="py-2 pr-2 text-right">{teamStats.offensiveRebounds}</td>
                <td className="py-2 pr-2 text-right">{teamStats.defensiveRebounds}</td>
                <td className="py-2 pr-2 text-right">{teamStats.rebounds}</td>
                <td className="py-2 pr-2 text-right">{teamStats.assists}</td>
                <td className="py-2 pr-2 text-right">{teamStats.steals}</td>
                <td className="py-2 pr-2 text-right">{teamStats.blocks}</td>
                <td className="py-2 pr-2 text-right">{teamStats.turnovers}</td>
                <td className="py-2 pr-2 text-right">{teamStats.fouls}</td>
                <td className="py-2 pr-2 text-right" />
                <td className="py-2 text-right">{teamStats.points}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {teamStats && (
        <div className="mt-2 flex gap-4 text-xs text-foreground/62">
          <span>FG% {pct(teamStats.fgMade, teamStats.fgAtt) ?? "-"}</span>
          <span>3PT% {pct(teamStats.threeMade, teamStats.threeAtt) ?? "-"}</span>
          <span>FT% {pct(teamStats.ftMade, teamStats.ftAtt) ?? "-"}</span>
        </div>
      )}
    </section>
  );
}

function PeriodPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active ? "bg-accent text-accent-foreground" : "border border-border text-foreground/72 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function PlayByPlayTab({
  away,
  home,
  plays,
}: {
  away: ScoreboardTeam;
  home: ScoreboardTeam;
  plays: (PlayFields & { key: number; side: "home" | "away" | null })[];
}) {
  const [periodFilter, setPeriodFilter] = useState<number | "all">("all");

  if (plays.length === 0) {
    return <p className="text-foreground/72 text-sm">Play-by-play is not available for this game.</p>;
  }

  const periodsPresent = Array.from(new Set(plays.map((p) => p.period).filter((p): p is number => p !== null))).sort(
    (a, b) => a - b,
  );
  const groups = periodsPresent
    .filter((period) => periodFilter === "all" || period === periodFilter)
    .map((period) => ({ period, items: plays.filter((p) => p.period === period) }));

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-lg font-medium text-foreground/92">Play-by-Play</h2>
        <div className="flex flex-wrap gap-1.5">
          <PeriodPill active={periodFilter === "all"} onClick={() => setPeriodFilter("all")}>
            All
          </PeriodPill>
          {periodsPresent.map((period) => (
            <PeriodPill key={period} active={periodFilter === period} onClick={() => setPeriodFilter(period)}>
              {ordinalPeriodLabel(period - 1)}
            </PeriodPill>
          ))}
        </div>
      </div>
      <div className="space-y-6">
        {groups.map(({ period, items }) => (
          <div key={period}>
            <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground/62">
              {ordinalPeriodLabel(period - 1)} Quarter
            </div>
            <div className="space-y-1">
              {items.map((play) => (
                <div
                  key={play.key}
                  className={`flex items-center gap-3 rounded-md py-1.5 pl-3 pr-3 text-sm ${
                    play.scoringPlay ? "bg-surface-muted" : ""
                  }`}
                  style={{
                    borderLeft: `3px solid ${
                      play.side === "home" ? home.accent : play.side === "away" ? away.accent : "transparent"
                    }`,
                  }}
                >
                  <span className="w-14 shrink-0 tabular-nums text-foreground/72">{play.clock}</span>
                  <span className="flex-1">{play.description}</span>
                  <span className="w-16 shrink-0 text-right tabular-nums text-foreground/72">
                    {play.awayScore}-{play.homeScore}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
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
    <div className="flex flex-1 flex-col items-center gap-1 text-center min-w-0">
      <div className={`flex items-center gap-2 ${flip ? "flex-row-reverse" : ""}`}>
        {leader.headshotUrl ? (
          <img
            src={headshotSrc(leader.headshotUrl)}
            alt={leader.name}
            className="h-12 w-12 shrink-0 rounded-full bg-surface-muted object-cover"
          />
        ) : (
          <div className="h-12 w-12 shrink-0 rounded-full bg-surface-muted" />
        )}
        <div className="shrink-0 text-center text-lg font-bold tabular-nums text-foreground">{value}</div>
      </div>
      <div className="text-sm font-semibold text-foreground">
        {leader.linkId ? (
          <Link href={`/players/${leader.linkId}`} className="hover:text-accent">
            {toShortName(leader.name)}
          </Link>
        ) : (
          toShortName(leader.name)
        )}
        {leader.jersey && <span className="text-foreground/72 font-normal"> #{leader.jersey}</span>}
      </div>
      <div className="text-xs text-foreground/82">{secondary}</div>
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
              <div className="w-20 shrink-0 text-center text-xs font-bold uppercase tracking-wide text-foreground/87">
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
        <Link href="?tab=boxscore" className="text-sm text-foreground/82 hover:text-foreground">
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
        <h2 className="text-sm font-semibold text-foreground/92">Team Stats</h2>
      </div>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          {away.logoUrl && <img src={away.logoUrl} alt={away.displayName} className="h-6 w-6 object-contain" />}
          <span className="text-sm font-medium text-foreground/92">{away.abbreviation}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground/92">{home.abbreviation}</span>
          {home.logoUrl && <img src={home.logoUrl} alt={home.displayName} className="h-6 w-6 object-contain" />}
        </div>
      </div>
      <div className="divide-y divide-border/60 px-4">
        {rows.map((row) => (
          <div key={row.label} className="py-3">
            <div className="flex items-center justify-between text-sm font-medium text-foreground/92">
              <span>{row.awayDisplay}</span>
              <span className="text-xs text-foreground/72">{row.label}</span>
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
        <Link href="?tab=teamstats" className="text-sm text-foreground/82 hover:text-foreground">
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
        <h2 className="text-sm font-semibold text-foreground/92">Game Information</h2>
      </div>
      <div className="space-y-4 px-4 py-3 text-sm">
        <div className="text-foreground/92">{formatGameDateTime(date)}</div>

        {gameInfo.venue && (
          <div>
            <div className="text-foreground/92">{gameInfo.venue.name}</div>
            {(gameInfo.venue.city || gameInfo.venue.state) && (
              <div className="text-foreground/72">
                {[gameInfo.venue.city, gameInfo.venue.state].filter(Boolean).join(", ")}
              </div>
            )}
          </div>
        )}

        {gameInfo.venue?.imageUrl && (
          <img src={gameInfo.venue.imageUrl} alt={gameInfo.venue.name} className="w-full rounded-md object-cover" />
        )}

        {gameInfo.attendance !== null && (
          <div className="text-foreground/92">Attendance: {gameInfo.attendance.toLocaleString()}</div>
        )}

        {gameInfo.broadcasts.length > 0 && (
          <div>
            <div className="text-xs text-foreground/72 mb-1">Where to Watch</div>
            <div className="flex flex-wrap gap-2">
              {gameInfo.broadcasts.map((b) => (
                <span key={b} className="rounded border border-border px-2 py-0.5 text-xs text-foreground/92">
                  {b}
                </span>
              ))}
            </div>
          </div>
        )}

        {gameInfo.officials.length > 0 && (
          <div>
            <div className="text-xs text-foreground/72 mb-1">Officiating Crew</div>
            <div className="space-y-1">
              {gameInfo.officials.map((o) => (
                <div key={o.name} className="flex justify-between text-foreground/92">
                  <span className="text-foreground/72">{o.position}</span>
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
        <h2 className="text-sm font-semibold text-foreground/92">Game Odds</h2>
        {odds && <span className="text-xs text-foreground/72">Odds by {odds.provider}</span>}
      </div>
      {odds ? (
        <div className="px-4 py-3">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-foreground/72">
                <th className="border-b border-border pb-2 font-normal" />
                <th className="border-b border-border pb-2 text-right font-normal">Spread</th>
                <th className="border-b border-border pb-2 text-right font-normal">Total</th>
                <th className="border-b border-border pb-2 text-right font-normal">ML</th>
              </tr>
            </thead>
            <tbody>
              <tr className={`border-b border-border/60 ${!odds.homeIsFavorite ? "font-semibold text-foreground" : "text-foreground/92"}`}>
                <td className="py-2">{away.abbreviation}</td>
                <td className={`py-2 text-right ${winningCell(awayCovered)}`}>{formatSigned(odds.awaySpread)}</td>
                <td className={`py-2 text-right ${winningCell(overHit)}`}>{odds.overUnder !== null ? `o${odds.overUnder}` : "-"}</td>
                <td className={`py-2 text-right ${winningCell(awayWon)}`}>{formatSigned(odds.awayMoneyline)}</td>
              </tr>
              <tr className={odds.homeIsFavorite ? "font-semibold text-foreground" : "text-foreground/92"}>
                <td className="py-2">{home.abbreviation}</td>
                <td className={`py-2 text-right ${winningCell(homeCovered)}`}>{formatSigned(odds.homeSpread)}</td>
                <td className={`py-2 text-right ${winningCell(underHit)}`}>{odds.overUnder !== null ? `u${odds.overUnder}` : "-"}</td>
                <td className={`py-2 text-right ${winningCell(homeWon)}`}>{formatSigned(odds.homeMoneyline)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-3 text-sm text-foreground/72">No odds available for this game.</p>
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
      <span className="text-sm font-medium text-foreground/92">{team.abbreviation}</span>
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
      <div className="relative mt-1 h-4 text-[10px] text-foreground/72">
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
      <div className="relative mt-1 h-4 text-[10px] text-foreground/72">
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
        <h2 className="text-xs font-semibold tracking-wide text-foreground/82">PROBABILITIES & GAME FLOW</h2>
      </div>
      <div className="flex gap-1 px-4 pt-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`flex-1 rounded-full py-1.5 text-xs font-medium transition-colors ${
              tab === t.key ? "bg-accent text-accent-foreground" : "text-foreground/72 hover:text-foreground/92"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "winprob" ? (
        probSeries.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-foreground/72">Win probability not available for this game.</p>
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
                <div className="text-xs text-foreground/72">{away.abbreviation}</div>
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-foreground">{leadChanges}</div>
              <div className="text-xs text-foreground/72">Lead Changes</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="font-semibold text-foreground">{home.score}</div>
                <div className="text-xs text-foreground/72">{home.abbreviation}</div>
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
            <span className="text-foreground/92">{displayedPlay.description ?? "—"}</span>
            <div className="mt-0.5 text-xs text-foreground/72">
              Q{displayedPlay.period} {displayedPlay.clock}
            </div>
          </div>
          <div className="flex shrink-0 gap-3 text-right">
            <div>
              <div className="tabular-nums text-foreground/92">{displayedPlay.awayScore}</div>
              <div className="text-xs text-foreground/72">{away.abbreviation}</div>
            </div>
            <div>
              <div className="tabular-nums text-foreground/92">{displayedPlay.homeScore}</div>
              <div className="text-xs text-foreground/72">{home.abbreviation}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-border/60 px-4 py-2 text-center text-xs text-foreground/62">
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
      className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground/92 focus:outline-none"
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
        <h2 className="text-xs font-semibold tracking-wide text-foreground/82">SHOT CHART</h2>
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
                  <div className="text-foreground/82">
                    {shot.playType} · {shot.made ? "Made" : "Missed"}
                    {shot.period !== null && ` · ${ordinalPeriodLabel(shot.period - 1)}`}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4 px-4 py-3 text-xs text-foreground/82">
        <LegendDot color={awayColor} label="Shot Made" made />
        <LegendDot color={awayColor} label="Shot Missed" made={false} />
        <div className="flex items-center gap-2">
          {away.logoUrl && <img src={away.logoUrl} alt={away.displayName} className="h-5 w-5 object-contain" />}
          <span className="text-foreground/52">|</span>
          {home.logoUrl && <img src={home.logoUrl} alt={home.displayName} className="h-5 w-5 object-contain" />}
        </div>
        <LegendDot color={homeColor} label="Shot Made" made />
        <LegendDot color={homeColor} label="Shot Missed" made={false} />
      </div>
      <div className="border-t border-border/60 px-4 py-3 text-center">
        <Link href="?tab=playbyplay" className="text-sm text-foreground/82 hover:text-foreground">
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
        <h2 className="text-xs font-semibold tracking-wide text-foreground/82">MATCHUPS</h2>
      </div>
      <div className="flex items-center justify-around px-4 py-4">
        <div className="flex flex-col items-center gap-1">
          {away.logoUrl && <img src={away.logoUrl} alt={away.displayName} className="h-9 w-9 object-contain" />}
          <span className="text-xs text-foreground/82">{away.abbreviation}</span>
        </div>
        <div className="text-center">
          <div className="text-xs text-foreground/82">{seasonSeries.summary}</div>
          {seasonSeries.seriesScore && <div className="text-base font-bold text-foreground">{seasonSeries.seriesScore}</div>}
        </div>
        <div className="flex flex-col items-center gap-1">
          {home.logoUrl && <img src={home.logoUrl} alt={home.displayName} className="h-9 w-9 object-contain" />}
          <span className="text-xs text-foreground/82">{home.abbreviation}</span>
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
                <span className={awaySide.winner ? "font-semibold text-foreground" : "text-foreground/72"}>
                  {event.completed ? awaySide.score : awayRecord}
                </span>
              </div>
              <div className="flex-1 text-center">
                <div className="text-xs text-foreground/72">
                  Game {i + 1} @ {event.home.abbreviation}
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {event.completed ? event.statusDetail : formatMatchupDateTime(event.date)}
                </div>
                {event.completed ? (
                  <div className="text-xs text-foreground/72">{formatMatchupDate(event.date)}</div>
                ) : (
                  event.broadcasts.length > 0 && (
                    <div className="mt-1 flex justify-center gap-2">
                      {event.broadcasts.map((b) => (
                        <span key={b} className="rounded border border-border px-2 py-0.5 text-xs text-foreground/82">
                          {b}
                        </span>
                      ))}
                    </div>
                  )
                )}
              </div>
              <div className="flex w-10 items-center gap-1 text-lg">
                {homeSide.winner && <span className="text-foreground/72">{"›"}</span>}
                <span className={homeSide.winner ? "font-semibold text-foreground" : "text-foreground/72"}>
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
      <Link href={`/teams/${team.linkId}`} className="hover:text-foreground/92">
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
    // gutters, but the scoreboard header should span the whole content
    // area's width like ESPN's real game header, not just the centered
    // column.
    <FullBleed className="overflow-hidden border-y border-border bg-background">
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
        <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-4 sm:gap-4 sm:px-6 sm:py-6">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
          {away.logoUrl && (
            <img src={away.logoUrl} alt={away.displayName} className="h-9 w-9 shrink-0 object-contain sm:h-14 sm:w-14" />
          )}
          <div className="min-w-0">
            <div className="truncate font-semibold text-foreground leading-tight">
              <TeamName team={away} />
            </div>
            {linescores && (
              <div className="truncate text-xs text-foreground/72 mt-0.5">
                {linescores.away.record}
                {linescores.away.splitRecord ? `, ${linescores.away.splitRecord} Away` : ""}
              </div>
            )}
          </div>
          <div className="ml-1 shrink-0 text-xl font-bold tabular-nums text-foreground sm:ml-2 sm:text-4xl">
            {away.score ?? "-"}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1 px-1 sm:px-2">
          {statusDetail && <div className="whitespace-nowrap text-xs font-medium text-foreground/92 sm:text-sm">{statusDetail}</div>}
          {linescores && periods > 0 && (
            <table className="hidden text-xs text-foreground/82 sm:table">
              <thead>
                <tr className="text-foreground/72">
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
                  <td className="px-1.5 font-semibold text-foreground/92">{away.abbreviation}</td>
                  {Array.from({ length: periods }, (_, i) => (
                    <td key={i} className="px-1.5 text-center">
                      {linescores.away.linescores[i] ?? ""}
                    </td>
                  ))}
                  <td className="px-1.5 text-center font-semibold text-foreground">{away.score ?? "-"}</td>
                </tr>
                <tr>
                  <td className="px-1.5 font-semibold text-foreground/92">{home.abbreviation}</td>
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

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-4">
          <div className="mr-1 shrink-0 text-xl font-bold tabular-nums text-foreground sm:mr-2 sm:text-4xl">
            {home.score ?? "-"}
          </div>
          <div className="min-w-0 text-right">
            <div className="truncate font-semibold text-foreground leading-tight">
              <TeamName team={home} />
            </div>
            {linescores && (
              <div className="truncate text-xs text-foreground/72 mt-0.5">
                {linescores.home.record}
                {linescores.home.splitRecord ? `, ${linescores.home.splitRecord} Home` : ""}
              </div>
            )}
          </div>
          {home.logoUrl && (
            <img src={home.logoUrl} alt={home.displayName} className="h-9 w-9 shrink-0 object-contain sm:h-14 sm:w-14" />
          )}
        </div>
        </div>
      </div>
      <TabPager tabs={tabs} activeTab={activeTab} onChange={onTabChange} accentColor={home.accent} />
    </FullBleed>
  );
}
