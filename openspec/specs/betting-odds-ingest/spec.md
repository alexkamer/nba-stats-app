# Betting Odds Ingest Specification

## Purpose

Captures forward-looking market odds (game lines with line movement, player prop lines) and a snapshot of ESPN's pre-game predictor for scheduled games, so other capabilities have fresh market and reference data to compare against before each game tips off.

## Requirements

### Requirement: Game market odds capture
The system SHALL fetch and persist the current market line (spread, total, moneyline) for each scheduled game, including the opening values, refreshed as the line changes before tip-off.

#### Scenario: Scheduled game gets a market line
- **WHEN** a game is scheduled and ESPN's odds data is available for it
- **THEN** the system persists the current spread, total, and moneyline along with the opening values for that game

### Requirement: Player prop odds capture
The system SHALL fetch and persist player prop lines (e.g., points, rebounds, assists, 3-pointers made, steals, blocks, and combo stats) for scheduled games where available, each tied to the specific player it applies to.

#### Scenario: Prop lines available for a scheduled game
- **WHEN** ESPN publishes player prop lines for a scheduled game
- **THEN** the system persists each prop's stat type, target line, and odds, associated with the player and the game

### Requirement: Predictor snapshot capture
The system SHALL snapshot ESPN's pre-game win-probability/projection for a scheduled game before it becomes unavailable, since ESPN does not retain that projection once a game reaches final status.

#### Scenario: Snapshot a predictor value before the game starts
- **WHEN** a game is scheduled and ESPN publishes a predictor projection for it
- **THEN** the system stores that projection associated with the game, before the game's status changes to in-progress or final

### Requirement: Sparse or missing data handling
The system SHALL tolerate games with no market odds, no prop odds, or no predictor data without failing ingestion for other games.

#### Scenario: A scheduled game has no odds published yet
- **WHEN** a scheduled game has no market odds available from ESPN
- **THEN** the system records no odds for that game and continues processing other games without error
