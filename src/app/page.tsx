import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">NBA Stats</h1>
      <p className="text-neutral-400">
        Live scoreboard (today&rsquo;s/upcoming games) is M8 — not built yet. For now, browse
        completed-season data:
      </p>
      <div className="flex gap-4">
        <Link href="/standings" className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2 hover:border-neutral-600">
          Standings
        </Link>
        <Link href="/teams" className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2 hover:border-neutral-600">
          Teams
        </Link>
        <Link href="/players" className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2 hover:border-neutral-600">
          Players
        </Link>
      </div>
    </div>
  );
}
