/** The filled-bar primitive shared by `StatBlock`'s own comparison bar and
 * any inline confidence/ratio bar (e.g. betting's `ConfidenceMeter`) that
 * needs the same visual language without the full stat-block card. */
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function ComparisonBar({ pct, color }: { pct: number; color?: string }) {
  return (
    <span className="inline-flex h-1 w-full items-center overflow-hidden rounded-full bg-border">
      <span
        className="block h-full rounded-full"
        style={{
          width: `${Math.min(Math.max(pct, 0), 100)}%`,
          backgroundColor: color ?? "var(--color-accent)",
        }}
      />
    </span>
  );
}

/** Shared label/headline-value/optional-comparison-bar shape, generalized
 * from the three near-identical tiles it replaces: `HeroStat` (player
 * page), `AccuracyTile` (betting page), and `Stat` (player page). Keeping
 * `comparison` optional covers both the plain-total case (no bar) and the
 * confidence/ratio case (a filled bar toward a threshold). Flat (no
 * border) surface with a condensed display headline, per the app's
 * revamped visual language. */
export function StatBlock({
  label,
  value,
  caption,
  comparison,
  href,
}: {
  label: string;
  value: string | number | null;
  caption?: string;
  comparison?: { pct: number; color?: string };
  /** When set, the whole tile becomes a link (e.g. to a page that lists the
   * individual picks behind this number) — a small chevron signals it's
   * interactive without crowding the headline value. */
  href?: string;
}) {
  const content = (
    <>
      <p className="flex items-center justify-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
        {label}
        {href && <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />}
      </p>
      <p className="font-display text-3xl font-extrabold leading-none tracking-tight text-foreground">{value ?? "—"}</p>
      {caption && <p className="mt-0.5 text-xs text-foreground/60 tabular-nums">{caption}</p>}
      {comparison && (
        <span className="mt-2 block">
          <ComparisonBar pct={comparison.pct} color={comparison.color} />
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="min-w-[9rem] rounded-lg bg-surface-muted px-3.5 py-3 text-center transition-colors hover:bg-border/60"
      >
        {content}
      </Link>
    );
  }

  return <div className="min-w-[9rem] rounded-lg bg-surface-muted px-3.5 py-3 text-center">{content}</div>;
}
