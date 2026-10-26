// Shapes confirmed against ingest/__fixtures__/teams.json and team.json
// during the M2 exploration spike.

export interface EspnSiteTeamListItem {
  id: string;
  name: string;
  location: string;
  displayName: string;
  abbreviation: string;
  color?: string;
  alternateColor?: string;
  logos?: { href: string }[];
}

export interface EspnTeamDetail {
  team: {
    franchise?: {
      venue?: {
        id: string;
        fullName: string;
        address?: { city?: string; state?: string };
      };
    };
  };
}

export interface TeamUpsertInput {
  espnId: string;
  name: string;
  location: string;
  displayName: string;
  abbreviation: string;
  color: string | null;
  alternateColor: string | null;
  logoUrl: string | null;
  divisionId: number | null;
  venueId: number | null;
}

export interface VenueUpsertInput {
  espnId: string;
  name: string;
  city: string | null;
  state: string | null;
  capacity: number | null;
}

export function mapVenue(venue: NonNullable<EspnTeamDetail["team"]["franchise"]>["venue"]): VenueUpsertInput | null {
  if (!venue) return null;
  return {
    espnId: venue.id,
    name: venue.fullName,
    city: venue.address?.city ?? null,
    state: venue.address?.state ?? null,
    capacity: null, // not present in this payload; no other endpoint surfaced it during M2
  };
}

export function mapTeam(
  siteTeam: EspnSiteTeamListItem,
  divisionId: number | null,
  venueId: number | null,
): TeamUpsertInput {
  return {
    espnId: siteTeam.id,
    name: siteTeam.name,
    location: siteTeam.location,
    displayName: siteTeam.displayName,
    abbreviation: siteTeam.abbreviation,
    color: siteTeam.color ?? null,
    alternateColor: siteTeam.alternateColor ?? null,
    logoUrl: siteTeam.logos?.[0]?.href ?? null,
    divisionId,
    venueId,
  };
}
