import type { ReactNode } from "react";

/** Card shell shared by Bio/Overview sections: header bar colored by the
 * team's accent, body below. */
export function SectionCard({
  title,
  accentColor,
  action,
  children,
}: {
  title: string;
  accentColor: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-surface overflow-hidden">
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border"
        style={{ borderBottomColor: accentColor }}
      >
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
