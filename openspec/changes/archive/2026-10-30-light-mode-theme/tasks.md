# Tasks

## 1. Theme foundation

- [x] 1.1 Add `next-themes` dependency and verify `npm install` / `npm run build` succeeds
- [x] 1.2 Define semantic CSS variable tokens (`--background`, `--foreground`, `--surface`, `--surface-muted`, `--border`, `--accent`, `--accent-foreground`) with light values as base and dark overrides under `.dark` in `src/app/globals.css`, and verify tokens resolve to expected values by inspecting computed styles in both themes
- [x] 1.3 Wrap the app in `ThemeProvider` (`defaultTheme="light"`, `enableSystem={false}`, `attribute="class"`) in `src/app/providers.tsx`, add `suppressHydrationWarning` to `<html>` in `src/app/layout.tsx`, and verify no flash-of-wrong-theme on reload with a stored dark preference
- [x] 1.4 Build a theme toggle control in the header of `src/app/layout.tsx` and verify clicking it switches `html` class between light/dark without a full page reload
- [x] 1.5 Verify theme preference persists: set dark, reload the page, confirm dark theme is retained (satisfies ui-theming "Theme preference persists across sessions")

## 2. Team accent utility

- [x] 2.1 Implement a shared `getTeamAccent(color, theme)` utility (contrast check against active theme background, falls back to neutral brand accent when color is missing or fails contrast) and verify with unit tests covering: valid color, null color, low-contrast color, in both themes
- [x] 2.2 Define the neutral fallback brand accent token and verify it renders correctly in both themes

## 3. Rewrite layout and small files

- [x] 3.1 Rewrite `src/app/layout.tsx` hardcoded classes to theme tokens and verify the header/nav render correctly in both themes
- [x] 3.2 Rewrite `src/components/TabPager.tsx` and `src/components/SectionCard.tsx` to theme tokens and verify both render correctly in both themes
- [x] 3.3 Rewrite `src/app/page.tsx`, `src/app/news/page.tsx`, `src/app/players/page.tsx`, `src/app/teams/page.tsx` to theme tokens (neutral fallback accent, per team-accent-theming "Pages without a single team context") and verify each renders correctly in both themes

## 4. Rewrite standings page

- [x] 4.1 Rewrite `src/app/standings/page.tsx` to theme tokens with the neutral fallback accent and verify it renders correctly in both themes

## 5. Rewrite team detail page with dynamic accent

- [x] 5.1 Rewrite `src/app/teams/[teamId]/page.tsx` hardcoded classes to theme tokens and verify it renders correctly in both themes
- [x] 5.2 Wire the team's ESPN `color`/`alternateColor` through `getTeamAccent` as the page's accent and verify by viewing teams with distinct brand colors, confirming the accent changes per team (satisfies team-accent-theming "Team pages use the team's brand accent")
- [x] 5.3 Verify graceful fallback by viewing a team with null color data, confirming the neutral accent renders instead of a broken/invalid color

## 6. Rewrite player detail page with dynamic accent

- [x] 6.1 Rewrite `src/app/players/[athleteId]/page.tsx` hardcoded classes to theme tokens and verify it renders correctly in both themes
- [x] 6.2 Wire the player's current team color through `getTeamAccent` as the page's accent and verify by viewing players on different teams, confirming the accent matches each player's team (satisfies team-accent-theming "Player pages use the player's current team accent")

## 7. Rewrite game detail page with dual accent

- [x] 7.1 Rewrite `src/app/games/[eventId]/page.tsx` hardcoded classes to theme tokens and verify it renders correctly in both themes
- [x] 7.2 Set `--accent-home` and `--accent-away` CSS custom properties scoped to the page root from both teams' ESPN colors, and apply them in the score header and box score columns; verify both teams' colors render simultaneously on a live game page (satisfies team-accent-theming "Game pages use a dual accent for both teams")
- [x] 7.3 Verify graceful fallback when one team's color data is null, confirming only that team's portion falls back to neutral while the other team's color still renders

## 8. Cross-cutting verification

- [x] 8.1 Grep the codebase for the hardcoded dark-only class patterns identified during exploration (`bg-(neutral|gray|slate|zinc|black)-`, `text-(white|neutral|gray|slate)-`, `border-(neutral|gray|slate)-`) and verify zero remaining matches outside `node_modules`
- [x] 8.2 Manually walk through every route (home, standings, players index, player detail, teams index, team detail, game detail, news) in both light and dark theme, verifying no illegible or unstyled contrast issues
