import { prisma } from "./db";

export interface TeamIdentity {
  displayName: string;
  abbreviation: string;
  logoUrl: string | null;
}

/**
 * Resolves the era-accurate team identity for a given season year, falling
 * back to the team's current identity if no historical snapshot exists
 * (e.g. recent seasons we haven't run sync-team-identity for yet, or a
 * franchise whose branding hasn't changed). A team's espnId is stable
 * across relocation/rename (e.g. Seattle SuperSonics -> OKC Thunder is one
 * franchise id) — see PLAN.md's historical-backfill research.
 */
export async function resolveTeamIdentities(
  teamIds: number[],
  year: number,
): Promise<Map<number, TeamIdentity>> {
  const [teams, identities] = await Promise.all([
    prisma.team.findMany({
      where: { id: { in: teamIds } },
      select: { id: true, displayName: true, abbreviation: true, logoUrl: true },
    }),
    prisma.teamSeasonIdentity.findMany({
      where: { teamId: { in: teamIds }, year },
    }),
  ]);

  const identityByTeamId = new Map(identities.map((i) => [i.teamId, i]));
  const result = new Map<number, TeamIdentity>();
  for (const team of teams) {
    const historical = identityByTeamId.get(team.id);
    result.set(team.id, {
      displayName: historical?.displayName ?? team.displayName,
      abbreviation: historical?.abbreviation ?? team.abbreviation,
      logoUrl: historical?.logoUrl ?? team.logoUrl,
    });
  }
  return result;
}
