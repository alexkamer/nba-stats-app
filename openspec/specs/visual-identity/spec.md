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
The app's background, surface, border, and accent color tokens SHALL carry one consistent palette across every page, switching between a light and dark variant per the active theme (per `ui-theming`), without any page defining its own one-off color values for these roles.

#### Scenario: Switching themes on any page
- **WHEN** a user toggles between light and dark theme on any page
- **THEN** that page's background, surface, border, and accent colors switch to the corresponding palette variant, matching every other page's switch

### Requirement: Stat blocks and primary navigation use a flat, border-less surface treatment
`StatBlock` and the sidebar navigation SHALL render using a filled background surface rather than a bordered card outline, consistent with the app's flatter visual density.

#### Scenario: Viewing a stat block
- **WHEN** a user views any `StatBlock`
- **THEN** it renders with a filled muted-surface background and no visible border
