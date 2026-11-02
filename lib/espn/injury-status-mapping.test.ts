import { test } from "node:test";
import assert from "node:assert/strict";
import { mapInjuryStatus } from "./injury-status-mapping";

test("mapInjuryStatus maps every known ESPN status to its bucket", () => {
  assert.equal(mapInjuryStatus("Out"), "OUT");
  assert.equal(mapInjuryStatus("Suspended"), "OUT");
  assert.equal(mapInjuryStatus("Suspension"), "OUT");
  assert.equal(mapInjuryStatus("Doubtful"), "DOUBTFUL");
  assert.equal(mapInjuryStatus("Questionable"), "QUESTIONABLE");
  assert.equal(mapInjuryStatus("Day-To-Day"), "QUESTIONABLE");
  assert.equal(mapInjuryStatus("Probable"), "PROBABLE");
  assert.equal(mapInjuryStatus("Available"), "AVAILABLE");
});

test("mapInjuryStatus defaults an unrecognized status to QUESTIONABLE, not AVAILABLE", () => {
  assert.equal(mapInjuryStatus("Some New ESPN Wording"), "QUESTIONABLE");
});
