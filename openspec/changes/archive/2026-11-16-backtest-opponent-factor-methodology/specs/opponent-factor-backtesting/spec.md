# Spec Delta

## Purpose

Lets a candidate team-level opponent-adjustment methodology be evaluated against historical actual game outcomes, so a proposed change to how opponent factors are computed can be validated with evidence before it ships to the live pipeline.

## ADDED Requirements

### Requirement: Walk-forward simulation with no look-ahead
The system SHALL compute a historical "allowed value" prediction for a team's game using only that team's games dated strictly before that game, for any requested past date and team.

#### Scenario: Predicting a game in the middle of a past season
- **WHEN** the backtest computes a predicted allowed value for a team's game played on a given historical date
- **THEN** only that team's games with a date strictly earlier than that date are used as input, regardless of what is otherwise on record

### Requirement: Compare predicted allowed value against the opponent's own actual result
The system SHALL compare each historical prediction to what the opposing team actually produced for that stat in that same game, without requiring a market betting line to exist.

#### Scenario: Grading a historical game
- **WHEN** the backtest predicts how much a team allows in a stat for a given historical game
- **THEN** it compares that prediction to the actual value the opposing team recorded in that game, using already-ingested `TeamGameStat` data as ground truth

### Requirement: Side-by-side methodology comparison using the existing opponent-factor function
The system SHALL run two or more named methodology variants — differing only in how far back the input game history is scoped — through the existing, unmodified opponent-factor computation, and report each variant's prediction error separately.

#### Scenario: Comparing season-scoped vs. unscoped allowed-value history
- **WHEN** the backtest is run with both the current unscoped (all-time) methodology and a season-scoped methodology as variants
- **THEN** both variants are computed via the same existing opponent-factor function, and the report includes each variant's aggregate error metrics computed over the identical set of historical games

### Requirement: Error metrics segmented by season progress
The system SHALL report prediction error both in aggregate and broken out separately by how many current-season games the team being predicted for has already played as of the game being predicted.

#### Scenario: Early-season vs. late-season games are both in the backtested set
- **WHEN** the backtested game set includes games early in a team's season (few current-season games played so far) and games later in the season
- **THEN** the report shows error metrics for each portion of the season separately, not only a single combined figure

### Requirement: No effect on the live projection pipeline or persisted data
The system SHALL NOT write to any table read by the live projection, grading, or Best Bets pipelines, and SHALL NOT alter any existing persisted row.

#### Scenario: Running a backtest while the live pipeline is also running
- **WHEN** a backtest is executed at any time, including while `ingest/generate-projections.ts` or `ingest/grade-predictions.ts` are also running
- **THEN** no row read by those pipelines is created, modified, or deleted as a result of the backtest
