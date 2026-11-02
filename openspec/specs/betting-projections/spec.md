# Betting Projections Specification

## Purpose

Produces the app's own game-level and player-prop projections from existing team and player statistics, and compares them against market lines to surface a pick and the size of any edge.

## Requirements

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

### Requirement: Game pick vs market
The system SHALL compare its game projection to the available market line (spread, total, moneyline) and surface which side or total it favors relative to the market.

#### Scenario: Projection disagrees with market
- **WHEN** the system's projected margin differs from the market spread by a nonzero amount
- **THEN** the system surfaces a pick (the side of the spread/total it favors) and the size of the disagreement

#### Scenario: No market line available
- **WHEN** no market odds exist for a game
- **THEN** the system still exposes its own projection, without a market comparison

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

### Requirement: Prop pick vs market line
The system SHALL compare its player-stat projection to the published prop line for that stat and surface an over or under lean.

#### Scenario: Projection crosses the prop line
- **WHEN** the system's projected value for a stat differs from the published prop line
- **THEN** the system surfaces an over or under lean for that prop, along with the projected value and the line

### Requirement: Insufficient data handling
The system SHALL decline to produce a projection, rather than fabricate one, when there is not enough stat history for a team or player; when there is enough history for a team's own projection but not enough league-wide schedule data for the opponent-adjusted rating solve to be meaningful, the system SHALL fall back to an unadjusted recency/season blend for that team rather than omitting a projection for the whole league.

#### Scenario: New player or team lacks history
- **WHEN** a player or team has no qualifying recent stat history
- **THEN** the system omits a projection for that player or team rather than returning a fabricated value

#### Scenario: Early season, too little league-wide schedule data to rate opponents
- **WHEN** the league overall has too few completed games for the opponent-adjusted rating solve to be meaningful, but a team itself has qualifying recent/season stats
- **THEN** the system still produces a projection for that team, using an unadjusted recency/season blend instead of omitting it

### Requirement: Teammate role adjustment on missing player
The system SHALL adjust a player's prop projection to reflect an expected increase in role or minutes when a teammate who historically shared his playing time is frozen as unavailable for the same game, based on how that player's own production changed in this season's games the absent teammate already missed.

#### Scenario: A minutes-sharing teammate is unavailable
- **WHEN** a player's prop projection is computed for a game in which a teammate he has historically shared minutes with is frozen as unavailable
- **THEN** the projection reflects the empirically observed change in that player's production from this season's prior games the absent teammate missed, rather than using the unadjusted recent-form blend alone
