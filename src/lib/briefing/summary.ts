import { prisma } from "@/lib/db";
import { generateWithOllama } from "@/lib/ollama";

/**
 * Generated recap/preview line (briefing-summary-generation). Mirrors
 * `getDailyBestBetSnapshot`/`lockInDailyBestBets`'s "read existing, else
 * compute and lock in" shape (see src/lib/daily-best-bets.ts), with one
 * addition: a date can hold a PREVIEW (written before its own games are
 * final, hyping up the slate still to come) that gets replaced exactly
 * once by a RECAP the first time the date's games are found to be final.
 * A RECAP, once written, is never replaced again.
 */

export interface BriefingDayFacts {
  gameCount: number;
  scores: Array<{ home: string; homeScore: number; away: string; awayScore: number }>;
  topPerformer: { name: string; pointsReboundsAssists: number; tripleDouble: boolean } | null;
  topScorer: { name: string; points: number } | null;
}

export interface BriefingPreviewFacts {
  gameCount: number;
  matchups: Array<{ home: string; away: string; marketSpread: number | null }>;
}

interface ScoredGame {
  winner: string;
  loser: string;
  winnerScore: number;
  loserScore: number;
  margin: number;
  totalPoints: number;
}

function toScoredGame(s: BriefingDayFacts["scores"][number]): ScoredGame {
  const winner = s.homeScore >= s.awayScore ? s.home : s.away;
  const loser = winner === s.home ? s.away : s.home;
  const winnerScore = winner === s.home ? s.homeScore : s.awayScore;
  const loserScore = winner === s.home ? s.awayScore : s.homeScore;
  return { winner, loser, winnerScore, loserScore, margin: winnerScore - loserScore, totalPoints: s.homeScore + s.awayScore };
}

const RECAP_STYLE_RULES = [
  "You are writing the opening blurb for an NBA daily briefing email — think an energetic sports-radio hype man, not a dry box score.",
  "Write EXACTLY 3 to 5 short sentences total, maximum 90 words, that feel exciting and fun to read, with a clear hook in the first sentence. Vary your sentence openers.",
  "Use a different verb/phrase to describe each game's result — do not repeat the exact pattern 'X beat Y' more than once in the whole recap. Mix in phrases like 'held off', 'cruised past', 'stunned', 'outlasted', 'ran away with it', 'escaped with a win', etc., matched to how close or lopsided that particular game actually was.",
  "You do NOT have room to mention every game — pick 3 to 4 of the most interesting facts below (e.g. the closest game, the biggest blowout, the highest-scoring shootout, a standout individual performance) and build the recap around those, covering as many *different* games as you can rather than repeating the same one or two.",
  "Use only the facts listed below. Do not invent any player, team, score, or stat not listed. Do not pick a 'storyline' that isn't explicitly one of the facts below.",
  "Do not add descriptive claims not in the facts below either — no 'career-high', 'season-best', 'first time', historic/record claims, or similar, unless that exact claim is stated in the facts.",
  "Do not guess which specific game a league-wide stat line (stat leader / top scorer) belongs to — report it as its own fact, not attached to one of the games above.",
  "Use each team's exact name as given below, word for word. Never substitute a similarly-named team (e.g. the Lakers and the Clippers are two different teams — do not mix them up) or swap which team was home vs. away.",
  "The ONLY player names you are allowed to write are the exact ones given below (if any). Do NOT substitute a different, more famous player you associate with one of these teams — if a fact names a specific player, use that exact name and no other, even if a different player for that team is better known.",
  "Write plain prose only — no markdown, no bullet points, no headers.",
];

/** Deterministic, inspectable prompt text — kept separate from the network
 * call so its content can be unit-tested without hitting the model. Input
 * is limited to already-computed digest facts (per the spec), never raw
 * box-score/play-by-play data. Explicitly calls out the night's closest
 * game, biggest blowout, and highest-scoring shootout (all derived from
 * the same score facts, not new data) so the model has several distinct,
 * concrete storylines to build an engaging recap around instead of just
 * restating a flat list of scores or leaning on the same one or two games
 * every time. */
export function buildSummaryPrompt(facts: BriefingDayFacts): string {
  const games = facts.scores.map(toScoredGame);
  const lines: string[] = [
    `Games played: ${facts.gameCount}`,
    ...games.map((g) => `${g.winner} beat ${g.loser}, ${g.winnerScore}-${g.loserScore}`),
  ];

  if (games.length > 0) {
    const closest = [...games].sort((a, b) => a.margin - b.margin)[0];
    const blowout = [...games].sort((a, b) => b.margin - a.margin)[0];
    if (closest.margin !== blowout.margin) {
      lines.push(`Closest game of the night: ${closest.winner} edged ${closest.loser} by ${closest.margin}.`);
      lines.push(`Biggest blowout of the night: ${blowout.winner} routed ${blowout.loser} by ${blowout.margin}.`);
    }
    const shootout = [...games].sort((a, b) => b.totalPoints - a.totalPoints)[0];
    if (shootout.totalPoints !== closest.totalPoints && shootout.totalPoints !== blowout.totalPoints) {
      lines.push(
        `Highest-scoring game of the night (a shootout): ${shootout.winner} beat ${shootout.loser} ` +
          `${shootout.winnerScore}-${shootout.loserScore}, ${shootout.totalPoints} combined points.`,
      );
    }
  }

  // The raw combined points+rebounds+assists number (e.g. "38") is a
  // confusing stat for a small model to narrate faithfully — testing
  // against the real model this app uses showed it repeatedly garbling or
  // fabricating a number from it even with heavy clarification. Only the
  // qualitative triple-double flag is passed through; without it, this
  // fact isn't included at all rather than risk a hallucinated number.
  // "did NOT happen across every game" / "no team or opponent given" are
  // both load-bearing: testing against the real model showed it will
  // otherwise (a) spread a standalone stat across every game listed, or
  // (b) fall back on its own real-world knowledge of which team that
  // player "actually" plays for and invent a whole fake score/opponent to
  // match — e.g. inventing "Mavericks beat Knicks 103-99" out of nowhere
  // because it associates Luka Doncic with Dallas.
  if (facts.topPerformer?.tripleDouble) {
    lines.push(
      `Triple-double of the night (one player, in their own single game — this did NOT happen across every game listed above): ` +
        `${facts.topPerformer.name} recorded a triple-double (do not state a specific numeric stat total for this — just that it was a triple-double). ` +
        `No team or opponent is given for this fact — do not guess or invent one, and do not invent any score for this player's game.`,
    );
  }
  if (facts.topScorer) {
    lines.push(
      `Top-scoring individual game of the night (one player, in their own single game — this did NOT happen across every game listed above): ` +
        `${facts.topScorer.name} scored ${facts.topScorer.points} points in that one game. ` +
        `The player's name is exactly "${facts.topScorer.name}" — do not write any other player's name for this fact, even if a more famous player plays for a team mentioned elsewhere in this prompt. ` +
        `No team or opponent is given for this fact — do not guess or invent one (even from your own knowledge of what team this player plays for), and do not invent a score, opponent, or game result for them beyond the ${facts.topScorer.points}-point total already given.`,
    );
  }

  return [...RECAP_STYLE_RULES, "", ...lines].join("\n");
}

const PREVIEW_STYLE_RULES = [
  "You are writing the opening blurb for an NBA daily briefing email, previewing TONIGHT's upcoming games — think an energetic sports-radio hype man teasing the night ahead, not a dry schedule listing.",
  "These games have NOT been played yet. Never say a team 'won', 'beat', or state a score — you only know who's playing, not what happens.",
  "Write EXACTLY 2 to 3 short sentences total, maximum 55 words, with a clear hook in the first sentence. Vary your sentence openers.",
  "Only mention the 1 or 2 matchups explicitly highlighted below (the most competitive-looking game and/or the biggest mismatch on paper). You may mention the total game count, but do NOT name, describe, or invent any other matchup beyond the highlighted one(s) — there is a longer schedule below for context only, not for you to pick from freely.",
  "Use only the facts listed below. Do not invent any player, team, or number not listed.",
  "Use each team's exact name as given below, word for word. Never substitute a similarly-named team (e.g. the Lakers and the Clippers are two different teams — do not mix them up) or swap which team is home vs. away.",
  "Write plain prose only — no markdown, no bullet points, no headers.",
];

interface Matchup {
  home: string;
  away: string;
  marketSpread: number | null;
}

function formatMatchup(m: Matchup): string {
  return m.marketSpread != null ? `${m.away} at ${m.home}, market spread ${m.marketSpread}` : `${m.away} at ${m.home}`;
}

/** Preview-mode counterpart to `buildSummaryPrompt`, used only before the
 * viewed date's own games are final (see briefing-summary-generation's
 * preview/recap split). Highlights at most two concrete matchups (the
 * tightest spread and the biggest mismatch) the same way the recap
 * highlights the closest game/biggest blowout — testing against the real
 * model showed that handing it a longer raw matchup list to "pick from
 * freely" led it to invent entire matchups that weren't scheduled at all,
 * not just misname a team. Narrowing to 1-2 pre-picked matchups, with the
 * rest demoted to unlabeled context, fixed that. */
export function buildPreviewPrompt(facts: BriefingPreviewFacts): string {
  const withSpread = facts.matchups.filter((m): m is Matchup & { marketSpread: number } => m.marketSpread != null);

  const lines: string[] = [`Games scheduled tonight: ${facts.gameCount}`];

  if (withSpread.length > 0) {
    const tightest = [...withSpread].sort((a, b) => Math.abs(a.marketSpread) - Math.abs(b.marketSpread))[0];
    const biggestMismatch = [...withSpread].sort((a, b) => Math.abs(b.marketSpread) - Math.abs(a.marketSpread))[0];
    lines.push(`Most competitive-looking matchup by market spread: ${formatMatchup(tightest)}`);
    if (biggestMismatch.home !== tightest.home || biggestMismatch.away !== tightest.away) {
      lines.push(`Biggest mismatch on paper by market spread: ${formatMatchup(biggestMismatch)}`);
    }
  }

  lines.push(
    "Full schedule tonight (context only — do not describe or invent storylines for games not highlighted above):",
    ...facts.matchups.map(formatMatchup),
  );

  return [...PREVIEW_STYLE_RULES, "", ...lines].join("\n");
}

async function callModel(prompt: string): Promise<string | null> {
  try {
    const text = await generateWithOllama(prompt);
    return text.length > 0 ? text : null;
  } catch {
    // Generation failure/timeout: the briefing omits the summary line
    // rather than erroring the whole page (see briefing-summary-generation
    // "Omitted on generation failure").
    return null;
  }
}

/** Reads an existing summary for `dateKey`, or generates and persists one.
 * Once the viewed date's own games are final (`hasFinalGames`), a RECAP is
 * generated and frozen forever — overwriting any earlier PREVIEW for that
 * same date exactly once, the first time `hasFinalGames` is true. Before
 * that, if `previewFacts` is non-null (there's a schedule to tease), a
 * PREVIEW is generated and reused for the rest of the day without being
 * regenerated on every view. Returns `null` when there's nothing to show
 * (no games at all, or generation failed). `generate` is injectable for
 * tests that need to assert call counts without a real model call. */
export async function getOrGenerateBriefingSummary(
  dateKey: string,
  recapFacts: BriefingDayFacts,
  hasFinalGames: boolean,
  previewFacts: BriefingPreviewFacts | null = null,
  generate: (prompt: string) => Promise<string | null> = callModel,
): Promise<string | null> {
  const existing = await prisma.briefingSummary.findUnique({ where: { date: dateKey } });

  if (existing && (existing.kind === "RECAP" || !hasFinalGames)) {
    return existing.text;
  }

  if (hasFinalGames) {
    const text = await generate(buildSummaryPrompt(recapFacts));
    if (!text) return existing?.text ?? null;
    return upsertSummary(dateKey, text, "RECAP");
  }

  if (!previewFacts || previewFacts.gameCount === 0) return null;

  const text = await generate(buildPreviewPrompt(previewFacts));
  if (!text) return null;
  return upsertSummary(dateKey, text, "PREVIEW");
}

async function upsertSummary(dateKey: string, text: string, kind: "PREVIEW" | "RECAP"): Promise<string> {
  try {
    await prisma.briefingSummary.upsert({
      where: { date: dateKey },
      create: { date: dateKey, text, kind },
      update: { text, kind },
    });
  } catch {
    // Race between two concurrent "first request of the day" callers —
    // whichever write lost just reads back the winner's text, same
    // convention as lockInDailyBestBets.
    const winner = await prisma.briefingSummary.findUnique({ where: { date: dateKey } });
    return winner?.text ?? text;
  }
  return text;
}
