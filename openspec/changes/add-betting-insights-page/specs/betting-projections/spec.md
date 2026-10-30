# Spec Delta

## Purpose

Produces the app's own game-level and player-prop projections from existing team and player statistics, and compares them against market lines to surface a pick and the size of any edge.

## ADDED Requirements

### Requirement: Game projection
The system SHALL compute a projected scoring margin and/or win likelihood for each upcoming game using the two teams' existing season and recent-game stats.

#### Scenario: Upcoming game has sufficient stat history
- **WHEN** a game is scheduled and both teams have season stats on record
- **THEN** the system computes a projected margin and/or winner for the game

### Requirement: Game pick vs market
The system SHALL compare its game projection to the available market line (spread, total, moneyline) and surface which side or total it favors relative to the market.

#### Scenario: Projection disagrees with market
- **WHEN** the system's projected margin differs from the market spread by a nonzero amount
- **THEN** the system surfaces a pick (the side of the spread/total it favors) and the size of the disagreement

#### Scenario: No market line available
- **WHEN** no market odds exist for a game
- **THEN** the system still exposes its own projection, without a market comparison

### Requirement: Player prop projection
The system SHALL compute a projected value for a player's tracked stat (points, rebounds, assists, etc.) for an upcoming game, using that player's recent game logs and season averages.

#### Scenario: Player has recent game-log data
- **WHEN** a player is on a scheduled game's roster and has recent game logs on record
- **THEN** the system computes a projected value for each tracked stat for that player

### Requirement: Prop pick vs market line
The system SHALL compare its player-stat projection to the published prop line for that stat and surface an over or under lean.

#### Scenario: Projection crosses the prop line
- **WHEN** the system's projected value for a stat differs from the published prop line
- **THEN** the system surfaces an over or under lean for that prop, along with the projected value and the line

### Requirement: Insufficient data handling
The system SHALL decline to produce a projection, rather than fabricate one, when there is not enough stat history for a team or player.

#### Scenario: New player or team lacks history
- **WHEN** a player or team has no qualifying recent stat history
- **THEN** the system omits a projection for that player or team rather than returning a fabricated value
