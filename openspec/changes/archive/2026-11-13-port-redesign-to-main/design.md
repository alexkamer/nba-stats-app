# Design

## Context

The converged design lives, uncommitted, in `../nba-stats-app-template` (branch `template-redesign`, 15 modified files plus `src/components/templates/`, `src/lib/game-status.ts` and its test). It is gated by a `LayoutProvider`/`?layout=` switch: pages swap in layout-A components when `layout === "a"`, and per-layout tokens sit under `html[data-layout="a"]` in `templates.css`. Several flattening rules are scoped with `[data-game]`, `[data-player]`, `[data-team]` and a global readable-colors rule for legacy `text-red-*`/`text-green-*` classes. Layout-A components are in `variants/a/`, shared bits in `variants/shared.tsx` and `sections.tsx`, Briefing in `variants/c/BriefingC.tsx`.

## Goals / Non-Goals

**Goals:**
- `main` ends with layout A as the only layout, visually identical to the reviewed worktree.
- No draft scaffolding left in the tree.
- The pre-existing bugs and the additive API field are carried over and tested where practical.

**Non-Goals:**
- No further redesign. Anything the owner has not reviewed in the worktree stays as it was.
- No Prisma schema change and no change to ingest.

## Decisions

### D1. Port by copy, not merge
The worktree has no commits and branched from an older `main`. Compare `main` against the worktree's merge base first; if `main` moved in files the port touches, reconcile by hand. Then copy the worktree's changes in, and prune. A cherry-pick is not possible.

### D2. Collapse the switch, keep the code
Treat layout A as unconditional: drop every `isA`/`ready && layout === "a"` branch and keep the A side, delete the baseline side. Keep the baseline component only where A still reuses it (for example sub-tabs that inherit A's tokens). `LayoutProvider`, `LayoutSwitcher`, `StubShell`, `TemplateShell`, variants b, c (except `BriefingC`), d and e are deleted along with their fonts.

### D3. Tokens go global
Move layout A's token block from `html[data-layout="a"]` to `:root`/`.dark` in `globals.css` (with `--win`/`--loss`), and the Briefing scope's tokens (C's block) to a `[data-scope="briefing"]` selector. Fonts: keep Archivo (with the width axis) only; the body and display font roles point to it. The `[data-game]`, `[data-player]`, `[data-team]` rules stay as scoped CSS in a new `src/app/page-styles.css` imported from `globals.css` unless a rule is trivially expressible as component classes, in which case it moves to the component. Folding every rule into utility classes is out of scope; the review risk outweighs the benefit.

### D4. Components move out of `templates/`
`variants/a/*` become `src/components/` siblings grouped by page (`shell/`, `home/`, `betting/`, `game/`, `player/`, `team/`, `standings/`), `shared.tsx` and `sections.tsx` become `src/components/ui/`. Names and props do not change, to keep the diff reviewable. `home-data.ts`, `useScoreboardToday.ts` and `Wordmark.tsx` move with them.

### D5. Fixes keep their tests
`src/lib/game-status.ts` and `game-status.test.ts` come across unchanged and `npx tsx --test` must pass. The additive `recent` field on `/api/betting/upcoming` stays optional in the TypeScript types so old cached responses still parse.

### D6. Dark-mode team accents
Add a small helper (`readableAccent(hex, theme)`) that lightens a color whose contrast against the dark surface is below 3:1, used by the player scoring bars and the header strips. Light theme keeps raw colors.

### D7. Verification
The change is visual, so the gate is the worktree's own method: the CDP sweep and shot scripts (kept in `/tmp/tpl-scripts`, to be copied into the job dir if `/tmp` is cleared) at 1440, 1024, 768 and 390px, light and dark, comparing against the worktree's screenshots, plus `tsc`, lint and the unit test.

## Risks / Trade-offs

- **Uncommitted source:** if the worktree is deleted before the port lands, the design is lost. Delete it only at the end, after the port is committed. Mitigation: first task is a backup commit on `template-redesign`.
- **Main drifted:** `main` has commits the worktree lacks (D1). Mitigation: diff first.
- **Port regressions:** removing the baseline branches could change pages the owner never reviewed. Mitigation: D7, plus the earlier 15-route sweep.
- **Dark-mode gaps:** the halftime appearance and some phone views were never verified live; they stay open and are noted, not claimed.
