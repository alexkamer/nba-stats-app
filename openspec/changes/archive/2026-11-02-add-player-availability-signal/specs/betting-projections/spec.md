# Spec Delta

## MODIFIED Requirements

### Requirement: Game projection
The system SHALL compute a projected scoring margin and/or win likelihood for each upcoming game using the two teams' existing season and recent-game stats, adjusted for any rostered player frozen as unavailable for that game.

#### Scenario: Upcoming game has sufficient stat history
- **WHEN** a game is scheduled and both teams have season stats on record
- **THEN** the system computes a projected margin and/or winner for the game

#### Scenario: A team's top scorer is unavailable
- **WHEN** a team's highest-scoring player over his recent games is frozen as unavailable (OUT) for a scheduled game
- **THEN** the system's offense input for that team reflects his absence rather than treating him as available

### Requirement: Player prop projection
The system SHALL compute a projected value for a player's tracked stat (points, rebounds, assists, etc.) for an upcoming game, using that player's recent game logs and season averages, when that player is not frozen as unavailable for the game.

#### Scenario: Player has recent game-log data
- **WHEN** a player is on a scheduled game's roster, has recent game logs on record, and is not frozen as unavailable for that game
- **THEN** the system computes a projected value for each tracked stat for that player

#### Scenario: Player is unavailable for the game
- **WHEN** a player is frozen as unavailable (OUT) for a scheduled game
- **THEN** the system does not produce a prop projection for that player for that game

#### Scenario: Player's own recent-form window excludes games he missed
- **WHEN** computing a player's recent per-game values for a tracked stat
- **THEN** games in which that player did not play are excluded from that window, rather than counted as a zero or low value

## ADDED Requirements

### Requirement: Teammate role adjustment on missing player
The system SHALL adjust a player's prop projection to reflect an expected increase in role or minutes when a teammate who historically shared his playing time is frozen as unavailable for the same game, based on how that player's own production changed in this season's games the absent teammate already missed.

#### Scenario: A minutes-sharing teammate is unavailable
- **WHEN** a player's prop projection is computed for a game in which a teammate he has historically shared minutes with is frozen as unavailable
- **THEN** the projection reflects the empirically observed change in that player's production from this season's prior games the absent teammate missed, rather than using the unadjusted recent-form blend alone
