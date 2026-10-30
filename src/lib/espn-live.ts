/**
 * M8 — live proxy path (SPEC.md Sec 4, PLAN.md Sec 3/M8). Thin wrapper over
 * lib/espn/client.ts, used only by routes serving games that aren't
 * `final` yet (or scoreboard views of today/future dates). Nothing here
 * ever writes to the database — that's the incremental sync job's job
 * (ingest/lib/game-ingest.ts), once a game actually finishes.
 */
import { fetchEspnJson } from "../../lib/espn/client";
import { espnEndpoints } from "../../lib/espn/endpoints";
import {
  mapPlayerGameStat,
  mapTeamGameStat,
  type EspnBoxscore,
} from "../../ingest/mappers/boxscore";
import { mapPlay, type EspnPlay } from "../../ingest/mappers/playbyplay";
import { pickPrimaryProvider, type EspnPickcenterEntry } from "../../ingest/mappers/odds";

// Richer than ingest/mappers/game.ts's EspnScoreboardEvent (which only
// needs team.id for FK lookups) — the scoreboard view needs to display
// team names/abbreviations directly, with no DB round-trip to resolve them.
interface EspnScoreboardTeam {
  id: string;
  abbreviation: string;
  displayName: string;
}

interface EspnScoreboardEvent {
  id: string;
  date: string;
  status: { type: { name: string; detail?: string } };
  competitions: {
    status: { period?: number; displayClock?: string };
    competitors: { homeAway: "home" | "away"; score?: string; team: EspnScoreboardTeam }[];
  }[];
}

interface EspnScoreboardResponse {
  events: EspnScoreboardEvent[];
}

interface EspnWinProbabilityEntry {
  homeWinPercentage: number;
  tiePercentage: number;
  playId: string;
}

interface EspnSummaryResponse {
  boxscore: EspnBoxscore;
  plays: EspnPlay[];
  pickcenter?: EspnPickcenterEntry[];
  winprobability?: EspnWinProbabilityEntry[];
}

// Keyed by playId so the frontend can zip it against `plays[].espnId` —
// never persisted (SPEC.md Sec 6 has no column for it), so both DB- and
// live-sourced games pull this live from ESPN same as HeaderExtras.
export interface WinProbabilityPoint {
  playId: string;
  homeWinPercentage: number;
}

function extractWinProbability(summary: { winprobability?: EspnWinProbabilityEntry[] }): WinProbabilityPoint[] {
  return (summary.winprobability ?? []).map((entry) => ({
    playId: entry.playId,
    homeWinPercentage: entry.homeWinPercentage,
  }));
}

// Shot locations are never persisted (SPEC.md Sec 6 has no columns for
// them) — pulled live from the same summary `plays` array as everything
// else here. `coordinate` is a half-court position relative to the hoop:
// x 0-50 is cross-court (25 = straight on), y is feet from the basket.
// Free throws (and the rare other non-FG "shooting" play) carry a sentinel
// garbage coordinate rather than omitting it, so pointsAttempted doubles as
// the filter for "is this actually a field goal attempt".
export interface ShotChartShot {
  playId: string;
  teamId: string;
  made: boolean;
  x: number;
  y: number;
  period: number | null;
  playType: string;
  playerName: string | null;
}

function extractShooterName(text: string): string | null {
  const blockMatch = text.match(/blocks\s+(.+?)\s*'s\s/);
  if (blockMatch) return blockMatch[1].trim();
  const makeMissMatch = text.match(/^(.+?)\s+(makes|misses)\s/);
  if (makeMissMatch) return makeMissMatch[1].trim();
  return null;
}

// Collapses ESPN's ~30 granular shot-type strings (e.g. "Driving Floating
// Bank Jump Shot") into the broad buckets the "Play Types" filter shows.
function simplifyPlayType(typeText: string): string {
  if (/dunk/i.test(typeText)) return "Dunk";
  if (/layup/i.test(typeText)) return "Layup";
  if (/hook/i.test(typeText)) return "Hook Shot";
  if (/tip/i.test(typeText)) return "Tip Shot";
  return "Jump Shot";
}

function extractShots(plays: EspnPlay[]): ShotChartShot[] {
  return plays
    .filter(
      (p) =>
        p.shootingPlay &&
        p.pointsAttempted !== 1 &&
        p.coordinate &&
        p.coordinate.x >= 0 &&
        p.coordinate.x <= 50 &&
        p.coordinate.y >= -10 &&
        p.coordinate.y <= 50 &&
        p.team?.id,
    )
    .map((p) => ({
      playId: p.id,
      teamId: p.team!.id,
      made: p.scoringPlay ?? false,
      x: p.coordinate!.x,
      y: p.coordinate!.y,
      period: p.period?.number ?? null,
      playType: simplifyPlayType(p.type?.text ?? ""),
      playerName: p.text ? extractShooterName(p.text) : null,
    }));
}

// The post-game recap article — never persisted (SPEC.md Sec 6 has no
// column for it), pulled live from the same summary payload as everything
// else here. ESPN's `story` field is third-party HTML; it is stripped to
// plain paragraphs rather than ever rendered as markup (see design.md).
export interface RecapArticle {
  headline: string;
  source: string | null;
  publishedAt: string | null;
  paragraphs: string[];
}

interface EspnArticle {
  type?: string;
  headline?: string;
  source?: string;
  originallyPosted?: string;
  story?: string;
}

// Strips HTML tags (keeping their inner text) and splits on blank lines
// into trimmed, non-empty paragraphs. Internal wrapping whitespace is
// collapsed too, since the source text is wrapped at an arbitrary column
// width rather than meaningfully line-broken.
export function stripHtmlToParagraphs(html: string): string[] {
  return html
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((paragraph) => paragraph.length > 0);
}

// Only ESPN's actual post-game recap counts — a future/in-progress game may
// carry a pregame "Preview" article instead, which would misrepresent the
// game if shown under the Recap tab.
export function extractRecap(summary: { article?: EspnArticle }): RecapArticle | null {
  const article = summary.article;
  if (!article || article.type !== "Recap" || !article.headline || !article.story) return null;
  return {
    headline: article.headline,
    source: article.source ?? null,
    publishedAt: article.originallyPosted ?? null,
    paragraphs: stripHtmlToParagraphs(article.story),
  };
}

// Every named stat category ESPN reports per team — far more than the dozen
// fields SPEC.md Sec 6 persists. Never persisted; pulled live alongside the
// rest of this file's extras. ESPN's own `label`/`displayValue` are used
// as-is rather than re-derived, unlike ingest/mappers/boxscore.ts's narrower
// EspnTeamStat (name + displayValue only, no label).
export interface TeamStatCategory {
  name: string;
  label: string;
  awayDisplay: string;
  homeDisplay: string;
}

interface EspnTeamStatWithLabel {
  name: string;
  label: string;
  displayValue: string;
}

interface EspnBoxscoreTeamWithLabels {
  team: { id: string };
  statistics: EspnTeamStatWithLabel[];
}

// Zips by `name` (the stable machine key) rather than array index/position —
// ESPN does not guarantee category order or count is identical across games
// (design.md). Returns null rather than an empty array when stats aren't
// available yet (e.g. a scheduled game), so callers can't mistake "no data"
// for "zero of every stat".
export function extractTeamStatsBreakdown(
  teams: EspnBoxscoreTeamWithLabels[] | undefined,
  awayEspnTeamId: string,
  homeEspnTeamId: string,
): TeamStatCategory[] | null {
  if (!teams || teams.length === 0) return null;
  const awayTeam = teams.find((t) => t.team.id === awayEspnTeamId);
  const homeTeam = teams.find((t) => t.team.id === homeEspnTeamId);
  if (!awayTeam || !homeTeam) return null;

  const homeStatsByName = new Map(homeTeam.statistics.map((stat) => [stat.name, stat]));
  const rows = awayTeam.statistics
    .map((awayStat) => {
      const homeStat = homeStatsByName.get(awayStat.name);
      if (!homeStat) return null;
      return {
        name: awayStat.name,
        label: awayStat.label,
        awayDisplay: awayStat.displayValue,
        homeDisplay: homeStat.displayValue,
      };
    })
    .filter((row): row is TeamStatCategory => row !== null);

  return rows.length > 0 ? rows : null;
}

export interface LiveOdds {
  provider: string;
  spread: number | null;
  overUnder: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
  favoriteSide: "home" | "away" | null;
}

// Period-by-period scores and W-L records shown in the scoreboard header —
// never persisted (SPEC.md Sec 4/6 has no linescore/record columns), so
// every game detail page pulls these live from ESPN's summary header
// regardless of whether the rest of the page is DB- or live-sourced.
export interface HeaderExtras {
  statusDetail: string;
  home: { record: string | null; splitRecord: string | null; linescores: number[] };
  away: { record: string | null; splitRecord: string | null; linescores: number[] };
  gameInfo: GameInfo;
  seasonSeries: SeasonSeries | null;
}

// The head-to-head "Matchups" card — also never persisted, and also only
// derivable live since it spans multiple games (including ones not yet
// played), not just this one.
export interface SeasonSeries {
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

// Broadcast/officiating-crew info has no home in our schema at all (SPEC.md
// Sec 6 tracks neither) — pulled live alongside the header extras, from the
// same summary response's `gameInfo`/`broadcasts` keys.
export interface GameInfo {
  venue: { name: string; city: string | null; state: string | null; imageUrl: string | null } | null;
  attendance: number | null;
  officials: { name: string; position: string }[];
  broadcasts: string[];
}

interface EspnHeaderCompetitor {
  homeAway: "home" | "away";
  linescores?: { displayValue: string }[];
  record?: { type: string; summary: string }[];
}

interface EspnGameInfo {
  venue?: {
    fullName: string;
    address?: { city?: string; state?: string };
    images?: { href: string }[];
  };
  attendance?: number;
  officials?: { displayName: string; position?: { displayName?: string } }[];
}

interface EspnBroadcast {
  media?: { shortName?: string };
  station?: string;
}

interface EspnSeasonSeriesEvent {
  id: string;
  date: string;
  statusType: { completed: boolean; shortDetail: string };
  competitors: {
    homeAway: "home" | "away";
    winner?: boolean;
    score?: string;
    team: { abbreviation: string };
  }[];
  broadcasts?: EspnBroadcast[];
}

interface EspnSeasonSeries {
  shortSummary?: string;
  summary?: string;
  seriesScore?: string;
  events: EspnSeasonSeriesEvent[];
}

function extractSeasonSeries(seasonSeries: EspnSeasonSeries[] | undefined): SeasonSeries | null {
  const series = seasonSeries?.[0];
  if (!series) return null;
  return {
    summary: series.shortSummary ?? series.summary ?? "",
    seriesScore: series.seriesScore ?? null,
    events: series.events.map((event) => {
      const home = event.competitors.find((c) => c.homeAway === "home");
      const away = event.competitors.find((c) => c.homeAway === "away");
      const side = (c: typeof home) => ({
        abbreviation: c?.team.abbreviation ?? "",
        score: c?.score !== undefined ? Number(c.score) : null,
        winner: c?.winner ?? false,
      });
      return {
        espnId: event.id,
        date: event.date,
        statusDetail: event.statusType.shortDetail,
        completed: event.statusType.completed,
        home: side(home),
        away: side(away),
        broadcasts: (event.broadcasts ?? []).map((b) => b.media?.shortName ?? b.station ?? "").filter(Boolean),
      };
    }),
  };
}

function extractGameInfo(summary: { gameInfo?: EspnGameInfo; broadcasts?: EspnBroadcast[] }): GameInfo {
  const venue = summary.gameInfo?.venue;
  return {
    venue: venue
      ? {
          name: venue.fullName,
          city: venue.address?.city ?? null,
          state: venue.address?.state ?? null,
          imageUrl: venue.images?.[0]?.href ?? null,
        }
      : null,
    attendance: summary.gameInfo?.attendance ?? null,
    officials: (summary.gameInfo?.officials ?? []).map((o) => ({
      name: o.displayName,
      position: o.position?.displayName ?? "Referee",
    })),
    broadcasts: (summary.broadcasts ?? []).map((b) => b.media?.shortName ?? b.station ?? "").filter(Boolean),
  };
}

function extractHeaderExtras(
  competition: {
    status: { type: { detail?: string; shortDetail?: string; name: string } };
    competitors: EspnHeaderCompetitor[];
  },
  summary: { gameInfo?: EspnGameInfo; broadcasts?: EspnBroadcast[]; seasonseries?: EspnSeasonSeries[] },
): HeaderExtras {
  const home = competition.competitors.find((c) => c.homeAway === "home");
  const away = competition.competitors.find((c) => c.homeAway === "away");
  const side = (competitor: EspnHeaderCompetitor | undefined, splitType: "home" | "road") => ({
    record: competitor?.record?.find((r) => r.type === "total")?.summary ?? null,
    splitRecord: competitor?.record?.find((r) => r.type === splitType)?.summary ?? null,
    linescores: (competitor?.linescores ?? []).map((l) => Number(l.displayValue)),
  });
  return {
    statusDetail: competition.status.type.shortDetail ?? competition.status.type.detail ?? competition.status.type.name,
    home: side(home, "home"),
    away: side(away, "road"),
    gameInfo: extractGameInfo(summary),
    seasonSeries: extractSeasonSeries(summary.seasonseries),
  };
}

export interface GameSummaryExtras {
  headerExtras: HeaderExtras | null;
  winProbability: WinProbabilityPoint[] | null;
  shots: ShotChartShot[] | null;
  recap: RecapArticle | null;
  teamStatsBreakdown: TeamStatCategory[] | null;
}

// headerExtras/winProbability/shots/recap/teamStatsBreakdown all come from
// the same ESPN `summary` payload — one fetch instead of five separate (and
// identical) requests for a game whose box score is already DB-backed.
export async function getGameSummaryExtras(eventId: string): Promise<GameSummaryExtras> {
  try {
    const summary = await fetchEspnJson<{
      header: {
        competitions: [
          {
            status: { type: { detail?: string; shortDetail?: string; name: string } };
            competitors: (EspnHeaderCompetitor & { team: { id: string } })[];
          },
        ];
      };
      gameInfo?: EspnGameInfo;
      broadcasts?: EspnBroadcast[];
      seasonseries?: EspnSeasonSeries[];
      winprobability?: EspnWinProbabilityEntry[];
      plays?: EspnPlay[];
      article?: EspnArticle;
      boxscore?: { teams?: EspnBoxscoreTeamWithLabels[] };
    }>(espnEndpoints.summary(eventId));
    const competition = summary.header.competitions[0];
    const home = competition.competitors.find((c) => c.homeAway === "home");
    const away = competition.competitors.find((c) => c.homeAway === "away");
    return {
      headerExtras: extractHeaderExtras(competition, summary),
      winProbability: extractWinProbability(summary),
      shots: extractShots(summary.plays ?? []),
      recap: extractRecap(summary),
      teamStatsBreakdown:
        home && away ? extractTeamStatsBreakdown(summary.boxscore?.teams, away.team.id, home.team.id) : null,
    };
  } catch {
    return { headerExtras: null, winProbability: null, shots: null, recap: null, teamStatsBreakdown: null };
  }
}

export interface ScoreboardGameCard {
  espnId: string;
  date: string;
  statusName: string; // e.g. STATUS_SCHEDULED / STATUS_IN_PROGRESS / STATUS_FINAL
  statusDetail: string;
  period: number | null;
  clock: string | null;
  home: { espnId: string; abbreviation: string; displayName: string; score: number | null };
  away: { espnId: string; abbreviation: string; displayName: string; score: number | null };
}

export async function getScoreboard(date: string): Promise<ScoreboardGameCard[]> {
  const board = await fetchEspnJson<EspnScoreboardResponse>(espnEndpoints.scoreboard(date));
  return (board.events ?? []).map((event) => {
    const competition = event.competitions[0];
    const home = competition.competitors.find((c) => c.homeAway === "home");
    const away = competition.competitors.find((c) => c.homeAway === "away");
    const statusType = event.status.type;
    // ESPN reports "0" (not omitted) for a game that hasn't tipped off yet —
    // treat that as "no score to show", not a real 0-0 score.
    const isScheduled = statusType.name === "STATUS_SCHEDULED";
    return {
      espnId: event.id,
      date: event.date,
      statusName: statusType.name,
      statusDetail: statusType.detail ?? statusType.name,
      period: competition.status.period ?? null,
      clock: competition.status.displayClock ?? null,
      home: {
        espnId: home!.team.id,
        abbreviation: home!.team.abbreviation,
        displayName: home!.team.displayName,
        score: !isScheduled && home!.score !== undefined ? Number(home!.score) : null,
      },
      away: {
        espnId: away!.team.id,
        abbreviation: away!.team.abbreviation,
        displayName: away!.team.displayName,
        score: !isScheduled && away!.score !== undefined ? Number(away!.score) : null,
      },
    };
  });
}

export interface LiveGameDetail {
  espnId: string;
  source: "live";
  statusName: string;
  statusDetail: string;
  date: string;
  home: { espnId: string; abbreviation: string; displayName: string; score: number | null; logoUrl: string | null; color: string | null; alternateColor: string | null };
  away: { espnId: string; abbreviation: string; displayName: string; score: number | null; logoUrl: string | null; color: string | null; alternateColor: string | null };
  teamGameStats: (ReturnType<typeof mapTeamGameStat> & { teamEspnId: string })[];
  playerGameStats: (ReturnType<typeof mapPlayerGameStat> & {
    playerDisplayName: string;
    headshotUrl: string | null;
    jersey: string | null;
    position: string | null;
    teamEspnId: string;
  })[];
  plays: (ReturnType<typeof mapPlay> & { teamEspnId: string | null })[];
  odds: LiveOdds | null;
  headerExtras: HeaderExtras;
  winProbability: WinProbabilityPoint[];
  shots: ShotChartShot[];
  recap: RecapArticle | null;
  teamStatsBreakdown: TeamStatCategory[] | null;
}

/** Fetches a game live from ESPN and reshapes it into roughly the same
 * stat-field shape the DB-backed path uses (SPEC.md Sec 4) — but keyed by
 * espnId/display name rather than internal FK ids, since this game may not
 * exist in our DB at all yet. Returns null if ESPN doesn't know this event. */
export async function getLiveGameDetail(eventId: string): Promise<LiveGameDetail | null> {
  let summary: EspnSummaryResponse & {
    header: {
      id: string;
      competitions: [
        {
          date: string;
          status: { type: { name: string; detail?: string; shortDetail?: string } };
          competitors: (EspnHeaderCompetitor & {
            score?: string;
            team: { id: string; abbreviation: string; displayName: string; color?: string; alternateColor?: string; logos?: { href: string }[] };
          })[];
        },
      ];
    };
    gameInfo?: EspnGameInfo;
    broadcasts?: EspnBroadcast[];
    seasonseries?: EspnSeasonSeries[];
    article?: EspnArticle;
  };
  try {
    summary = await fetchEspnJson(espnEndpoints.summary(eventId));
  } catch {
    return null;
  }

  const competition = summary.header.competitions[0];
  const home = competition.competitors.find((c) => c.homeAway === "home")!;
  const away = competition.competitors.find((c) => c.homeAway === "away")!;

  const teamGameStats = (summary.boxscore.teams ?? []).map((teamBox) => {
    const teamCompetitor = [home, away].find((c) => c.team.id === teamBox.team.id);
    const points = teamCompetitor?.score !== undefined ? Number(teamCompetitor.score) : null;
    // gameId/teamId args are unused by the DB — placeholder 0, this result is never
    // persisted. teamEspnId carries the real identity for the frontend to tell teams apart.
    return { ...mapTeamGameStat(teamBox, 0, 0, points), teamEspnId: teamBox.team.id };
  });

  const playerGameStats = (summary.boxscore.players ?? []).flatMap((group) => {
    const keys = group.statistics[0]?.keys ?? [];
    const athletes = group.statistics[0]?.athletes ?? [];
    return athletes
      .filter((entry) => entry.athlete?.id)
      .map((entry) => ({
        ...mapPlayerGameStat(entry, keys, 0, 0, 0),
        playerDisplayName: entry.athlete.displayName,
        headshotUrl: entry.athlete.headshot?.href ?? null,
        jersey: entry.athlete.jersey ?? null,
        position: entry.athlete.position?.abbreviation ?? null,
        teamEspnId: group.team.id,
      }));
  });

  // teamId is always null here (no internal FK for an unpersisted game) —
  // teamEspnId carries the real identity through instead, same pattern as
  // teamGameStats/playerGameStats above.
  const plays = (summary.plays ?? []).map((play) => ({
    ...mapPlay(play, 0, null),
    teamEspnId: play.team?.id ?? null,
  }));

  const primaryOdds = pickPrimaryProvider(summary.pickcenter);
  const odds: LiveOdds | null = primaryOdds
    ? {
        provider: primaryOdds.provider.name,
        spread: primaryOdds.spread ?? null,
        overUnder: primaryOdds.overUnder ?? null,
        homeMoneyline: primaryOdds.homeTeamOdds?.moneyLine ?? null,
        awayMoneyline: primaryOdds.awayTeamOdds?.moneyLine ?? null,
        favoriteSide: primaryOdds.homeTeamOdds?.favorite ? "home" : primaryOdds.awayTeamOdds?.favorite ? "away" : null,
      }
    : null;

  return {
    espnId: eventId,
    source: "live",
    statusName: competition.status.type.name,
    statusDetail: competition.status.type.detail ?? competition.status.type.name,
    date: competition.date,
    home: {
      espnId: home.team.id,
      abbreviation: home.team.abbreviation,
      displayName: home.team.displayName,
      score: home.score !== undefined ? Number(home.score) : null,
      logoUrl: home.team.logos?.[0]?.href ?? null,
      color: home.team.color ? `#${home.team.color}` : null,
      alternateColor: home.team.alternateColor ? `#${home.team.alternateColor}` : null,
    },
    away: {
      espnId: away.team.id,
      abbreviation: away.team.abbreviation,
      displayName: away.team.displayName,
      score: away.score !== undefined ? Number(away.score) : null,
      logoUrl: away.team.logos?.[0]?.href ?? null,
      color: away.team.color ? `#${away.team.color}` : null,
      alternateColor: away.team.alternateColor ? `#${away.team.alternateColor}` : null,
    },
    teamGameStats,
    playerGameStats,
    plays,
    odds,
    headerExtras: extractHeaderExtras(competition, summary),
    winProbability: extractWinProbability(summary),
    shots: extractShots(summary.plays ?? []),
    recap: extractRecap(summary),
    teamStatsBreakdown: extractTeamStatsBreakdown(
      summary.boxscore.teams as unknown as EspnBoxscoreTeamWithLabels[] | undefined,
      away.team.id,
      home.team.id,
    ),
  };
}
