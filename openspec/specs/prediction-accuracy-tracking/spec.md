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
The system SHALL maintain and expose an aggregate accuracy record (e.g., hit rate) per prediction source (the system's own model, ESPN's predictor, and always picking the market favorite) over a selectable window such as season-to-date. For player-prop picks, the system SHALL additionally expose the hit rate broken down by `PropStatType`, in addition to the single overall aggregate.

#### Scenario: Viewing accuracy over time
- **WHEN** graded results exist for one or more completed games
- **THEN** the system can report the hit rate for each prediction source across those games

#### Scenario: Comparing our model against the market favorite baseline
- **WHEN** graded results exist for one or more completed games with a market line recorded at pick time
- **THEN** the system can report the hit rate of always picking the market's favored side, alongside our model's and ESPN's predictor's hit rates, for the same games

#### Scenario: Viewing prop hit rate by stat type
- **WHEN** graded player-prop projections exist for one or more `PropStatType` values
- **THEN** the system can report a separate hit rate for each `PropStatType` that has at least one graded pick, in addition to the overall prop hit rate

### Requirement: Grade the Current Best Bets selection against its own captured line
The system SHALL maintain a separate running accuracy record for the Current-view Best Bets selection (see best-bets-selection), graded using the line-independent actual stat value rather than the frozen projection's own graded result — since a Current pick's line and lean can differ from the frozen pick's.

#### Scenario: A Current Best Bets pick's line differs from the frozen pick's line
- **WHEN** a prop recorded in a day's Current Best Bets selection has a line or lean that differs from its frozen `PlayerPropProjection`
- **THEN** the system grades that pick by comparing the player's actual stat value directly against the Current selection's own recorded line and lean, not by reusing the frozen projection's graded result

### Requirement: Ungraded until resolved
The system SHALL NOT include a game's projections in the accuracy record until that game is final.

#### Scenario: Game still in progress
- **WHEN** a game has not yet reached final status
- **THEN** its projections are excluded from the accuracy record
