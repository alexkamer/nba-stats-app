/**
 * Maps ESPN's free-text injury report `status` field (not a documented
 * enum — see `src/lib/espn-team-injuries.ts`) to the fixed
 * `AvailabilityStatus` buckets the betting projections pipeline needs (see
 * player-availability-tracking capability, design.md "Status resolution").
 */
export type AvailabilityStatus = "OUT" | "DOUBTFUL" | "QUESTIONABLE" | "PROBABLE" | "AVAILABLE";

const ESPN_STATUS_TO_AVAILABILITY: Record<string, AvailabilityStatus> = {
  Out: "OUT",
  Suspended: "OUT",
  Suspension: "OUT",
  "Injured Reserve": "OUT",
  Doubtful: "DOUBTFUL",
  Questionable: "QUESTIONABLE",
  "Game-Time Decision": "QUESTIONABLE",
  "Day-To-Day": "QUESTIONABLE",
  Probable: "PROBABLE",
  Available: "AVAILABLE",
};

/**
 * An unrecognized status maps to QUESTIONABLE and logs a warning — never to
 * AVAILABLE, so a mapping gap introduced by an ESPN wording change can't
 * silently treat an actually-out player as available.
 */
export function mapInjuryStatus(espnStatus: string): AvailabilityStatus {
  const mapped = ESPN_STATUS_TO_AVAILABILITY[espnStatus];
  if (mapped) return mapped;
  console.warn(`mapInjuryStatus: unrecognized ESPN injury status "${espnStatus}", defaulting to QUESTIONABLE`);
  return "QUESTIONABLE";
}
