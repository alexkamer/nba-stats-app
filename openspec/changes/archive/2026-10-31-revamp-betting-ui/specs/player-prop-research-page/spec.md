# Spec Delta

## ADDED Requirements

### Requirement: Multi-stat hit-rate grid
The research page SHALL render a grid of the player's recent games (rows) against their tracked stat types (columns), where each cell shows the player's actual value for that game and stat, visually marked as over, under, or push relative to today's current line for that stat type.

#### Scenario: Grid shows multiple stats at once without switching
- **WHEN** the research page loads for a player with more than one tracked prop today
- **THEN** the grid shows that player's recent games across all of their tracked stat types simultaneously, each cell marked over, under, or push against today's line for its column's stat

#### Scenario: Stat column has no live line today
- **WHEN** a stat type shown as a grid column has no `PlayerPropOdds` line for today's game
- **THEN** the cells in that column show the player's actual values without an over/under/push marker, since there is nothing to grade them against

### Requirement: Compact header persists key context while scrolling
The research page header SHALL remain visible while the user scrolls the page, continuing to show at minimum the player's name, today's opponent, and today's line for the active stat.

#### Scenario: User scrolls past the header
- **WHEN** a user scrolls down the research page past the initial header area
- **THEN** the player's name, opponent, and active stat's line remain visible without scrolling back to the top
