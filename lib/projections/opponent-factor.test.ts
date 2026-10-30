import { test } from "node:test";
import assert from "node:assert/strict";
import { computeOpponentFactors } from "./opponent-factor";

test("a team that allows more than league average gets a factor above 1", () => {
  const rows = [
    ...Array.from({ length: 6 }, () => ({ teamId: 1, allowedValue: 30 })), // soft defense
    ...Array.from({ length: 6 }, () => ({ teamId: 2, allowedValue: 20 })), // tough defense
  ];
  const factors = computeOpponentFactors(rows);
  assert.ok(factors.get(1)! > 1);
  assert.ok(factors.get(2)! < 1);
});

test("a team with too few games defaults to a neutral factor", () => {
  const rows = [
    { teamId: 1, allowedValue: 40 },
    { teamId: 1, allowedValue: 40 },
    ...Array.from({ length: 6 }, () => ({ teamId: 2, allowedValue: 20 })),
  ];
  const factors = computeOpponentFactors(rows);
  assert.equal(factors.get(1), 1);
});

test("factors are clamped so a small sample can't swing too far", () => {
  const rows = [
    ...Array.from({ length: 6 }, () => ({ teamId: 1, allowedValue: 1000 })),
    ...Array.from({ length: 6 }, () => ({ teamId: 2, allowedValue: 10 })),
  ];
  const factors = computeOpponentFactors(rows);
  assert.ok(factors.get(1)! <= 1.15);
  assert.ok(factors.get(2)! >= 0.85);
});

test("empty input returns an empty map rather than dividing by zero", () => {
  assert.equal(computeOpponentFactors([]).size, 0);
});
