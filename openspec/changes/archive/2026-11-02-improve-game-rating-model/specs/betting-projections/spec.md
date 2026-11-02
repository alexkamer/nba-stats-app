# Spec Delta

## MODIFIED Requirements

### Requirement: Game projection
The system SHALL compute a projected scoring margin and/or win likelihood for each upcoming game using opponent-strength-adjusted team ratings derived from the two teams' existing season and recent-game stats, adjusted for any rostered player frozen as unavailable for that game.

#### Scenario: Upcoming game has sufficient stat history
- **WHEN** a game is scheduled and both teams have season stats on record
- **THEN** the system computes a projected margin and/or winner for the game

#### Scenario: A team's top scorer is unavailable
- **WHEN** a team's highest-scoring player over his recent games is frozen as unavailable (OUT) for a scheduled game
- **THEN** the system's offense input for that team reflects his absence rather than treating him as available

#### Scenario: A team's rating reflects opponent strength, not just raw scoring
- **WHEN** two teams have similar raw points-per-game but have faced opponents of very different strength
- **THEN** the system's projected margin for a game involving either team differs from what a raw points-per-game comparison alone would produce

### Requirement: Insufficient data handling
The system SHALL decline to produce a projection, rather than fabricate one, when there is not enough stat history for a team or player; when there is enough history for a team's own projection but not enough league-wide schedule data for the opponent-adjusted rating solve to be meaningful, the system SHALL fall back to an unadjusted recency/season blend for that team rather than omitting a projection for the whole league.

#### Scenario: New player or team lacks history
- **WHEN** a player or team has no qualifying recent stat history
- **THEN** the system omits a projection for that player or team rather than returning a fabricated value

#### Scenario: Early season, too little league-wide schedule data to rate opponents
- **WHEN** the league overall has too few completed games for the opponent-adjusted rating solve to be meaningful, but a team itself has qualifying recent/season stats
- **THEN** the system still produces a projection for that team, using an unadjusted recency/season blend instead of omitting it
