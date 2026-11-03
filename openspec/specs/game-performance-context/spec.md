# game-performance-context Specification

## Purpose

Surfaces a specific game's already-computed cover margin, qualitative label, and reason tags for both teams on that game's detail page, so a user looking at one game can see how it graded against the spread without navigating to either team's season Performance tab.

## Requirements

### Requirement: Game detail performance card
The game detail page SHALL display, for a game that has a computed performance row for both teams, each team's cover margin, qualitative label, and reason tags for that game.

#### Scenario: Final game with computed performance rows
- **WHEN** a user views the detail page for a final game that has `TeamGamePerformance` rows for both teams
- **THEN** the page shows both teams' cover margin, qualitative label, and any reason tags for that game

#### Scenario: Game with no computed performance rows
- **WHEN** a user views the detail page for a game that has no `TeamGamePerformance` row (no recorded spread, not a regular-season final, or not yet graded)
- **THEN** the page does not display the performance card

### Requirement: Performance card reads persisted data only
The game detail performance card SHALL display only data already persisted by the team-game-performance-tracking capability and SHALL NOT trigger new computation of cover margins, labels, or tags.

#### Scenario: Viewing an already-graded game
- **WHEN** a user views a game whose performance rows were computed by an earlier ingest run
- **THEN** the page reads and displays those existing rows without recomputing them
