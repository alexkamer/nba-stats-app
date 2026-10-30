import { test } from "node:test";
import assert from "node:assert/strict";
import { isIngestableGame, mapGame, type EspnScoreboardEvent } from "./game";

function baseEvent(overrides: Partial<EspnScoreboardEvent>): EspnScoreboardEvent {
  return {
    id: "1",
    date: "2026-11-01T00:00:00Z",
    season: { year: 2026, type: 2 },
    status: { type: { name: "STATUS_SCHEDULED", completed: false } },
    competitions: [
      {
        status: { type: { completed: false } },
        competitors: [
          { homeAway: "home", team: { id: "1" } },
          { homeAway: "away", team: { id: "2" } },
        ],
      },
    ],
    ...overrides,
  };
}

test("isIngestableGame accepts a scheduled regular-season event", () => {
  assert.equal(isIngestableGame(baseEvent({})), true);
});

test("isIngestableGame rejects preseason", () => {
  assert.equal(isIngestableGame(baseEvent({ season: { year: 2026, type: 1 } })), false);
});

test("mapGame maps a scheduled event with status SCHEDULED and null scores", () => {
  const result = mapGame(baseEvent({}), 10, 20, null, 1);
  assert.equal(result.status, "SCHEDULED");
  assert.equal(result.homeScore, null);
  assert.equal(result.awayScore, null);
});

test("mapGame maps an in-progress event with status LIVE", () => {
  const event = baseEvent({
    status: { type: { name: "STATUS_IN_PROGRESS", completed: false } },
    competitions: [
      {
        status: { type: { completed: false } },
        competitors: [
          { homeAway: "home", team: { id: "1" }, score: "40" },
          { homeAway: "away", team: { id: "2" }, score: "38" },
        ],
      },
    ],
  });
  const result = mapGame(event, 10, 20, null, 1);
  assert.equal(result.status, "LIVE");
  // Only FINAL scores are trusted (see mapGame comment) — in-progress
  // scores are not persisted onto the Game row by this mapper.
  assert.equal(result.homeScore, null);
});

test("mapGame maps a completed event with status FINAL and real scores", () => {
  const event = baseEvent({
    status: { type: { name: "STATUS_FINAL", completed: true } },
    competitions: [
      {
        status: { type: { completed: true } },
        competitors: [
          { homeAway: "home", team: { id: "1" }, score: "110" },
          { homeAway: "away", team: { id: "2" }, score: "102" },
        ],
      },
    ],
  });
  const result = mapGame(event, 10, 20, null, 1);
  assert.equal(result.status, "FINAL");
  assert.equal(result.homeScore, 110);
  assert.equal(result.awayScore, 102);
});
