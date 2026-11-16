# projection-methodology-backtesting Specification

## Purpose
Lets a candidate player-prop projection methodology be evaluated against historical actual stat results across past seasons, so a proposed change to the live projection pipeline can be validated with evidence before it ships.

## Requirements

### Requirement: Walk-forward simulation with no look-ahead
The system SHALL compute a historical projection for a player's game using only game logs dated strictly before that game, for any requested past date and player.

#### Scenario: Projecting a game in the middle of a past season
- **WHEN** the backtest computes a projection for a player's game played on a given historical date
- **THEN** only that player's games with a date strictly earlier than that date are used as input, regardless of what is otherwise on record

### Requirement: Compare projected value against the player's own actual result
The system SHALL compare each historical projection to the actual recorded value of that same stat for that player in that game, without requiring a market betting line to exist for that game.

#### Scenario: No market odds exist for the historical game
- **WHEN** a past game has no `PlayerPropOdds` record at all
- **THEN** the system still produces and grades a projection for that game, using the player's actual recorded stat value as ground truth

### Requirement: Side-by-side methodology comparison
The system SHALL run two or more named projection methodology variants over the same set of historical games and report each variant's prediction error separately, so their accuracy can be compared directly.

#### Scenario: Comparing season-scoped vs. unscoped season average
- **WHEN** the backtest is run with both the current unscoped (career-average) methodology and a season-scoped methodology as variants
- **THEN** the report includes each variant's aggregate error metrics computed over the identical set of historical games

### Requirement: Error metrics segmented by player tenure
The system SHALL report prediction error both in aggregate and broken out separately for players who have game logs from one or more seasons prior to the one being backtested, versus players who do not.

#### Scenario: A backtest run includes both veteran and rookie players
- **WHEN** the backtested game set includes players with prior-season history and players without any
- **THEN** the report shows error metrics for each group separately, not only a single combined figure

### Requirement: No effect on the live projection pipeline or persisted data
The system SHALL NOT write to any table read by the live projection, grading, or Best Bets pipelines, and SHALL NOT alter any existing `PlayerPropProjection`, `DailyBestBet`, or related persisted row.

#### Scenario: Running a backtest while the live pipeline is also running
- **WHEN** a backtest is executed at any time, including while `ingest/generate-projections.ts` or `ingest/grade-predictions.ts` are also running
- **THEN** no row read by those pipelines is created, modified, or deleted as a result of the backtest
