// Shared display helpers for the team-performance-views capability: label
// and tag wording plus signed-margin formatting, used by both the team
// Performance tab and the Teams index leaderboard.

export type PerformanceLabelValue = "STRONG_OVER" | "OVER" | "AS_EXPECTED" | "UNDER" | "STRONG_UNDER";
export type AverageLabelValue = "OVER" | "AS_EXPECTED" | "UNDER";

const LABEL_TEXT: Record<PerformanceLabelValue, string> = {
  STRONG_OVER: "Far above",
  OVER: "Above",
  AS_EXPECTED: "As expected",
  UNDER: "Below",
  STRONG_UNDER: "Far below",
};

const AVERAGE_LABEL_TEXT: Record<AverageLabelValue, string> = {
  OVER: "Overperforming",
  AS_EXPECTED: "As expected",
  UNDER: "Underperforming",
};

export const TAG_TEXT: Record<string, string> = {
  STAR_OUT: "Star out",
  EARLY_BLOWOUT: "Early blowout",
  LATE_COLLAPSE: "Late collapse",
  GARBAGE_TIME_SWING: "Garbage-time swing",
  SHOOTING_HOT: "Hot shooting",
  SHOOTING_COLD: "Cold shooting",
};

const POSITIVE = "text-emerald-600 dark:text-emerald-400";
const NEGATIVE = "text-red-600 dark:text-red-400";
const NEUTRAL = "text-foreground/72";

/** Signed one-decimal margin, e.g. "+3.5" / "-10.5" / "0.0"; "—" when unavailable. */
export function formatMargin(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value === 0) return "0.0";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

/** Text color for a signed margin: green above zero, red below, muted at zero/unavailable. */
export function marginColorClass(value: number | null | undefined): string {
  if (value == null || value === 0) return NEUTRAL;
  return value > 0 ? POSITIVE : NEGATIVE;
}

function labelColorClass(label: PerformanceLabelValue | AverageLabelValue): string {
  if (label === "STRONG_OVER" || label === "OVER") return POSITIVE;
  if (label === "STRONG_UNDER" || label === "UNDER") return NEGATIVE;
  return NEUTRAL;
}

/** Pill for a single game's performance label. */
export function PerformanceLabelPill({ label }: { label: PerformanceLabelValue }) {
  return <span className={`text-xs font-semibold ${labelColorClass(label)}`}>{LABEL_TEXT[label]}</span>;
}

/** Pill for a season-average label (over / as expected / under). */
export function AverageLabelPill({ label }: { label: AverageLabelValue }) {
  return <span className={`text-xs font-semibold ${labelColorClass(label)}`}>{AVERAGE_LABEL_TEXT[label]}</span>;
}
