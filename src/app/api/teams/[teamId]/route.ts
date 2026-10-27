import { prisma } from "@/lib/db";
import { resolveTeamIdentities } from "@/lib/team-identity";
import { getTeamLeaders } from "@/lib/espn-team-leaders";
import { getUpcomingGames } from "@/lib/espn-schedule";
import { getTeamCoach } from "@/lib/espn-team-coach";
import { getTeamDepthChart } from "@/lib/espn-team-depth-chart";
import { NextResponse } from "next/server";

// ESPN's own leaders endpoint is the source of truth for who leads the
// team in a stat (it applies a qualifying threshold we don't replicate
// locally) — see src/lib/espn-team-leaders.ts. Category names are ESPN's.
const LEADER_CATEGORY_DEFS = [
  { group: "offense" as const, key: "pointsPerGame" },
  { group: "offense" as const, key: "assistsPerGame" },
  { group: "offense" as const, key: "fieldGoalPercentage" },
  { group: "defense" as const, key: "reboundsPerGame" },
  { group: "defense" as const, key: "stealsPerGame" },
  { group: "defense" as const, key: "blocksPerGame" },
];

// `extra` on TeamSeasonStat/PlayerSeasonStat is ESPN's raw category tree
// (categories -> stats[]), not a flat map — walk it once per lookup rather
// than reshaping the whole structure for the handful of fields surfaced.
function findStat(extraJson: string | null, statName: string): string | null {
  if (!extraJson) return null;
  try {
    const categories = JSON.parse(extraJson) as { stats?: { name: string; displayValue?: string }[] }[];
    for (const category of categories) {
      const stat = category.stats?.find((s) => s.name === statName);
      if (stat?.displayValue) return stat.displayValue;
    }
  } catch {
    return null;
  }
  return null;
}

function fixed1(value: number | null | undefined): string | null {
  return value == null ? null : value.toFixed(1);
}

function calculateAge(birthDate: Date | null): number | null {
  if (!birthDate) return null;
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() && now.getDate() >= birthDate.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

function findStatNumber(extraJson: string | null, statName: string): number | null {
  const value = findStat(extraJson, statName);
  if (value == null) return null;
  const n = parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

// Extended per-player stat line for the team Stats tab's Player/Shooting
// tables — the flat PlayerSeasonStat columns only cover the handful of
// fields the leaders/roster UI needs, everything else lives in `extra`.
function buildFullStat(extra: string | null) {
  return {
    gamesStarted: findStatNumber(extra, "gamesStarted"),
    minutesPerGame: findStatNumber(extra, "avgMinutes"),
    offReboundsPerGame: findStatNumber(extra, "avgOffensiveRebounds"),
    defReboundsPerGame: findStatNumber(extra, "avgDefensiveRebounds"),
    foulsPerGame: findStatNumber(extra, "avgFouls"),
    assistTurnoverRatio: findStatNumber(extra, "assistTurnoverRatio"),
    fgMadePerGame: findStatNumber(extra, "avgFieldGoalsMade"),
    fgAttPerGame: findStatNumber(extra, "avgFieldGoalsAttempted"),
    threeMadePerGame: findStatNumber(extra, "avgThreePointFieldGoalsMade"),
    threeAttPerGame: findStatNumber(extra, "avgThreePointFieldGoalsAttempted"),
    ftMadePerGame: findStatNumber(extra, "avgFreeThrowsMade"),
    ftAttPerGame: findStatNumber(extra, "avgFreeThrowsAttempted"),
    twoPointPct: findStatNumber(extra, "twoPointFieldGoalPct"),
    twoMadePerGame: findStatNumber(extra, "avgTwoPointFieldGoalsMade"),
    twoAttPerGame: findStatNumber(extra, "avgTwoPointFieldGoalsAttempted"),
    scoringEfficiency: findStatNumber(extra, "scoringEfficiency"),
    shootingEfficiency: findStatNumber(extra, "shootingEfficiency"),
  };
}

type ScheduleGame = {
  id: number;
  date: Date;
  status: string;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
};

// Resolves a Splits-dropdown key to the set of this team's completed game
// ids that satisfy it. "all" short-circuits to every completed game (the
// season-aggregate PlayerSeasonStat row is used for that case instead of
// this, so it never actually reaches here with games to filter).
async function resolveSplitGameIds(
  teamId: number,
  schedule: ScheduleGame[],
  split: string,
  teamDivisionId: number | null,
  teamConferenceId: number | null,
): Promise<number[]> {
  const finalGames = schedule.filter((g) => g.status === "FINAL");

  if (split === "home") return finalGames.filter((g) => g.homeTeamId === teamId).map((g) => g.id);
  if (split === "road") return finalGames.filter((g) => g.awayTeamId === teamId).map((g) => g.id);

  if (split === "wins" || split === "losses") {
    return finalGames
      .filter((g) => {
        const teamScore = g.homeTeamId === teamId ? g.homeScore : g.awayScore;
        const oppScore = g.homeTeamId === teamId ? g.awayScore : g.homeScore;
        if (teamScore == null || oppScore == null) return false;
        return split === "wins" ? teamScore > oppScore : teamScore < oppScore;
      })
      .map((g) => g.id);
  }

  if (split.startsWith("month-")) {
    const month = Number(split.slice("month-".length));
    return finalGames.filter((g) => g.date.getUTCMonth() + 1 === month).map((g) => g.id);
  }

  if (split.startsWith("day-")) {
    const day = Number(split.slice("day-".length));
    return finalGames.filter((g) => g.date.getUTCDay() === day).map((g) => g.id);
  }

  if (split === "preAllStar" || split === "postAllStar") {
    // No stored All-Star break date — approximate it as the chronological
    // midpoint of this team's completed games for the season.
    const sorted = finalGames.slice().sort((a, b) => a.date.getTime() - b.date.getTime());
    const mid = Math.ceil(sorted.length / 2);
    const half = split === "preAllStar" ? sorted.slice(0, mid) : sorted.slice(mid);
    return half.map((g) => g.id);
  }

  if (split.startsWith("rest-")) {
    const bucket = split.slice("rest-".length); // "0" | "1" | "2" | "3plus"
    const sortedAll = schedule.slice().sort((a, b) => a.date.getTime() - b.date.getTime());
    const restByGameId = new Map<number, number | null>();
    for (let i = 0; i < sortedAll.length; i++) {
      if (i === 0) {
        restByGameId.set(sortedAll[i].id, null);
        continue;
      }
      const days = Math.round((sortedAll[i].date.getTime() - sortedAll[i - 1].date.getTime()) / 86400000) - 1;
      restByGameId.set(sortedAll[i].id, Math.max(days, 0));
    }
    return finalGames
      .filter((g) => {
        const rest = restByGameId.get(g.id);
        if (rest == null) return false;
        return bucket === "3plus" ? rest >= 3 : rest === Number(bucket);
      })
      .map((g) => g.id);
  }

  if (split === "vsDivision" || split === "vsConference") {
    const opponentIds = [...new Set(finalGames.map((g) => (g.homeTeamId === teamId ? g.awayTeamId : g.homeTeamId)))];
    const opponents = await prisma.team.findMany({
      where: { id: { in: opponentIds } },
      select: { id: true, divisionId: true, division: { select: { conferenceId: true } } },
    });
    const opponentById = new Map(opponents.map((o) => [o.id, o]));
    return finalGames
      .filter((g) => {
        const oppId = g.homeTeamId === teamId ? g.awayTeamId : g.homeTeamId;
        const opp = opponentById.get(oppId);
        if (!opp) return false;
        return split === "vsDivision" ? opp.divisionId === teamDivisionId : opp.division?.conferenceId === teamConferenceId;
      })
      .map((g) => g.id);
  }

  if (split.startsWith("vsTeam-")) {
    const opponentTeamId = Number(split.slice("vsTeam-".length));
    return finalGames
      .filter((g) => (g.homeTeamId === teamId ? g.awayTeamId : g.homeTeamId) === opponentTeamId)
      .map((g) => g.id);
  }

  return finalGames.map((g) => g.id);
}

type PlayerGameStatRow = {
  playerId: number;
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
};

type SplitStat = ReturnType<typeof buildFullStat> & {
  gamesPlayed: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  stealsPerGame: number;
  blocksPerGame: number;
  turnoversPerGame: number;
  fieldGoalPct: number | null;
  threePointPct: number | null;
  freeThrowPct: number | null;
};

// Builds the same shape as `buildFullStat` + PlayerSeasonStat columns, but
// computed on the fly from individual game logs for a non-"all" split.
// `starter`/offensiveRebounds`/`defensiveRebounds` were added to
// PlayerGameStat after many games were already ingested (see
// backfill-game-stat-extras.ts) — games that predate the backfill still
// have those columns null, so each is averaged/counted only over rows that
// actually have it, falling back to null ("—" in the UI) if none do.
// Efficiency formulas (SC-EFF/SH-EFF) aren't tracked per game at all.
function aggregatePlayerGameStats(rows: PlayerGameStatRow[]): Map<number, SplitStat> {
  const byPlayer = new Map<number, PlayerGameStatRow[]>();
  for (const row of rows) {
    const list = byPlayer.get(row.playerId) ?? [];
    list.push(row);
    byPlayer.set(row.playerId, list);
  }

  const result = new Map<number, SplitStat>();
  for (const [playerId, playerRows] of byPlayer) {
    const gp = playerRows.length;
    const total = (pick: (r: PlayerGameStatRow) => number | null) => playerRows.reduce((acc, r) => acc + (pick(r) ?? 0), 0);
    const avgOfKnown = (pick: (r: PlayerGameStatRow) => number | null) => {
      const known = playerRows.filter((r) => pick(r) != null);
      return known.length > 0 ? known.reduce((acc, r) => acc + (pick(r) ?? 0), 0) / known.length : null;
    };
    const totalFgm = total((r) => r.fgMade);
    const totalFga = total((r) => r.fgAtt);
    const total3m = total((r) => r.threeMade);
    const total3a = total((r) => r.threeAtt);
    const totalFtm = total((r) => r.ftMade);
    const totalFta = total((r) => r.ftAtt);
    const totalAst = total((r) => r.assists);
    const totalTo = total((r) => r.turnovers);
    const rowsWithStarterData = playerRows.filter((r) => r.starter != null);
    result.set(playerId, {
      gamesPlayed: gp,
      gamesStarted: rowsWithStarterData.length > 0 ? rowsWithStarterData.filter((r) => r.starter).length : null,
      minutesPerGame: total((r) => r.minutes) / gp,
      pointsPerGame: total((r) => r.points) / gp,
      offReboundsPerGame: avgOfKnown((r) => r.offensiveRebounds),
      defReboundsPerGame: avgOfKnown((r) => r.defensiveRebounds),
      reboundsPerGame: total((r) => r.rebounds) / gp,
      assistsPerGame: totalAst / gp,
      stealsPerGame: total((r) => r.steals) / gp,
      blocksPerGame: total((r) => r.blocks) / gp,
      turnoversPerGame: totalTo / gp,
      foulsPerGame: total((r) => r.fouls) / gp,
      assistTurnoverRatio: totalTo > 0 ? totalAst / totalTo : null,
      fieldGoalPct: totalFga > 0 ? (totalFgm / totalFga) * 100 : null,
      fgMadePerGame: totalFgm / gp,
      fgAttPerGame: totalFga / gp,
      threePointPct: total3a > 0 ? (total3m / total3a) * 100 : null,
      threeMadePerGame: total3m / gp,
      threeAttPerGame: total3a / gp,
      freeThrowPct: totalFta > 0 ? (totalFtm / totalFta) * 100 : null,
      ftMadePerGame: totalFtm / gp,
      ftAttPerGame: totalFta / gp,
      twoPointPct: totalFga - total3a > 0 ? ((totalFgm - total3m) / (totalFga - total3a)) * 100 : null,
      twoMadePerGame: (totalFgm - total3m) / gp,
      twoAttPerGame: (totalFga - total3a) / gp,
      scoringEfficiency: null,
      shootingEfficiency: null,
    });
  }
  return result;
}

type LeaderSeasonStat = {
  extra: string | null;
  pointsPerGame: number | null;
  reboundsPerGame: number | null;
  stealsPerGame: number | null;
  fieldGoalPct: number | null;
  turnoversPerGame: number | null;
};

// The small "context" line under each leader's headline stat — distinct
// per category so e.g. the assists leader shows TO (not FG%). minutesPerGame
// isn't a stored column, only present inside `extra`'s ESPN category tree.
const LEADER_SECONDARY_STATS: Record<string, { label: string; pick: (s: LeaderSeasonStat | null) => string | null }[]> = {
  pointsPerGame: [
    { label: "MIN", pick: (s) => findStat(s?.extra ?? null, "avgMinutes") },
    { label: "FG%", pick: (s) => fixed1(s?.fieldGoalPct) },
  ],
  assistsPerGame: [
    { label: "PPG", pick: (s) => fixed1(s?.pointsPerGame) },
    { label: "TO", pick: (s) => fixed1(s?.turnoversPerGame) },
  ],
  fieldGoalPercentage: [
    { label: "MIN", pick: (s) => findStat(s?.extra ?? null, "avgMinutes") },
    { label: "PPG", pick: (s) => fixed1(s?.pointsPerGame) },
  ],
  reboundsPerGame: [
    { label: "DRPG", pick: (s) => findStat(s?.extra ?? null, "avgDefensiveRebounds") },
    { label: "ORPG", pick: (s) => findStat(s?.extra ?? null, "avgOffensiveRebounds") },
  ],
  stealsPerGame: [
    { label: "MIN", pick: (s) => findStat(s?.extra ?? null, "avgMinutes") },
    { label: "TO", pick: (s) => fixed1(s?.turnoversPerGame) },
  ],
  blocksPerGame: [
    { label: "STL", pick: (s) => fixed1(s?.stealsPerGame) },
    { label: "REB", pick: (s) => fixed1(s?.reboundsPerGame) },
  ],
};

export async function GET(request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const id = Number(teamId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid team id" }, { status: 400 });
  }

  try {
    const team = await prisma.team.findUnique({
      where: { id },
      include: { division: { include: { conference: true } }, venue: true },
    });
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Seasons this team actually has standings for, newest first — same
    // "standings table is the source of truth for availability" rule the
    // /api/standings route uses, scoped to this team.
    const seasonsWithStandings = await prisma.standing.findMany({
      where: { teamId: id },
      distinct: ["seasonId"],
      select: { season: { select: { id: true, year: true, type: true } } },
      orderBy: { season: { year: "desc" } },
    });
    const availableSeasons = seasonsWithStandings.map((s) => s.season);

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const season = yearParam
      ? availableSeasons.find((s) => s.year === Number(yearParam)) ?? availableSeasons[0]
      : availableSeasons[0];

    if (!season) {
      return NextResponse.json({
        team,
        availableSeasons: [],
        season: null,
        schedule: [],
        roster: [],
        divisionStandings: [],
        news: [],
        teamLeaders: [],
        depthChart: [],
      });
    }

    const [identities, standing, teamSeasonStat, nbaCupStanding, players, schedule, divisionStandings, newsLinks, allTeams] =
      await Promise.all([
        resolveTeamIdentities([id], season.year),
        prisma.standing.findUnique({ where: { teamId_seasonId: { teamId: id, seasonId: season.id } } }),
        prisma.teamSeasonStat.findUnique({ where: { teamId_seasonId: { teamId: id, seasonId: season.id } } }),
        prisma.nbaCupStanding.findUnique({ where: { teamId_seasonId: { teamId: id, seasonId: season.id } } }),
        prisma.player.findMany({
          where: { currentTeamId: id },
          include: { position: true, playerSeasonStats: { where: { seasonId: season.id, teamId: id } } },
          orderBy: { displayName: "asc" },
        }),
        prisma.game.findMany({
          where: { seasonId: season.id, OR: [{ homeTeamId: id }, { awayTeamId: id }] },
          orderBy: { date: "asc" },
          include: { homeTeam: true, awayTeam: true },
        }),
        team.divisionId
          ? prisma.standing.findMany({
              where: { seasonId: season.id, team: { divisionId: team.divisionId } },
              include: { team: true },
              orderBy: { divisionRank: "asc" },
            })
          : Promise.resolve([]),
        prisma.newsArticleTeam.findMany({
          where: { teamId: id },
          orderBy: { newsArticle: { publishedAt: "desc" } },
          take: 8,
          include: { newsArticle: true },
        }),
        prisma.team.findMany({ select: { id: true, espnId: true } }),
      ]);

    const identity = identities.get(id);
    const teamWithIdentity = identity ? { ...team, ...identity } : team;

    const splitParam = searchParams.get("split") ?? "all";
    let splitStatsByPlayerId: Map<number, SplitStat> | null = null;
    if (splitParam !== "all") {
      const gameIds = await resolveSplitGameIds(id, schedule, splitParam, team.divisionId, team.division?.conference.id ?? null);
      const gameStats = await prisma.playerGameStat.findMany({ where: { teamId: id, gameId: { in: gameIds } } });
      splitStatsByPlayerId = aggregatePlayerGameStats(gameStats);
    }

    const roster = players.map((p) => {
      const seasonStat = p.playerSeasonStats[0] ?? null;
      const fullStat = splitStatsByPlayerId
        ? splitStatsByPlayerId.get(p.id) ?? null
        : seasonStat
          ? { ...seasonStat, ...buildFullStat(seasonStat.extra) }
          : null;
      return {
        id: p.id,
        displayName: p.displayName,
        jersey: p.jersey,
        headshotUrl: p.headshotUrl,
        position: p.position,
        age: calculateAge(p.birthDate),
        heightIn: p.heightIn,
        weightLb: p.weightLb,
        college: p.college,
        seasonStat,
        fullStat,
      };
    });

    // `schedule` only has games `sync-completed-games.ts` has ingested,
    // i.e. nothing that hasn't finished yet — fill the rest of the season
    // in live from ESPN's team-schedule endpoint. Best-effort: an ESPN
    // hiccup here shouldn't take down the whole page.
    const knownEspnIds = new Set(schedule.map((g) => g.espnId));
    const espnIdToTeamId = new Map(allTeams.map((t) => [t.espnId, t.id]));
    let upcomingGames: Awaited<ReturnType<typeof getUpcomingGames>> = [];
    try {
      upcomingGames = await getUpcomingGames(team.espnId, season.year);
    } catch {
      upcomingGames = [];
    }
    let coach: Awaited<ReturnType<typeof getTeamCoach>> = null;
    try {
      coach = await getTeamCoach(team.espnId);
    } catch {
      coach = null;
    }
    const upcomingGamesResolved = upcomingGames
      .filter((g) => !knownEspnIds.has(g.espnId))
      .map((g) => ({
        ...g,
        homeTeamId: espnIdToTeamId.get(g.home.espnId) ?? null,
        awayTeamId: espnIdToTeamId.get(g.away.espnId) ?? null,
      }))
      .filter(
        (g): g is typeof g & { homeTeamId: number; awayTeamId: number } => g.homeTeamId != null && g.awayTeamId != null,
      );

    // Opponents (schedule + upcoming games + division standings) should
    // show the era-accurate identity for this season's year, same as the
    // team header.
    const opponentIds = [
      ...new Set([
        ...schedule.flatMap((g) => [g.homeTeamId, g.awayTeamId]),
        ...upcomingGamesResolved.flatMap((g) => [g.homeTeamId, g.awayTeamId]),
        ...divisionStandings.map((s) => s.teamId),
      ]),
    ];
    const opponentIdentities = await resolveTeamIdentities(opponentIds, season.year);

    // Per-game "Hi Points/Rebounds/Assists" for this team's own completed
    // games — same box-score leaders ESPN's team schedule page shows next
    // to each final score.
    const finalGameIds = schedule.filter((g) => g.status === "FINAL").map((g) => g.id);
    const gameStatRows = finalGameIds.length
      ? await prisma.playerGameStat.findMany({
          where: { teamId: id, gameId: { in: finalGameIds } },
          select: {
            gameId: true,
            points: true,
            rebounds: true,
            assists: true,
            player: { select: { id: true, displayName: true } },
          },
        })
      : [];
    type GameLeader = { playerId: number; displayName: string; value: number };
    const gameLeadersById = new Map<number, { points: GameLeader | null; rebounds: GameLeader | null; assists: GameLeader | null }>();
    for (const row of gameStatRows) {
      const current = gameLeadersById.get(row.gameId) ?? { points: null, rebounds: null, assists: null };
      const consider = (stat: "points" | "rebounds" | "assists") => {
        const value = row[stat];
        if (value == null) return;
        if (current[stat] == null || value > current[stat]!.value) {
          current[stat] = { playerId: row.player.id, displayName: row.player.displayName, value };
        }
      };
      consider("points");
      consider("rebounds");
      consider("assists");
      gameLeadersById.set(row.gameId, current);
    }

    // Odds coverage is sparse/era-dependent (see the Odds model comment) —
    // only completed games have a row, since nothing fetches pickcenter for
    // games that haven't been ingested yet.
    const oddsRows = finalGameIds.length
      ? await prisma.odds.findMany({
          where: { gameId: { in: finalGameIds } },
          select: { gameId: true, spread: true, overUnder: true },
        })
      : [];
    const oddsByGameId = new Map(oddsRows.map((o) => [o.gameId, { spread: o.spread, overUnder: o.overUnder }]));

    const scheduleWithIdentities = schedule.map((g) => ({
      ...g,
      broadcast: null as string | null,
      leaders: gameLeadersById.get(g.id) ?? null,
      odds: oddsByGameId.get(g.id) ?? null,
      homeTeam: { ...g.homeTeam, ...(opponentIdentities.get(g.homeTeamId) ?? {}) },
      awayTeam: { ...g.awayTeam, ...(opponentIdentities.get(g.awayTeamId) ?? {}) },
    }));
    const upcomingSchedule = upcomingGamesResolved.map((g) => ({
      // Negative, derived from the (numeric) ESPN event id so it can never
      // collide with a real autoincrement `Game.id` — these rows don't
      // exist in the DB yet, there's nothing else to key them by.
      id: -Number(g.espnId),
      espnId: g.espnId,
      date: g.date,
      status: g.status,
      broadcast: g.broadcast,
      leaders: null,
      odds: null,
      homeScore: null,
      awayScore: null,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      homeTeam: { id: g.homeTeamId, ...opponentIdentities.get(g.homeTeamId) },
      awayTeam: { id: g.awayTeamId, ...opponentIdentities.get(g.awayTeamId) },
    }));
    const fullSchedule = [...scheduleWithIdentities, ...upcomingSchedule].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    const divisionStandingsWithIdentities = divisionStandings.map((s) => ({
      ...s,
      team: { ...s.team, ...(opponentIdentities.get(s.teamId) ?? {}) },
    }));

    const extendedStats = teamSeasonStat
      ? {
          fieldGoalPct: findStat(teamSeasonStat.extra, "fieldGoalPct"),
          threePointPct: findStat(teamSeasonStat.extra, "threePointPct"),
          freeThrowPct: findStat(teamSeasonStat.extra, "freeThrowPct"),
          reboundsPerGame: findStat(teamSeasonStat.extra, "avgRebounds"),
          assistsPerGame: findStat(teamSeasonStat.extra, "avgAssists"),
          turnoversPerGame: findStat(teamSeasonStat.extra, "avgTurnovers"),
          stealsPerGame: findStat(teamSeasonStat.extra, "avgSteals"),
          blocksPerGame: findStat(teamSeasonStat.extra, "avgBlocks"),
        }
      : null;

    const news = newsLinks.map((link) => ({
      id: link.newsArticle.id,
      headline: link.newsArticle.headline,
      description: link.newsArticle.description,
      url: link.newsArticle.url,
      imageUrl: link.newsArticle.imageUrl,
      publishedAt: link.newsArticle.publishedAt,
    }));

    // Best-effort — an ESPN hiccup here shouldn't take down the whole page.
    let teamLeadersRaw: Awaited<ReturnType<typeof getTeamLeaders>> = new Map();
    try {
      teamLeadersRaw = await getTeamLeaders(team.espnId, season.year);
    } catch {
      teamLeadersRaw = new Map();
    }
    const leaderAthleteEspnIds = [...new Set([...teamLeadersRaw.values()].map((l) => l.athleteEspnId))];
    const leaderPlayers = leaderAthleteEspnIds.length
      ? await prisma.player.findMany({
          where: { espnId: { in: leaderAthleteEspnIds } },
          include: { position: true, playerSeasonStats: { where: { seasonId: season.id, teamId: id } } },
        })
      : [];
    const leaderPlayerByEspnId = new Map(leaderPlayers.map((p) => [p.espnId, p]));
    const teamLeaders = LEADER_CATEGORY_DEFS.map(({ group, key }) => {
      const entry = teamLeadersRaw.get(key);
      const player = entry ? leaderPlayerByEspnId.get(entry.athleteEspnId) ?? null : null;
      const seasonStat = player?.playerSeasonStats[0] ?? null;
      const secondaryDefs = LEADER_SECONDARY_STATS[key] ?? [];
      return {
        group,
        key,
        statName: entry?.categoryDisplayName ?? key,
        player: player
          ? {
              id: player.id,
              displayName: player.displayName,
              headshotUrl: player.headshotUrl,
              jersey: player.jersey,
              position: player.position,
            }
          : null,
        displayValue: entry?.displayValue ?? null,
        secondary: secondaryDefs.map((d) => ({ label: d.label, value: d.pick(seasonStat) })),
      };
    });

    // Best-effort — an ESPN hiccup here shouldn't take down the whole page.
    let depthChartRaw: Awaited<ReturnType<typeof getTeamDepthChart>> = [];
    try {
      depthChartRaw = await getTeamDepthChart(team.espnId, season.year);
    } catch {
      depthChartRaw = [];
    }
    const depthChartAthleteEspnIds = [...new Set(depthChartRaw.flatMap((p) => p.athleteEspnIdsByRank))];
    const depthChartPlayers = depthChartAthleteEspnIds.length
      ? await prisma.player.findMany({
          where: { espnId: { in: depthChartAthleteEspnIds } },
          select: { id: true, espnId: true, displayName: true, jersey: true },
        })
      : [];
    const depthChartPlayerByEspnId = new Map(depthChartPlayers.map((p) => [p.espnId, p]));
    const depthChart = depthChartRaw.map((pos) => ({
      abbreviation: pos.abbreviation,
      players: pos.athleteEspnIdsByRank.map((espnId) => {
        const player = depthChartPlayerByEspnId.get(espnId);
        return player ? { id: player.id, displayName: player.displayName, jersey: player.jersey } : null;
      }),
    }));

    return NextResponse.json({
      team: teamWithIdentity,
      season,
      availableSeasons,
      standing,
      teamSeasonStat,
      extendedStats,
      nbaCupStanding,
      roster,
      coach,
      schedule: fullSchedule,
      divisionStandings: divisionStandingsWithIdentities,
      news,
      teamLeaders,
      depthChart,
    });
  } catch {
    return NextResponse.json({ error: "Failed to load team" }, { status: 500 });
  }
}
