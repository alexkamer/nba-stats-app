import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  stripHtmlToParagraphs,
  extractRecap,
  extractPreviewArticle,
  extractEspnPredictor,
  extractTeamStatsBreakdown,
} from "./espn-live";

const __dirname = dirname(fileURLToPath(import.meta.url));
const summaryFixture = JSON.parse(
  readFileSync(join(__dirname, "../../ingest/__fixtures__/summary.json"), "utf8"),
);

test("stripHtmlToParagraphs collapses inline markup to its inner text", () => {
  const result = stripHtmlToParagraphs(
    '<a href="http://www.espn.com/nba/player/_/id/1/jalen-brunson">Jalen Brunson</a> scored 38 points.',
  );
  assert.deepEqual(result, ["Jalen Brunson scored 38 points."]);
});

test("stripHtmlToParagraphs splits on blank lines into separate paragraphs", () => {
  const result = stripHtmlToParagraphs("First paragraph.\n\nSecond paragraph.\n\n\nThird paragraph.");
  assert.deepEqual(result, ["First paragraph.", "Second paragraph.", "Third paragraph."]);
});

test("stripHtmlToParagraphs trims leading/trailing whitespace and drops empty paragraphs", () => {
  const result = stripHtmlToParagraphs("  \n\n  Only paragraph.  \n\n  \n\n");
  assert.deepEqual(result, ["Only paragraph."]);
});

test("extractRecap returns the recap for a game whose article is type Recap", () => {
  const result = extractRecap(summaryFixture);
  assert.ok(result);
  assert.equal(result!.headline, summaryFixture.article.headline);
  assert.equal(result!.description, summaryFixture.article.description);
  assert.ok(result!.paragraphs.length > 0);
});

test("extractRecap returns a null description when the article has none", () => {
  const result = extractRecap({ article: { ...summaryFixture.article, description: undefined } });
  assert.equal(result!.description, null);
});

test("extractRecap returns null when the article type is not Recap", () => {
  const result = extractRecap({ article: { ...summaryFixture.article, type: "Preview" } });
  assert.equal(result, null);
});

test("extractRecap returns null when there is no article", () => {
  assert.equal(extractRecap({}), null);
});

test("extractPreviewArticle returns the preview for a game whose article is type Preview", () => {
  const result = extractPreviewArticle({
    article: { ...summaryFixture.article, type: "Preview" },
  });
  assert.ok(result);
  assert.equal(result!.headline, summaryFixture.article.headline);
  assert.equal(result!.description, summaryFixture.article.description);
  assert.ok(result!.paragraphs.length > 0);
});

test("extractPreviewArticle returns null when the article type is Recap", () => {
  assert.equal(extractPreviewArticle(summaryFixture), null);
});

test("extractPreviewArticle returns null when there is no article", () => {
  assert.equal(extractPreviewArticle({}), null);
});

test("extractEspnPredictor matches teams by id and converts win% strings to numbers", () => {
  const result = extractEspnPredictor(
    { predictor: { homeTeam: { id: "5", gameProjection: "51.3" }, awayTeam: { id: "25", gameProjection: "48.7" } } },
    "5",
    "25",
  );
  assert.deepEqual(result, { homeWinPct: 51.3, awayWinPct: 48.7 });
});

test("extractEspnPredictor returns null when there is no predictor field", () => {
  assert.equal(extractEspnPredictor({}, "5", "25"), null);
});

test("extractEspnPredictor returns null when a team id doesn't match either entry", () => {
  const result = extractEspnPredictor(
    { predictor: { homeTeam: { id: "5", gameProjection: "51.3" }, awayTeam: { id: "25", gameProjection: "48.7" } } },
    "5",
    "999",
  );
  assert.equal(result, null);
});

test("extractTeamStatsBreakdown zips every category by name for both teams", () => {
  const [teamA, teamB] = summaryFixture.boxscore.teams;
  const result = extractTeamStatsBreakdown(summaryFixture.boxscore.teams, teamA.team.id, teamB.team.id);
  assert.ok(result);
  assert.equal(result!.length, teamA.statistics.length);

  const fieldGoalPct = result!.find((row) => row.name === "fieldGoalPct");
  assert.ok(fieldGoalPct);
  assert.equal(fieldGoalPct!.label, "Field Goal %");
  assert.equal(
    fieldGoalPct!.awayDisplay,
    teamA.statistics.find((s: { name: string }) => s.name === "fieldGoalPct").displayValue,
  );
  assert.equal(
    fieldGoalPct!.homeDisplay,
    teamB.statistics.find((s: { name: string }) => s.name === "fieldGoalPct").displayValue,
  );

  const largestLead = result!.find((row) => row.name === "largestLead");
  assert.ok(largestLead);
  assert.equal(largestLead!.label, "Largest Lead");
});

test("extractTeamStatsBreakdown returns null when boxscore teams are empty or missing", () => {
  assert.equal(extractTeamStatsBreakdown([], "1", "2"), null);
  assert.equal(extractTeamStatsBreakdown(undefined, "1", "2"), null);
});
