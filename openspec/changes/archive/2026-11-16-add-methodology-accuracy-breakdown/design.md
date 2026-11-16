# Design

## Context

`src/app/api/betting/accuracy/route.ts` already computes `byMethod` (lines ~399-404) as `{ game, spread, total, props, bettableProps }`, each a `Record<string, { graded, correct, hitRate }>` keyed by the `method` string on the corresponding table (`GameProjection.method` for game/spread/total, `PlayerPropProjection.method` for props/bettableProps). It's included in the route's JSON response (`byMethod` at the top level) but `src/app/betting/page.tsx`'s `AccuracySummary` client type doesn't declare it, so nothing reads it.

## Goals / Non-Goals

**Goals:**
- Make the already-computed `byMethod` data visible on the page.
- Work for any method tag, including ones that don't exist yet, without a code change each time a new methodology version ships.

**Non-Goals:**
- Not adding per-method P/L (`unitsPnl`) — `accuracyByMethod`'s return type doesn't include it (confirmed in `lib/accuracy/compute-accuracy.ts`), and adding it would be a backend change beyond this proposal's read-only-presentation scope.
- Not building a drill-down page (like `/betting/accuracy/[bucket]`) per method tag — that page's shape (individual picks, P/L chart, unit-size control) answers a different question ("show me every pick in this bucket") than this one ("compare these methodology eras at a glance"). A summary table is sufficient; drilling into a specific method's individual picks can be a later addition if it turns out to be wanted.
- Not changing how `byMethod` is computed or what categories it covers.

## Decisions

**Render as a new, separate section below the existing Accuracy scoreboard (`AccuracyStrip`), not folded into it.**
- *Why*: the existing scoreboard's axis is prediction *source* (our model vs. ESPN vs. market favorite); this section's axis is methodology *version over time* within just "our model." Mixing the two into one set of tiles would conflate two different questions. A labeled, separate section keeps both legible.

**One small table per accuracy category that has 2+ method tags with `graded > 0`, each row a method tag with its graded/correct/hitRate — category entirely omitted if it only has one tag with data.**
- *Why*: matches the spec's "nothing to compare against" scenario directly, and avoids a table with a single, meaningless row. Category order: whatever order `Object.keys` on the API's `byMethod` object yields (game, spread, total, props, bettableProps per the route's current field order) — no need for a fixed display-order mapping given this is a small, secondary section.

**Method tags are opaque strings here — no hardcoded display names or descriptions.**
- *Why*: the existing drill-down page's `METHODOLOGY` lookup (`src/app/betting/accuracy/[bucket]/page.tsx`) hardcodes a human-readable description per bucket slug, which works because buckets are a small, fixed, rarely-changing set. Method tags accumulate over time (already 4 for props, more to come) and are already written as readable-enough strings (`v3-season-scoped`, `v4-tuned-minutes-trend`) — maintaining a parallel lookup table that must be updated every time a change bumps a method tag would be exactly the kind of upkeep this feature exists to avoid needing in the first place.

## Risks / Trade-offs

- [Risk] A category with many historical method tags (e.g. props, now at 4) could produce a visually busy table as more ship over time. → Mitigation: not addressed now — out of scope; if it becomes a real problem, collapsing older/low-volume tags behind a "show more" toggle is a natural, small follow-up, not a reason to block this first version.
