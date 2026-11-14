"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export interface TeamLite {
  id: number;
  displayName: string;
  abbreviation: string;
  logoUrl: string | null;
  division: { name: string; conference: { name: string } } | null;
}

/** Teams index: every team grouped under its conference and
 * division (the way the league actually organizes them), each as a tile with
 * the team's own color down its edge. The performance leaderboard from the
 * existing page is passed in as-is. */
export function TeamsListA({
  teams,
  accentFor,
  leaderboard,
}: {
  teams: TeamLite[];
  accentFor: (t: TeamLite) => string;
  leaderboard: ReactNode;
}) {
  const conferences = new Map<string, Map<string, TeamLite[]>>();
  for (const t of teams) {
    const conf = t.division?.conference.name ?? "Other";
    const div = t.division?.name ?? "Other";
    const byDiv = conferences.get(conf) ?? new Map<string, TeamLite[]>();
    const list = byDiv.get(div) ?? [];
    list.push(t);
    byDiv.set(div, list);
    conferences.set(conf, byDiv);
  }

  return (
    <div className="space-y-12">
      <header>
        <h1 className="text-5xl leading-none">Teams</h1>
        <p className="mt-2 text-foreground/65">
          {teams.length} teams in {conferences.size} conferences. Pick one for its schedule, roster, stats and news.
        </p>
      </header>

      {Array.from(conferences.entries()).map(([conf, divisions]) => (
        <section key={conf} aria-label={conf}>
          <h2 className="mb-5 text-3xl">{conf}</h2>
          <div className="grid gap-x-6 gap-y-8 lg:grid-cols-3">
            {Array.from(divisions.entries()).map(([div, list]) => (
              <div key={div}>
                <h3 className="mb-2 text-lg text-foreground/60">{div}</h3>
                <ul className="space-y-1.5">
                  {list.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/teams/${t.id}`}
                        className="flex items-center gap-3 rounded-lg bg-surface py-2.5 pl-3.5 pr-4 outline-none transition-shadow hover:shadow-[0_0_0_2px_var(--accent)] focus-visible:ring-2 focus-visible:ring-accent"
                        style={{ borderLeft: `4px solid ${accentFor(t)}` }}
                      >
                        {t.logoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element -- external ESPN CDN images
                          <img src={t.logoUrl} alt="" className="h-9 w-9 shrink-0 object-contain" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-[17px] font-semibold">{t.displayName}</span>
                        <span className="text-sm text-foreground/50">{t.abbreviation}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}

      {leaderboard}
    </div>
  );
}
