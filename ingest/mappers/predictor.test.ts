import { test } from "node:test";
import assert from "node:assert/strict";
import { mapPredictor } from "./predictor";

test("mapPredictor maps home/away win probability", () => {
  const result = mapPredictor(
    {
      homeTeam: { id: "27", gameProjection: "52.8" },
      awayTeam: { id: "30", gameProjection: "47.2" },
    },
    1,
  );
  assert.ok(result);
  assert.equal(result.gameId, 1);
  assert.equal(result.homeWinPct, 52.8);
  assert.equal(result.awayWinPct, 47.2);
  assert.ok(result.capturedAt instanceof Date);
});

test("mapPredictor returns null when predictor is absent", () => {
  assert.equal(mapPredictor(undefined, 1), null);
});

test("mapPredictor returns null when predictor is malformed", () => {
  assert.equal(
    mapPredictor({ homeTeam: { id: "27", gameProjection: "n/a" }, awayTeam: { id: "30", gameProjection: "47.2" } }, 1),
    null,
  );
});
