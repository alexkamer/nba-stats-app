# Spec Delta

## ADDED Requirements

### Requirement: Grade King of the Court predictions on completion
The system SHALL record whether its King of the Court leaderboard's top-ranked candidate player(s) for a calendar date match that date's actual recorded points+rebounds+assists leader(s), once every game scheduled for that date has reached final status and that date's actual daily leader has been recorded.

#### Scenario: A date's games all finish and a leaderboard exists
- **WHEN** every game scheduled for a calendar date has reached final status, that date's actual daily points+rebounds+assists leader has been recorded, and a King of the Court leaderboard exists for that date
- **THEN** the system records whether the leaderboard's top-ranked candidate player(s) are among that date's actual recorded daily leader(s)

#### Scenario: A date's games have not all finished
- **WHEN** one or more games scheduled for a calendar date have not yet reached final status
- **THEN** the system does not grade that date's King of the Court leaderboard

### Requirement: King of the Court included in the running accuracy record
The system SHALL maintain and expose a running hit-rate accuracy record for King of the Court predictions, separate from the game-pick and player-prop accuracy records, over the same selectable window such as season-to-date.

#### Scenario: Viewing accuracy over time
- **WHEN** one or more calendar dates have a graded King of the Court outcome
- **THEN** the system can report the hit rate of King of the Court predictions across those dates, alongside the other prediction sources' hit rates
