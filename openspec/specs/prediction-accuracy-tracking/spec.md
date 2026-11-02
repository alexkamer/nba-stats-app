# Prediction Accuracy Tracking Specification

## Purpose

Grades the system's own projections and ESPN's snapshotted predictor against actual game outcomes, and maintains a running accuracy record so each prediction source's trustworthiness can be judged on real results instead of assumed.

## Requirements

### Requirement: Grade game projections on completion
The system SHALL record whether its own game projection and the snapshotted ESPN predictor each correctly predicted the winning side and/or covered the spread, once a game reaches final status.

#### Scenario: Game finishes
- **WHEN** a game's status changes to final and a projection and/or predictor snapshot exists for it
- **THEN** the system records a graded outcome (correct or incorrect, and margin of error) for each source for that game

### Requirement: Grade player prop projections on completion
The system SHALL record whether its player-prop projections correctly leaned over or under relative to the actual final stat value, once a game is final.

#### Scenario: Game finishes with prop projections pending grading
- **WHEN** a game's status changes to final and prop projections exist for players in that game
- **THEN** the system records whether each prop projection's over/under lean matched the actual stat result

### Requirement: Running accuracy record
The system SHALL maintain and expose an aggregate accuracy record (e.g., hit rate) per prediction source (the system's own model, ESPN's predictor, and always picking the market favorite) over a selectable window such as season-to-date.

#### Scenario: Viewing accuracy over time
- **WHEN** graded results exist for one or more completed games
- **THEN** the system can report the hit rate for each prediction source across those games

#### Scenario: Comparing our model against the market favorite baseline
- **WHEN** graded results exist for one or more completed games with a market line recorded at pick time
- **THEN** the system can report the hit rate of always picking the market's favored side, alongside our model's and ESPN's predictor's hit rates, for the same games

### Requirement: Ungraded until resolved
The system SHALL NOT include a game's projections in the accuracy record until that game is final.

#### Scenario: Game still in progress
- **WHEN** a game has not yet reached final status
- **THEN** its projections are excluded from the accuracy record
