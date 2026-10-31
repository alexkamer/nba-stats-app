# game-team-stats Specification

## Purpose

Presents the complete per-team statistical category breakdown for a game — beyond the small set of fields persisted in the database — on the game detail page's Team Stats tab, sourced live from ESPN.

## Requirements

### Requirement: Full team statistics extraction
The system SHALL extract every named statistical category reported for both teams in a game's ESPN summary data (e.g. shooting splits, rebound splits, turnovers, fouls, fast break points, points in paint, largest lead), using each category's own label and pre-formatted display value rather than recomputing them, and SHALL make this breakdown available regardless of whether the game's box score is otherwise sourced from the database or proxied live.

#### Scenario: Game with a full statistical breakdown available
- **WHEN** a game's ESPN summary reports per-team statistical categories
- **THEN** the system extracts each category's label and each team's display value for it, for both teams

#### Scenario: Database-backed and live-proxied games both expose the breakdown
- **WHEN** a game detail request is served from the database (a finished, ingested game) or proxied live (a game not yet ingested)
- **THEN** the same full statistical breakdown is available to the Team Stats tab in both cases

### Requirement: Team Stats tab full breakdown display
The Team Stats tab SHALL display every extracted statistical category as an away-team-vs-home-team comparison, labeled by the category's own label.

#### Scenario: Viewing the Team Stats tab for a game with stats available
- **WHEN** a user opens the Team Stats tab for a game whose statistical breakdown has been extracted
- **THEN** the tab displays each category as a row showing the away team's value, the category label, and the home team's value

### Requirement: Team Stats tab empty state
The Team Stats tab SHALL display an explicit "no team stats yet" message whenever no statistical breakdown is available for the current game (for example, a scheduled game that has not started), rather than an empty or broken view.

#### Scenario: Viewing the Team Stats tab before team stats exist
- **WHEN** a user opens the Team Stats tab for a game that has no statistical breakdown available yet
- **THEN** the tab displays a message indicating team stats are not yet available for this game
