# King Of The Court Prediction Specification

## Purpose

Predicts, before any of a calendar date's games start, a ranked leaderboard of the players most likely to record that date's single highest combined points+rebounds+assists total, so the forward-looking "who will lead today" bet has a system pick the same way game and player-prop bets do.

## Requirements

### Requirement: Leaderboard covers every available rostered player, not just players with a market prop
For each calendar date with one or more scheduled games, the system SHALL compute a projected combined points+rebounds+assists value for every player rostered to a team playing that date who is not frozen as unavailable (OUT) for their game, regardless of whether a market points+rebounds+assists prop line exists for that player.

#### Scenario: A player has no posted market prop for the day
- **WHEN** a rostered player on a team playing today has no points+rebounds+assists (or any other) market prop line posted for that game
- **THEN** the system still computes and includes a projected combined points+rebounds+assists value for that player in that date's leaderboard, provided they are not frozen OUT

#### Scenario: A rostered player is frozen OUT
- **WHEN** a rostered player on a team playing today is frozen as unavailable (OUT) for that game
- **THEN** the system omits that player from the date's leaderboard

### Requirement: Leaderboard ranks candidates by projected combined stat
The system SHALL rank each calendar date's candidate players by descending projected combined points+rebounds+assists value and expose this as that date's King of the Court leaderboard.

#### Scenario: Multiple candidates are projected for a date
- **WHEN** a calendar date has two or more candidate players with a projected combined points+rebounds+assists value
- **THEN** the system orders them highest-projected-value first in that date's leaderboard

### Requirement: Same projection methodology as player-prop projections
The system SHALL compute each candidate's projected combined points+rebounds+assists value using the same recency/season-average blend, minutes-trend adjustment, opponent factor, and teammate-unavailability role adjustment already used for player-prop projections, so the two can never disagree about the same player's projected value for the same stat.

#### Scenario: A player also has a market points+rebounds+assists prop that day
- **WHEN** a candidate player also has a market points+rebounds+assists prop projection recorded for the same game
- **THEN** that player's King of the Court leaderboard value equals their player-prop projection's value for that stat

### Requirement: Frozen once per calendar date, never recomputed
The system SHALL compute and persist each calendar date's leaderboard once and SHALL NOT recompute or overwrite it afterward, even if availability, rosters, or schedules change later that day.

#### Scenario: A candidate's availability changes after the leaderboard is frozen
- **WHEN** a player's availability status changes after that date's leaderboard has already been computed and persisted
- **THEN** the leaderboard already recorded for that date is left unchanged

#### Scenario: Re-running the computation for an already-frozen date
- **WHEN** the leaderboard computation runs again for a calendar date that already has a persisted leaderboard
- **THEN** the system leaves the existing persisted leaderboard unchanged rather than creating a duplicate or overwriting it

### Requirement: Insufficient data handling
The system SHALL omit a player from a date's leaderboard rather than fabricate a projected value when that player has no qualifying season or recent game history for points, rebounds, and assists.

#### Scenario: A player has no qualifying stat history
- **WHEN** a rostered, available player on a team playing today has no season average and no recent-game history for points, rebounds, or assists
- **THEN** the system omits that player from the date's leaderboard rather than including a fabricated value

### Requirement: No leaderboard for a date with no games
The system SHALL NOT compute or persist a King of the Court leaderboard for a calendar date on which no games are scheduled.

#### Scenario: Date with no scheduled games
- **WHEN** a calendar date has no scheduled games
- **THEN** the system records no King of the Court leaderboard for that date
