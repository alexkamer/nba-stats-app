# player-prop-research-page Specification

## Purpose

Lets a bettor drill into the game-by-game history behind one of today's player props — chart, hit rates, and splits — before deciding whether to act on it.

## Requirements

### Requirement: Research page reachable from a betting page prop
Each player prop shown on the betting insights page SHALL link to a research view for that specific player and stat.

#### Scenario: Opening research from a prop row
- **WHEN** a user activates the research link on a player prop row for a given player and stat
- **THEN** the system navigates to the research page pre-selected to that player and stat

### Requirement: Research page scoped to today's live props
The research page SHALL only be addressable for a player who has at least one `PlayerPropOdds` line for a scheduled game today; it is not a general player-stats browser.

#### Scenario: Player has no live prop today
- **WHEN** the research page is requested for a player with no `PlayerPropOdds` row for today's slate
- **THEN** the system shows a message that no research is available for that player today, instead of rendering stat history

### Requirement: Game-by-game history chart against today's line
For the selected player and stat, the system SHALL render a chart of the player's historical per-game actual values for that stat, each marked as over, under, or push relative to today's current `PlayerPropOdds` line for that stat.

#### Scenario: Historical games rendered against today's line
- **WHEN** the research page loads for a player and stat with at least one historical game recorded
- **THEN** each historical game appears in the chart marked over, under, or push against today's current line for that stat

### Requirement: Model projection shown alongside the market line
The research page SHALL display this app's own `PlayerPropProjection` value for the selected player/stat (when one exists) alongside today's market line, distinguishing the two.

#### Scenario: Projection available
- **WHEN** a `PlayerPropProjection` exists for the selected player, game, and stat
- **THEN** the page shows our projected value next to today's market line, visibly distinguished from it

#### Scenario: Projection not yet available
- **WHEN** no `PlayerPropProjection` exists yet for the selected player, game, and stat
- **THEN** the page shows the market line without a projected-value comparison, and does not fabricate one

### Requirement: Hit-rate summaries over recent windows
The research page SHALL show, for the selected player and stat, the rate at which the player's actual value cleared today's current line over their last 5 games, last 10 games, last 20 games, and the current season.

#### Scenario: Fewer games available than a window
- **WHEN** a player has fewer recorded games than a given window (e.g., 3 games played this season when computing last 10)
- **THEN** the system computes that window's hit rate over the games actually available and indicates the smaller sample size, rather than erroring or fabricating missing games

### Requirement: Home, away, and opponent filters
The research page SHALL let a user filter the displayed game history to all games, home games only, away games only, or games played against today's specific opponent.

#### Scenario: Filtering to games against today's opponent
- **WHEN** a user selects the "vs [today's opponent]" filter
- **THEN** the chart and hit-rate summaries recompute using only the selected player's historical games against that opponent

#### Scenario: No games exist for a filter
- **WHEN** a user selects a filter (e.g., vs today's opponent) for which the player has no historical games
- **THEN** the system shows an explicit empty state for that filter instead of an empty or misleading chart

### Requirement: Switching stats within the same player
When a player has more than one tracked prop for today's game, the research page SHALL let a user switch between those stats without leaving the page.

#### Scenario: Player has multiple tracked props today
- **WHEN** a player has live `PlayerPropOdds` lines for more than one stat type today
- **THEN** the research page offers a control to switch the displayed chart, line, and hit rates to any of those other stats in place

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
