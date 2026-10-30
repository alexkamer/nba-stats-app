# Spec Delta

## Purpose

Defines how pages with a clear team context derive their accent color dynamically from that team's brand colors, instead of a fixed brand accent.

## ADDED Requirements

### Requirement: Team pages use the team's brand accent
A team detail page SHALL use that team's ESPN brand color as its accent color, adjusted as needed for readability against the active theme (light or dark).

#### Scenario: Viewing a team page
- **WHEN** a user views a specific team's detail page
- **THEN** the page's accent color matches that team's ESPN brand color, legible against both light and dark theme backgrounds

### Requirement: Player pages use the player's current team accent
A player detail page SHALL use the accent color of the player's current team.

#### Scenario: Viewing a player page
- **WHEN** a user views a player's detail page
- **THEN** the page's accent color matches the ESPN brand color of that player's current team

### Requirement: Game pages use a dual accent for both teams
A game detail page SHALL present both competing teams' brand colors as a split/dual accent, rather than selecting a single team's color.

#### Scenario: Viewing a game page
- **WHEN** a user views a specific game's detail page
- **THEN** the home team's brand color and the away team's brand color are both visually represented as accents on that page (e.g. in the score header and team-specific sections), with neither team's color fully overriding the other

### Requirement: Pages without a single team context use a neutral fallback accent
A page that has no single team or game context (e.g. home, standings, players index, news) SHALL use a neutral fallback brand accent instead of any specific team's color.

#### Scenario: Viewing the standings page
- **WHEN** a user views the standings page, which lists many teams
- **THEN** the page's accent color is the neutral fallback brand accent, not any individual team's color

### Requirement: Accent color falls back gracefully when team color data is missing
If a team's ESPN color data is missing or unusable (e.g. null, or too low-contrast against the active theme), the system SHALL fall back to the neutral brand accent for that page instead of rendering an invalid or illegible accent.

#### Scenario: Team with no color data
- **WHEN** a user views a team, player, or game page where the relevant team's ESPN `color`/`alternateColor` fields are null
- **THEN** the page renders using the neutral fallback brand accent for that team's portion of the UI
