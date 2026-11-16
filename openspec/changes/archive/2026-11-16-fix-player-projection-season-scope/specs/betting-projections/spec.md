# Spec Delta

## MODIFIED Requirements

### Requirement: Player prop projection
The system SHALL compute a projected value for a player's tracked stat (points, rebounds, assists, etc.) for an upcoming game, using that player's recent game logs and current-season averages, when that player is not frozen as unavailable for the game.

#### Scenario: Player has recent game-log data
- **WHEN** a player is on a scheduled game's roster, has recent game logs on record, and is not frozen as unavailable for that game
- **THEN** the system computes a projected value for each tracked stat for that player

#### Scenario: Player is unavailable for the game
- **WHEN** a player is frozen as unavailable (OUT) for a scheduled game
- **THEN** the system does not produce a prop projection for that player for that game

#### Scenario: Player's own recent-form window excludes games he missed
- **WHEN** computing a player's recent per-game values for a tracked stat
- **THEN** games in which that player did not play are excluded from that window, rather than counted as a zero or low value

#### Scenario: Player has game logs from prior seasons on record
- **WHEN** a player has game logs on record from one or more prior seasons in addition to the current season
- **THEN** the player's season average is computed only from the current season's games, excluding any prior-season games from the average
