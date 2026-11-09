import { prisma } from "@/lib/db";
import { getDailyBestBetSnapshot } from "@/lib/daily-best-bets";
import { computeAccuracy } from "@lib/accuracy/compute-accuracy";
import {
  BEST_BETS_PER_DAY,
  HIGH_CONFIDENCE_EDGE_RATIO,
  computeEdgeRatio,
  marginToWinPct,
} from "@lib/projections/confidence";
import { selectBestBets } from "@lib/betting/select-best-bets";
import { NextResponse } from "next/server";

// Serves the accuracy strip's drill-down pages (src/app/betting/accuracy/[bucket]/page.tsx)
// — the same picks that back each of the five accuracy-strip tiles on
// /betting, listed out individually so the headline number can be checked
// pick-by-pick instead of taken on faith. Every filter/selection here is
// copy-identical to src/app/api/betting/accuracy/route.ts, which computes
// the headline numbers themselves — kept in sync by hand since the two
// routes serve different shapes (one summary number vs. a row list) and
// can't share a single query.

const BUCKETS = [
  "model",
  "espn",
  "recommended",
  "high-confidence",
  "best-bets",
] as const;
type Bucket = (typeof BUCKETS)[number];

const TITLES: Record<Bucket, string> = {
  model: "Our model, this season",
  espn: "ESPN's predictor",
  recommended: "Our recommended props",
  "high-confidence": `High-confidence props (≥${HIGH_CONFIDENCE_EDGE_RATIO.toFixed(1)}σ)`,
  "best-bets": "Best bets",
};

const TEAM_SELECT = { id: true, abbreviation: true, name: true } as const;

interface VerificationPick {
  id: string;
  date: string;
  type: "game" | "prop";
  gameEspnId: string;
  playerId: number | null;
  playerName: string | null;
  statType: string | null;
  label: string;
  pickDescription: string;
  line: string | null;
  projected: string;
  actual: string;
  // Display-ready confidence reading — "1.3σ" for a prop's edge over the
  // line, "68% win prob." for a game's projected-margin-derived win chance
  // — not a single comparable unit, since the "model" bucket pools both
  // pick types (same as the headline accuracy number it verifies).
  confidence: string | null;
  // American odds for the side we actually picked, at whatever the market
  // showed last (odds aren't frozen at pick time the way the projection
  // itself is — see Odds/PlayerPropOdds models) — "—" when never captured.
  odds: string | null;
  correct: boolean;
}

function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fmtNum(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

/** American odds, e.g. +150 / -110 — same house convention used across the
 * betting and research pages (each keeps a local copy rather than a shared
 * import, per those files' own comments). */
function formatOdds(odds: number | null): string {
  if (odds === null) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

async function gamePicks(where: object): Promise<VerificationPick[]> {
  const rows = await prisma.gameProjection.findMany({
    where,
    select: {
      gradedCorrect: true,
      projectedMargin: true,
      marginStdev: true,
      game: {
        select: {
          espnId: true,
          date: true,
          homeScore: true,
          awayScore: true,
          homeTeam: { select: TEAM_SELECT },
          awayTeam: { select: TEAM_SELECT },
          odds: { select: { homeMoneyline: true, awayMoneyline: true } },
        },
      },
    },
  });
  return rows
    .filter((r) => r.gradedCorrect !== null)
    .map((r) => {
      const pickedHome = r.projectedMargin >= 0;
      const picked = pickedHome ? r.game.homeTeam : r.game.awayTeam;
      const actualWinner =
        r.game.homeScore !== null && r.game.awayScore !== null
          ? r.game.homeScore >= r.game.awayScore
            ? r.game.homeTeam
            : r.game.awayTeam
          : null;
      const winPct = marginToWinPct(r.projectedMargin, r.marginStdev);
      const pickedMoneyline = pickedHome
        ? (r.game.odds?.homeMoneyline ?? null)
        : (r.game.odds?.awayMoneyline ?? null);
      return {
        id: `game-${r.game.espnId}`,
        date: r.game.date.toISOString(),
        type: "game" as const,
        gameEspnId: r.game.espnId,
        playerId: null,
        playerName: null,
        statType: null,
        label: `${r.game.awayTeam.abbreviation} @ ${r.game.homeTeam.abbreviation}`,
        pickDescription: `Picked ${picked.abbreviation} to win`,
        line: null,
        projected: `${picked.abbreviation} by ${fmtNum(Math.abs(r.projectedMargin))}`,
        actual:
          actualWinner && r.game.homeScore !== null && r.game.awayScore !== null
            ? `${r.game.awayTeam.abbreviation} ${r.game.awayScore}, ${r.game.homeTeam.abbreviation} ${r.game.homeScore} (${actualWinner.abbreviation} won)`
            : "—",
        confidence:
          winPct !== null
            ? `${(pickedHome ? winPct : 100 - winPct).toFixed(0)}% win prob.`
            : null,
        odds: formatOdds(pickedMoneyline),
        correct: r.gradedCorrect as boolean,
      };
    });
}

async function espnPicks(): Promise<VerificationPick[]> {
  const rows = await prisma.predictorSnapshot.findMany({
    where: { gradedAt: { not: null } },
    select: {
      gradedCorrect: true,
      homeWinPct: true,
      awayWinPct: true,
      game: {
        select: {
          espnId: true,
          date: true,
          homeScore: true,
          awayScore: true,
          homeTeam: { select: TEAM_SELECT },
          awayTeam: { select: TEAM_SELECT },
          odds: { select: { homeMoneyline: true, awayMoneyline: true } },
        },
      },
    },
  });
  return rows
    .filter((r) => r.gradedCorrect !== null)
    .map((r) => {
      const pickedHome = r.homeWinPct >= r.awayWinPct;
      const picked = pickedHome ? r.game.homeTeam : r.game.awayTeam;
      const pickedPct = Math.max(r.homeWinPct, r.awayWinPct);
      const actualWinner =
        r.game.homeScore !== null && r.game.awayScore !== null
          ? r.game.homeScore >= r.game.awayScore
            ? r.game.homeTeam
            : r.game.awayTeam
          : null;
      const pickedMoneyline = pickedHome
        ? (r.game.odds?.homeMoneyline ?? null)
        : (r.game.odds?.awayMoneyline ?? null);
      return {
        id: `espn-${r.game.espnId}`,
        date: r.game.date.toISOString(),
        type: "game" as const,
        gameEspnId: r.game.espnId,
        playerId: null,
        playerName: null,
        statType: null,
        label: `${r.game.awayTeam.abbreviation} @ ${r.game.homeTeam.abbreviation}`,
        pickDescription: `Picked ${picked.abbreviation} to win (${pickedPct.toFixed(0)}%)`,
        line: null,
        projected: `${picked.abbreviation}, ${pickedPct.toFixed(0)}% win prob.`,
        actual:
          actualWinner && r.game.homeScore !== null && r.game.awayScore !== null
            ? `${r.game.awayTeam.abbreviation} ${r.game.awayScore}, ${r.game.homeTeam.abbreviation} ${r.game.homeScore} (${actualWinner.abbreviation} won)`
            : "—",
        confidence: `${pickedPct.toFixed(0)}% win prob.`,
        odds: formatOdds(pickedMoneyline),
        correct: r.gradedCorrect as boolean,
      };
    });
}

async function propRows() {
  return prisma.playerPropProjection.findMany({
    where: { gradedAt: { not: null } },
    select: {
      gameId: true,
      playerId: true,
      statType: true,
      bettable: true,
      line: true,
      projectedValue: true,
      stdev: true,
      gradedCorrect: true,
      gradedActualValue: true,
      player: { select: { displayName: true } },
      game: {
        select: {
          espnId: true,
          date: true,
          playerPropOdds: {
            select: { playerId: true, statType: true, side: true, odds: true },
          },
        },
      },
    },
  });
}

function toPropPick(
  r: Awaited<ReturnType<typeof propRows>>[number],
  edgeRatio: number | null,
): VerificationPick {
  const side = r.line !== null && r.projectedValue > r.line ? "OVER" : "UNDER";
  // Odds are per-side (OVER/UNDER each get their own American odds, see
  // betting-odds-ingest) — match the side we actually leaned, same as
  // /api/betting/upcoming does for the live page.
  const oddsRow = r.game.playerPropOdds.find(
    (o) =>
      o.playerId === r.playerId && o.statType === r.statType && o.side === side,
  );
  return {
    id: `prop-${r.gameId}-${r.playerId}-${r.statType}`,
    date: r.game.date.toISOString(),
    type: "prop",
    gameEspnId: r.game.espnId,
    playerId: r.playerId,
    playerName: r.player.displayName,
    statType: r.statType,
    label: r.player.displayName,
    pickDescription: `${side === "OVER" ? "Over" : "Under"} ${fmtNum(r.line)} ${r.statType.replaceAll("_", " ").toLowerCase()}`,
    line: r.line !== null ? fmtNum(r.line) : null,
    projected: fmtNum(r.projectedValue),
    actual: fmtNum(r.gradedActualValue),
    confidence: edgeRatio !== null ? `${edgeRatio.toFixed(1)}σ` : null,
    odds: formatOdds(oddsRow?.odds ?? null),
    correct: r.gradedCorrect as boolean,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bucket: string }> },
) {
  const { bucket: bucketParam } = await params;
  if (!BUCKETS.includes(bucketParam as Bucket)) {
    return NextResponse.json(
      { error: "Unknown accuracy bucket" },
      { status: 404 },
    );
  }
  const bucket = bucketParam as Bucket;

  try {
    let picks: VerificationPick[];

    if (bucket === "model") {
      const [games, props] = await Promise.all([
        gamePicks({ gradedAt: { not: null } }),
        propRows(),
      ]);
      const propsWithEdge = props
        .filter((r) => r.gradedCorrect !== null)
        .map((r) =>
          toPropPick(r, computeEdgeRatio(r.projectedValue, r.line, r.stdev)),
        );
      picks = [...games, ...propsWithEdge];
    } else if (bucket === "espn") {
      picks = await espnPicks();
    } else {
      const rows = (await propRows()).filter((r) => r.gradedCorrect !== null);
      const withEdge = rows.map((r) => ({
        ...r,
        edgeRatio: computeEdgeRatio(r.projectedValue, r.line, r.stdev) ?? 0,
      }));

      if (bucket === "recommended") {
        picks = withEdge
          .filter((r) => r.bettable)
          .map((r) => toPropPick(r, r.edgeRatio));
      } else if (bucket === "high-confidence") {
        picks = withEdge
          .filter((r) => r.edgeRatio >= HIGH_CONFIDENCE_EDGE_RATIO)
          .map((r) => toPropPick(r, r.edgeRatio));
      } else {
        // best-bets: for any day with a locked-in DailyBestBet snapshot
        // (see src/lib/daily-best-bets.ts), list exactly that frozen
        // selection — only a day that predates this table, or one nobody
        // ever loaded live, falls back to the old live-recompute-from-
        // final-data selectBestBets call, same as the headline accuracy
        // route.
        const withEdgeByKey = new Map(
          withEdge.map((r) => [`${r.gameId}|${r.playerId}|${r.statType}`, r]),
        );
        const byDay = new Map<string, typeof withEdge>();
        for (const row of withEdge.filter((r) => r.bettable)) {
          const key = dayKey(row.game.date);
          const group = byDay.get(key);
          if (group) group.push(row);
          else byDay.set(key, [row]);
        }
        const selected: typeof withEdge = [];
        for (const [day, dayProps] of byDay.entries()) {
          const snapshot = await getDailyBestBetSnapshot(day);
          if (snapshot) {
            for (const pick of snapshot) {
              const row = withEdgeByKey.get(
                `${pick.gameId}|${pick.playerId}|${pick.statType}`,
              );
              if (row) selected.push(row);
            }
          } else {
            selected.push(...selectBestBets(dayProps, BEST_BETS_PER_DAY));
          }
        }
        picks = selected.map((r) => toPropPick(r, r.edgeRatio));
      }
    }

    picks.sort((a, b) => b.date.localeCompare(a.date));
    const summary = computeAccuracy(picks.map((p) => p.correct));

    return NextResponse.json({ bucket, title: TITLES[bucket], summary, picks });
  } catch (error) {
    console.error(`GET /api/betting/accuracy/${bucketParam} failed:`, error);
    return NextResponse.json(
      { error: "Failed to load accuracy verification data" },
      { status: 500 },
    );
  }
}
