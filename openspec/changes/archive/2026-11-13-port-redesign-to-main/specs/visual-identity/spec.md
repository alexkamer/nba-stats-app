# Spec Delta

## MODIFIED Requirements

### Requirement: Color tokens apply consistently across light and dark themes
The app's background, surface, border, accent, win and loss color tokens SHALL carry one consistent palette across every page, switching between a light and dark variant per the active theme (per `ui-theming`), without any page defining its own one-off color values for these roles. Win and loss colors SHALL read at normal text contrast on both themes' surfaces.

#### Scenario: Switching themes on any page
- **WHEN** a user toggles between light and dark theme on any page
- **THEN** that page's background, surface, border, accent, win and loss colors switch to the corresponding palette variant, matching every other page's switch

#### Scenario: Result colors on a light surface
- **WHEN** a result, streak or margin is shown in green or red on a light surface
- **THEN** it uses the win or loss token and meets normal-text contrast

## ADDED Requirements

### Requirement: Cards are flat and headers are contained
Page sections SHALL render as filled surfaces without outlines, and entity headers (game, team, player) SHALL be contained cards within the content column, with a thin team-colored strip as their only accent.

#### Scenario: Viewing a game header
- **WHEN** a user views any game page
- **THEN** the header is a filled card inside the content column with a thin strip in the two teams' colors

### Requirement: The Briefing has its own quiet theme
Briefing pages SHALL render in a scoped theme (porcelain surface, cobalt accent, large quiet type) distinct from the rest of the app while keeping the shared shell.

#### Scenario: Opening the Briefing
- **WHEN** a user opens the Briefing or a dated Briefing
- **THEN** the content area uses the Briefing theme and the rail keeps the app theme
