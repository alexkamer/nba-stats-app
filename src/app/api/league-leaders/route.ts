import { prisma } from "@/lib/db";
import { isEspnOnly } from "@/lib/data-source";
import { getLeagueLeaders, MAX_LEADERS_PER_CATEGORY } from "@/lib/espn-league-leaders";
import { getActivePlayersLive } from "@/lib/espn-players-list";
import { getTeamsLive } from "@/lib/espn-teams-list";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const limitParam = Number(new URL(request.url).searchParams.get("limit"));
    const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LEADERS_PER_CATEGORY) : 5;
    const categoriesRaw = await getLeagueLeaders();
    const athleteEspnIds = [...new Set(categoriesRaw.flatMap((c) => c.leaders.map((l) => l.athleteEspnId)))];
    const teamEspnIds = [...new Set(categoriesRaw.flatMap((c) => c.leaders.map((l) => l.teamEspnId)))];

    let playerByEspnId: Map<string, { displayName: string; headshotUrl: string | null }>;
    let teamByEspnId: Map<string, { abbreviation: string; logoUrl: string | null }>;

    if (isEspnOnly()) {
      const [players, teams] = await Promise.all([getActivePlayersLive(), getTeamsLive()]);
      playerByEspnId = new Map(
        players
          .filter((p) => athleteEspnIds.includes(p.espnId))
          .map((p) => [p.espnId, { displayName: p.displayName, headshotUrl: p.headshotUrl }]),
      );
      teamByEspnId = new Map(
        teams
          .filter((t) => teamEspnIds.includes(t.espnId))
          .map((t) => [t.espnId, { abbreviation: t.abbreviation, logoUrl: t.logoUrl }]),
      );
    } else {
      const [players, teams] = await Promise.all([
        prisma.player.findMany({
          where: { espnId: { in: athleteEspnIds } },
          select: { espnId: true, displayName: true, headshotUrl: true },
        }),
        prisma.team.findMany({
          where: { espnId: { in: teamEspnIds } },
          select: { espnId: true, abbreviation: true, logoUrl: true },
        }),
      ]);
      playerByEspnId = new Map(players.map((p) => [p.espnId, p]));
      teamByEspnId = new Map(teams.map((t) => [t.espnId, t]));
    }

    const categories = categoriesRaw.map((category) => ({
      key: category.key,
      label: category.label,
      abbreviation: category.abbreviation,
      leaders: category.leaders
        .map((entry) => {
          const player = playerByEspnId.get(entry.athleteEspnId);
          if (!player) return null;
          const team = teamByEspnId.get(entry.teamEspnId) ?? null;
          return {
            espnId: entry.athleteEspnId,
            displayName: player.displayName,
            headshotUrl: player.headshotUrl,
            teamAbbreviation: team?.abbreviation ?? null,
            teamLogoUrl: team?.logoUrl ?? null,
            displayValue: entry.displayValue,
          };
        })
        .filter((l): l is NonNullable<typeof l> => l !== null)
        .slice(0, limit),
    }));

    return NextResponse.json({ categories });
  } catch {
    return NextResponse.json({ error: "Failed to load league leaders" }, { status: 500 });
  }
}
