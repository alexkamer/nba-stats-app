import { test } from "node:test";
import assert from "node:assert/strict";
import { toPropStatType } from "./prop-types";

test("toPropStatType maps every allowlisted ESPN prop type name", () => {
  assert.equal(toPropStatType("Total Points"), "POINTS");
  assert.equal(toPropStatType("Total Rebounds"), "REBOUNDS");
  assert.equal(toPropStatType("Total Assists"), "ASSISTS");
  assert.equal(toPropStatType("Total 3-Point Field Goals"), "THREE_POINTERS_MADE");
  assert.equal(toPropStatType("Total Steals"), "STEALS");
  assert.equal(toPropStatType("Total Blocks"), "BLOCKS");
  assert.equal(toPropStatType("Total Points and Assists"), "POINTS_ASSISTS");
  assert.equal(toPropStatType("Total Points and Rebounds"), "POINTS_REBOUNDS");
  assert.equal(toPropStatType("Total Assists and Rebounds"), "REBOUNDS_ASSISTS");
  assert.equal(toPropStatType("Total Points, Rebounds, and Assists"), "POINTS_REBOUNDS_ASSISTS");
  assert.equal(toPropStatType("To Record a Double Double"), "DOUBLE_DOUBLE");
  assert.equal(toPropStatType("To Record a Triple Double"), "TRIPLE_DOUBLE");
});

test("toPropStatType returns null for an unlisted ESPN prop type name", () => {
  assert.equal(toPropStatType("Total Steals and Blocks"), null);
  assert.equal(toPropStatType("Points Milestones"), null);
  assert.equal(toPropStatType("1st Quarter Spread"), null);
});
