# Spec Delta

## Purpose

Captures and freezes each player's pre-game availability status for scheduled games, so projection and display logic have a trustworthy, non-hindsight answer to "is this player actually expected to play tonight."

## ADDED Requirements

### Requirement: Pre-game availability snapshot capture
The system SHALL fetch and persist a per-(game, player) availability status (e.g. OUT, DOUBTFUL, QUESTIONABLE, PROBABLE, AVAILABLE) for scheduled games, sourced from the team's current injury report.

#### Scenario: Scheduled game has injury report entries
- **WHEN** a game is scheduled and either team has players listed on its injury report
- **THEN** the system persists each listed player's status, associated with that game

### Requirement: No report entry defaults to available
The system SHALL treat a rostered player with no injury report entry as available, rather than leaving their status unknown.

#### Scenario: Player not on the injury report
- **WHEN** a scheduled game's roster includes a player with no corresponding injury report entry
- **THEN** the system records that player as available for that game

### Requirement: Snapshot refreshed up to tip-off
The system SHALL refresh a player's availability snapshot for a still-scheduled game whenever the underlying injury report status changes, up until the game is no longer scheduled.

#### Scenario: Status changes before tip-off
- **WHEN** a player's injury report status changes (e.g. Questionable to Out) while the game is still scheduled
- **THEN** the system updates that player's snapshot to the latest status

### Requirement: Frozen once the game is no longer scheduled
The system SHALL NOT change a player's availability snapshot for a game once that game is no longer in scheduled status.

#### Scenario: Game moves to live or final
- **WHEN** a game's status changes away from scheduled
- **THEN** existing availability snapshots for that game stop being refreshed, regardless of any later change to the player's injury report status
