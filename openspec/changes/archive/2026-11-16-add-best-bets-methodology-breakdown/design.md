# Design

## Context

`src/app/api/betting/accuracy/route.ts` already builds `bestBetsRows` and `bestBetsCurrentRows` from data that includes `method`, but drops it before pushing:

- `bestBetsRows`: each pushed row comes from `decidedPropsByKey.get(...)`, which resolves to a `decidedProps` entry — and `decidedProps` is spread from `propRows`, which already selects `method`. The field is already on `row` at the push site; it's just not included in the pushed object.
- `bestBetsCurrentRows`: each pushed row comes from a `DailyBestBetCurrent` snapshot entry (`pick`), which has no `method` column at all (confirmed in `prisma/schema.prisma` — `DailyBestBetCurrent` stores `line`/`lean`/`odds`, not `method`). `method` has to be looked up by `(gameId, playerId, statType)` against `propRows`, the same join key `actualValueByKey` already uses for `gradedActualValue`.

## Goals / Non-Goals

**Goals:**
- Make `byMethod` include `bestBets` and `bestBetsCurrent`, computed the same way (`accuracyByMethod`) as the other four categories.
- Keep the frontend's generic, no-hardcoded-tag-name rendering — just add two more category keys to the label map.

**Non-Goals:**
- Not changing Best Bets selection or grading logic — purely adding a `method` dimension to the already-computed accuracy.
- Not adding `method` to the `DailyBestBetCurrent` table itself — the join-by-key lookup is sufficient and avoids a schema change for a value that's already derivable.

## Decisions

**Add `method: row.method` to the `bestBetsRows` push site (it's already in scope); build a `methodByKey` map from `propRows` (mirroring the existing `actualValueByKey` map) for `bestBetsCurrentRows`, since `DailyBestBetCurrent` has no `method` column of its own.**
- *Why*: `propRows` is already the authoritative source for `method` per `(gameId, playerId, statType)` — reusing the same lookup pattern `actualValueByKey` already establishes is the smallest, most consistent addition, and avoids adding a redundant `method` column to `DailyBestBetCurrent` that would need to stay in sync with `PlayerPropProjection.method` itself.

**Add `bestBets: accuracyByMethod(bestBetsRows, r => r.correct)` and `bestBetsCurrent: accuracyByMethod(bestBetsCurrentRows, r => r.correct)` to the `byMethod` object, and extend the frontend's category key union and `METHOD_CATEGORY_LABELS` map with `bestBets: "Best Bets"` / `bestBetsCurrent: "Best Bets (current line)"`.**
- *Why*: matches the existing pattern for the other five categories exactly — no new rendering logic needed in `MethodologyBreakdown`, since it already iterates generically over whatever keys exist in `byMethod`.

## Risks / Trade-offs

- [Risk] `bestBetsCurrentRows`' `method` lookup could miss a pick if the corresponding `propRows` entry isn't graded yet (unlikely in practice, since `bestBetsCurrentRows` is only built from already-graded `actualValueByKey` entries, but worth noting). → Mitigation: `accuracyByMethod` groups by whatever `method` value is present; a pick that can't resolve a method would need an explicit fallback (e.g. skip it) rather than crashing — handled in the task by only including picks where the lookup succeeds, same defensive pattern `actualValueByKey`'s own `undefined` check already uses in this file.
