import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSummaryPrompt, buildPreviewPrompt, type BriefingDayFacts, type BriefingPreviewFacts } from "./summary";

const BASE_FACTS: BriefingDayFacts = {
  gameCount: 2,
  scores: [
    { home: "Lakers", homeScore: 124, away: "Hawks", awayScore: 114 },
    { home: "Mavericks", homeScore: 110, away: "Nuggets", awayScore: 108 },
  ],
  topPerformer: null,
  topScorer: null,
};

test("buildSummaryPrompt includes game count and states the winner explicitly for every score", () => {
  const prompt = buildSummaryPrompt(BASE_FACTS);
  assert.match(prompt, /Games played: 2/);
  assert.match(prompt, /Lakers beat Hawks, 124-114/);
  assert.match(prompt, /Mavericks beat Nuggets, 110-108/);
});

test("buildSummaryPrompt states the away team as winner when it has the higher score", () => {
  const prompt = buildSummaryPrompt({
    ...BASE_FACTS,
    scores: [{ home: "Celtics", homeScore: 97, away: "Bucks", awayScore: 117 }],
  });
  assert.match(prompt, /Bucks beat Celtics, 117-97/);
});

test("buildSummaryPrompt includes a triple-double callout without the raw combined-stat number", () => {
  const prompt = buildSummaryPrompt({
    ...BASE_FACTS,
    topPerformer: { name: "Nikola Jokic", pointsReboundsAssists: 38, tripleDouble: true },
  });
  assert.match(prompt, /did NOT happen across every game.*Nikola Jokic recorded a triple-double/);
  // The raw PRA number is deliberately not passed to the model — see the
  // comment in summary.ts on why it's a reliable hallucination trigger.
  assert.doesNotMatch(prompt, /38/);
});

test("buildSummaryPrompt omits the top-performer fact entirely when it wasn't a triple-double", () => {
  const prompt = buildSummaryPrompt({
    ...BASE_FACTS,
    topPerformer: { name: "Nikola Jokic", pointsReboundsAssists: 38, tripleDouble: false },
  });
  assert.doesNotMatch(prompt, /Nikola Jokic/);
  assert.doesNotMatch(prompt, /Triple-double of the night/);
});

test("buildSummaryPrompt includes the top scorer when present, framed as a single game", () => {
  const prompt = buildSummaryPrompt({ ...BASE_FACTS, topScorer: { name: "Luka Doncic", points: 45 } });
  assert.match(prompt, /did NOT happen across every game.*Luka Doncic scored 45 points in that one game/);
});

test("buildSummaryPrompt omits performer/scorer fact lines when absent", () => {
  const prompt = buildSummaryPrompt(BASE_FACTS);
  assert.doesNotMatch(prompt, /Triple-double of the night/);
  assert.doesNotMatch(prompt, /Top-scoring individual game of the night/);
});

test("buildSummaryPrompt calls out the closest game and the biggest blowout", () => {
  const prompt = buildSummaryPrompt(BASE_FACTS);
  assert.match(prompt, /Closest game of the night: Mavericks edged Nuggets by 2/);
  assert.match(prompt, /Biggest blowout of the night: Lakers routed Hawks by 10/);
});

test("buildSummaryPrompt omits closest/blowout callouts when every game has the same margin", () => {
  const prompt = buildSummaryPrompt({
    ...BASE_FACTS,
    scores: [
      { home: "Lakers", homeScore: 110, away: "Hawks", awayScore: 100 },
      { home: "Mavericks", homeScore: 100, away: "Nuggets", awayScore: 90 },
    ],
  });
  assert.doesNotMatch(prompt, /Closest game/);
  assert.doesNotMatch(prompt, /Biggest blowout/);
});

test("buildSummaryPrompt calls out the highest-scoring shootout when distinct from closest/blowout", () => {
  const prompt = buildSummaryPrompt({
    ...BASE_FACTS,
    gameCount: 3,
    scores: [
      { home: "Lakers", homeScore: 124, away: "Hawks", awayScore: 114 }, // margin 10, total 238
      { home: "Mavericks", homeScore: 110, away: "Nuggets", awayScore: 108 }, // margin 2 (closest), total 218
      { home: "Warriors", homeScore: 138, away: "Pelicans", awayScore: 87 }, // margin 51 (blowout), total 225
    ],
  });
  assert.match(prompt, /Highest-scoring game of the night \(a shootout\): Lakers beat Hawks 124-114, 238 combined points\./);
});

test("buildSummaryPrompt omits the shootout callout when it coincides with the closest or blowout game", () => {
  const prompt = buildSummaryPrompt(BASE_FACTS); // only 2 games: the blowout game is also the highest-scoring one
  assert.doesNotMatch(prompt, /Highest-scoring game of the night/);
});

test("buildSummaryPrompt asks for an exciting multi-sentence recap, not a single flat sentence", () => {
  const prompt = buildSummaryPrompt(BASE_FACTS);
  assert.match(prompt, /3 to 5 short sentences/);
  assert.match(prompt, /exciting/);
});

test("buildSummaryPrompt tells the model to vary its result phrasing instead of repeating 'X beat Y'", () => {
  const prompt = buildSummaryPrompt(BASE_FACTS);
  assert.match(prompt, /do not repeat the exact pattern 'X beat Y' more than once/);
});

const BASE_PREVIEW_FACTS: BriefingPreviewFacts = {
  gameCount: 3,
  matchups: [
    { home: "Lakers", away: "Hawks", marketSpread: -4.5 },
    { home: "Mavericks", away: "Nuggets", marketSpread: -1 },
    { home: "Celtics", away: "Bucks", marketSpread: -12 },
  ],
};

test("buildPreviewPrompt includes the game count and the full schedule as unlabeled context", () => {
  const prompt = buildPreviewPrompt(BASE_PREVIEW_FACTS);
  assert.match(prompt, /Games scheduled tonight: 3/);
  assert.match(prompt, /Hawks at Lakers, market spread -4\.5/);
  assert.match(prompt, /Nuggets at Mavericks, market spread -1/);
  assert.match(prompt, /Bucks at Celtics, market spread -12/);
});

test("buildPreviewPrompt highlights the tightest spread and the biggest mismatch as distinct facts", () => {
  const prompt = buildPreviewPrompt(BASE_PREVIEW_FACTS);
  assert.match(prompt, /Most competitive-looking matchup by market spread: Nuggets at Mavericks, market spread -1/);
  assert.match(prompt, /Biggest mismatch on paper by market spread: Bucks at Celtics, market spread -12/);
});

test("buildPreviewPrompt omits the mismatch highlight when it's the same game as the tightest spread", () => {
  const prompt = buildPreviewPrompt({
    gameCount: 1,
    matchups: [{ home: "Lakers", away: "Hawks", marketSpread: -4.5 }],
  });
  assert.match(prompt, /Most competitive-looking matchup/);
  assert.doesNotMatch(prompt, /Biggest mismatch on paper/);
});

test("buildPreviewPrompt omits spread highlights entirely when no matchup has a market spread", () => {
  const prompt = buildPreviewPrompt({ gameCount: 1, matchups: [{ home: "Lakers", away: "Hawks", marketSpread: null }] });
  assert.doesNotMatch(prompt, /Most competitive-looking matchup/);
  assert.doesNotMatch(prompt, /Biggest mismatch on paper/);
});

test("buildPreviewPrompt forbids stating a result and inventing matchups beyond the highlighted ones", () => {
  const prompt = buildPreviewPrompt(BASE_PREVIEW_FACTS);
  assert.match(prompt, /have NOT been played yet/);
  assert.match(prompt, /Never say a team 'won', 'beat', or state a score/);
  assert.match(prompt, /do not describe or invent storylines for games not highlighted above/);
});
