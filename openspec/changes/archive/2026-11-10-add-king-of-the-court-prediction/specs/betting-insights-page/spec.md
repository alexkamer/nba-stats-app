# Spec Delta

## ADDED Requirements

### Requirement: King of the Court leaderboard section
The page SHALL display today's King of the Court leaderboard — the ranked candidate players and their projected combined points+rebounds+assists values — when a leaderboard has been computed for today.

#### Scenario: Leaderboard exists for today
- **WHEN** a King of the Court leaderboard has been computed for today
- **THEN** the page displays the ranked candidate players with their projected combined points+rebounds+assists values

#### Scenario: No leaderboard exists for today
- **WHEN** no King of the Court leaderboard has been computed for today
- **THEN** the page omits the section rather than showing an empty or broken leaderboard

### Requirement: King of the Court accuracy shown alongside other sources
The accuracy scoreboard SHALL include the running King of the Court hit rate alongside the system's game-pick and player-prop accuracy records, when a graded King of the Court record exists.

#### Scenario: Graded King of the Court history exists
- **WHEN** one or more calendar dates have a graded King of the Court outcome
- **THEN** the accuracy scoreboard displays the King of the Court hit rate alongside the other prediction sources' hit rates
