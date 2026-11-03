# Spec Delta

## Purpose

Maintains each team's season-to-date against-the-spread and over/under betting results, derived from recorded odds and final game scores, so historical betting performance can be reported without being recomputed live from raw game data on every read.

## ADDED Requirements

### Requirement: Compute ATS result on game completion
The system SHALL determine, for each completed game with a recorded pre-game spread, whether the home team and the away team covered, did not cover, or pushed against that spread.

#### Scenario: Game finishes with a recorded spread
- **WHEN** a game's status changes to final and an `Odds` row with a non-null spread exists for it
- **THEN** the system records a cover result (covered, not covered, or push) for the home team and the away team for that game

#### Scenario: Game finishes with no recorded spread
- **WHEN** a game's status changes to final and no `Odds` row, or one with a null spread, exists for it
- **THEN** the system excludes that game from both teams' ATS records

### Requirement: Compute over/under result on game completion
The system SHALL determine, for each completed game with a recorded pre-game total, whether the combined final score went over, under, or pushed against that total.

#### Scenario: Game finishes with a recorded total
- **WHEN** a game's status changes to final and an `Odds` row with a non-null over/under exists for it
- **THEN** the system records an over/under result (over, under, or push) for that game, attributed to both participating teams' season records

#### Scenario: Game finishes with no recorded total
- **WHEN** a game's status changes to final and no `Odds` row, or one with a null over/under, exists for it
- **THEN** the system excludes that game from both teams' over/under records

### Requirement: Season ATS and over/under aggregates per team
The system SHALL maintain, per team per season, aggregate ATS win/loss/push counts and over/under win/loss/push counts, each split into overall, home-game-only, and away-game-only totals.

#### Scenario: Querying a team's season record
- **WHEN** a team has one or more graded cover or over/under results for the current season
- **THEN** the system can report that team's overall, home, and away ATS and over/under win/loss/push counts for the season

### Requirement: Current streak per team
The system SHALL maintain, per team, the current consecutive-game ATS streak and the current consecutive-game over/under streak, based on the team's most recently graded games in chronological order.

#### Scenario: Team has covered its last several games
- **WHEN** a team's most recent graded games are all covers
- **THEN** the system reports a current ATS covering streak equal to the number of consecutive covers

#### Scenario: Streak is broken
- **WHEN** a team's most recently graded game is a non-cover (or non-push result opposite the prior streak direction)
- **THEN** the system resets that team's current ATS streak to start from that game

### Requirement: Favorite and underdog splits
The system SHALL maintain, per team per season, straight-up win/loss counts and ATS win/loss/push counts split by whether that team was the recorded market favorite or underdog for the game, using the odds provider's own favorite designation rather than inferring it from the spread.

#### Scenario: Game has a recorded favorite
- **WHEN** a completed game's `Odds` row identifies a favorite team and has a recorded spread
- **THEN** the system credits the favorite team's favorite-role straight-up and ATS counts, and the other team's underdog-role straight-up and ATS counts, for that game

#### Scenario: Game has no recorded favorite
- **WHEN** a completed game's `Odds` row has no recorded favorite
- **THEN** the system excludes that game from both teams' favorite/underdog splits
