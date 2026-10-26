// Shapes confirmed against ingest/__fixtures__/roster.json during the M2
// exploration spike. Draft info (draftYear/draftRound/draftPick) isn't
// present on the roster payload — it's left null here and would be filled
// in by a future athlete-overview ingestion job (SPEC.md Sec 7 lists that
// endpoint; not built in M3, which is roster-scoped reference data only).

export interface EspnRosterAthlete {
  id: string;
  fullName: string;
  displayName: string;
  headshot?: { href: string };
  jersey?: string;
  height?: number;
  weight?: number;
  dateOfBirth?: string;
  birthPlace?: { city?: string; state?: string; country?: string };
  college?: { name?: string };
  status?: { type?: string };
  position?: { id: string; name: string; abbreviation: string };
}

export interface PositionUpsertInput {
  espnId: string;
  name: string;
  abbreviation: string;
}

export interface PlayerUpsertInput {
  espnId: string;
  fullName: string;
  displayName: string;
  headshotUrl: string | null;
  jersey: string | null;
  positionId: number | null;
  currentTeamId: number;
  heightIn: number | null;
  weightLb: number | null;
  birthDate: Date | null;
  birthPlace: string | null;
  college: string | null;
  active: boolean;
}

export function mapPosition(position: EspnRosterAthlete["position"]): PositionUpsertInput | null {
  if (!position) return null;
  return {
    espnId: position.id,
    name: position.name,
    abbreviation: position.abbreviation,
  };
}

export function mapPlayer(
  athlete: EspnRosterAthlete,
  positionId: number | null,
  currentTeamId: number,
): PlayerUpsertInput {
  const birthPlaceParts = [
    athlete.birthPlace?.city,
    athlete.birthPlace?.state,
    athlete.birthPlace?.country,
  ].filter(Boolean);

  return {
    espnId: athlete.id,
    fullName: athlete.fullName,
    displayName: athlete.displayName,
    headshotUrl: athlete.headshot?.href ?? null,
    jersey: athlete.jersey ?? null,
    positionId,
    currentTeamId,
    heightIn: athlete.height ?? null,
    weightLb: athlete.weight ?? null,
    birthDate: athlete.dateOfBirth ? new Date(athlete.dateOfBirth) : null,
    birthPlace: birthPlaceParts.length ? birthPlaceParts.join(", ") : null,
    college: athlete.college?.name ?? null,
    active: athlete.status?.type ? athlete.status.type === "active" : true,
  };
}
