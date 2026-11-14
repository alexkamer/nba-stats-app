# visual-identity Specification

## Purpose
Defines the app's typography (a distinct display typeface for headings and stat numbers, separate from body text) and the color palette tokens used consistently across all pages.

## Requirements

### Requirement: Headings and stat headline values use a distinct display typeface
Page headings (`h1`/`h2`/`h3`) and stat-block headline values SHALL render in a condensed display typeface distinct from the body/UI typeface, applied consistently across every page rather than per-page.

#### Scenario: Viewing any page's title
- **WHEN** a user views any page's `h1` heading
- **THEN** that heading renders in the app's display typeface, not the body typeface

#### Scenario: Viewing a stat block's headline number
- **WHEN** a user views a `StatBlock`'s headline value (per `stat-block-display`)
- **THEN** that value renders in the display typeface

### Requirement: Body and tabular text use a distinct body typeface
Body text, labels, and tabular/dense data SHALL render in a body typeface distinct from the display typeface, chosen for legibility at small sizes.

#### Scenario: Viewing a dense data table
- **WHEN** a user views a page with a dense data table (e.g. a box score)
- **THEN** that table's text renders in the body typeface, not the display typeface

### Requirement: Color tokens apply consistently across light and dark themes
The app's background, surface, border, accent, win and loss color tokens SHALL carry one consistent palette across every page, switching between a light and dark variant per the active theme (per `ui-theming`), without any page defining its own one-off color values for these roles. Win and loss colors SHALL read at normal text contrast on both themes' surfaces.

#### Scenario: Switching themes on any page
- **WHEN** a user toggles between light and dark theme on any page
- **THEN** that page's background, surface, border, accent, win and loss colors switch to the corresponding palette variant, matching every other page's switch

#### Scenario: Result colors on a light surface
- **WHEN** a result, streak or margin is shown in green or red on a light surface
- **THEN** it uses the win or loss token and meets normal-text contrast

### Requirement: Stat blocks and primary navigation use a flat, border-less surface treatment
`StatBlock` and the sidebar navigation SHALL render using a filled background surface rather than a bordered card outline, consistent with the app's flatter visual density.

#### Scenario: Viewing a stat block
- **WHEN** a user views any `StatBlock`
- **THEN** it renders with a filled muted-surface background and no visible border

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
