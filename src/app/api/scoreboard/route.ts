import { getScoreboard } from "@/lib/espn-live";
import { NextResponse } from "next/server";

// Live proxy only (SPEC.md Sec 4) — never persisted. The client always
// supplies `date` computed from its own local clock (SPEC.md Sec 9.3 — "today"
// means the viewer's local date, which only the browser knows).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!date || !/^\d{8}$/.test(date)) {
    return NextResponse.json({ error: "Missing or invalid `date` query param (expected YYYYMMDD)" }, { status: 400 });
  }

  try {
    const games = await getScoreboard(date);
    return NextResponse.json({ date, games });
  } catch {
    return NextResponse.json({ error: "Failed to load scoreboard" }, { status: 500 });
  }
}
