import { test } from "node:test";
import assert from "node:assert/strict";
import { getTeamAccent } from "./team-accent";

test("valid, sufficiently-contrasting team color is used as-is (light theme)", () => {
  const result = getTeamAccent("552583", "light"); // Lakers purple
  assert.equal(result.accent, "#552583");
});

test("valid, sufficiently-contrasting team color is used as-is (dark theme)", () => {
  const result = getTeamAccent("fdb927", "dark"); // Lakers gold
  assert.equal(result.accent, "#fdb927");
});

test("null color falls back to the neutral accent", () => {
  assert.deepEqual(getTeamAccent(null, "light"), { accent: "#ea580c", accentForeground: "#ffffff" });
  assert.deepEqual(getTeamAccent(null, "dark"), { accent: "#fb923c", accentForeground: "#1c1917" });
});

test("undefined color falls back to the neutral accent", () => {
  assert.deepEqual(getTeamAccent(undefined, "light"), { accent: "#ea580c", accentForeground: "#ffffff" });
});

test("malformed color string falls back to the neutral accent", () => {
  assert.deepEqual(getTeamAccent("not-a-color", "light"), { accent: "#ea580c", accentForeground: "#ffffff" });
});

test("low-contrast color against the theme background falls back to the neutral accent", () => {
  // Near-white, barely distinguishable from the light background.
  const result = getTeamAccent("fafaf8", "light");
  assert.equal(result.accent, "#ea580c");
});

test("accepts a leading '#' and normalizes case", () => {
  assert.deepEqual(getTeamAccent("#552583", "light"), getTeamAccent("552583", "light"));
  assert.deepEqual(getTeamAccent("552583", "light"), getTeamAccent("552583".toUpperCase(), "light"));
});
