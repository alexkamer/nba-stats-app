# Spec Delta

## Purpose

Identifies players with a live Over player-prop pick who are currently clearing a notable fixed stat floor consistently, so an Over lean can be backed by recent-form evidence rather than the projection alone.

## ADDED Requirements

### Requirement: Fixed stat floors for streak evaluation
The system SHALL evaluate streaks only for the `POINTS`, `REBOUNDS`, and `ASSISTS` `PropStatType` values, against a fixed floor per stat (10 for `POINTS`, 6 for `REBOUNDS`, 2 for `ASSISTS`), independent of the player's actual prop line for that game.

#### Scenario: Stat type has a defined floor
- **WHEN** a player has an `OVER` prop for `POINTS`, `REBOUNDS`, or `ASSISTS`
- **THEN** the system evaluates that player's streak against the fixed floor for that stat

#### Scenario: Stat type has no defined floor
- **WHEN** a player's `OVER` prop is for a stat type other than `POINTS`, `REBOUNDS`, or `ASSISTS`
- **THEN** the system excludes that prop from streak evaluation

### Requirement: Eligible player pool scoped to Over picks
The system SHALL only evaluate a player/stat streak when that player has a current `PlayerPropOdds` row with `side = OVER` for one of the eligible stat types, on the relevant date (see Relevant date selection). Under props are never evaluated.

#### Scenario: Player has an Over prop
- **WHEN** a player has an `OVER` `PlayerPropOdds` row for an eligible stat type on the relevant date
- **THEN** the system evaluates that player/stat for a streak

#### Scenario: Player only has an Under prop
- **WHEN** a player's only posted prop for an eligible stat type on the relevant date has `side = UNDER`
- **THEN** the system does not evaluate that player/stat for a streak

### Requirement: Consecutive-game streak
The system SHALL compute, for each eligible player/stat pair, the number of most-recent consecutive completed games (via `PlayerGameStat`, ordered by game date descending) in which the player's recorded value for that stat met or exceeded the fixed floor.

#### Scenario: Player has cleared the floor in recent games
- **WHEN** a player's most recent games each have a stat value at or above the fixed floor
- **THEN** the system reports a streak length equal to the number of consecutive most-recent games meeting the floor

#### Scenario: Most recent game missed the floor
- **WHEN** a player's most recent completed game falls below the fixed floor
- **THEN** the system reports a streak length of zero for that player/stat, regardless of earlier games

### Requirement: Last-10-game hit rate
The system SHALL compute, for each eligible player/stat pair, the fraction of the player's last 10 completed games (or all completed games if fewer than 10 are available) in which the stat value met or exceeded the fixed floor.

#### Scenario: Fewer than 10 games played
- **WHEN** a player has fewer than 10 completed games on record
- **THEN** the system computes the hit rate over however many completed games exist

### Requirement: Notable streak qualification
The system SHALL flag a player/stat pair as a notable streak when its consecutive-game streak is 3 or more, or its last-10-game hit rate is 90% or higher.

#### Scenario: Streak length qualifies
- **WHEN** a player/stat pair's consecutive streak is 3 or greater
- **THEN** the system flags it as notable

#### Scenario: Hit rate qualifies without an active streak
- **WHEN** a player/stat pair's last-10-game hit rate is 90% or higher, even if its current consecutive streak is below 3
- **THEN** the system flags it as notable

#### Scenario: Neither condition is met
- **WHEN** a player/stat pair's consecutive streak is below 3 and its last-10-game hit rate is below 90%
- **THEN** the system does not flag it as notable

### Requirement: Relevant date selection
The system SHALL evaluate eligible player props for today's date if any `OVER` prop for an eligible stat type exists for a game scheduled today; otherwise it SHALL use the nearest upcoming date (after today) that has at least one such prop.

#### Scenario: Today has eligible props
- **WHEN** one or more `OVER` props for an eligible stat type exist for a game scheduled today
- **THEN** the system evaluates streaks using today's eligible props

#### Scenario: Today has no eligible props but a future date does
- **WHEN** no `OVER` prop for an eligible stat type exists for today, but one exists for a later scheduled date
- **THEN** the system evaluates streaks using the nearest such future date's eligible props

#### Scenario: No eligible props exist on any upcoming date
- **WHEN** no `OVER` prop for an eligible stat type exists for today or any later scheduled date
- **THEN** the system reports no eligible player/stat pairs
