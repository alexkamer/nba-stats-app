# Spec Delta

## Purpose

Selects the day's featured "Best Bets" player-prop picks from the pool of bettable props so that each pick represents a distinct player, keeping the displayed picks and their accuracy record from being dominated by correlated stat lines on a single player.

## ADDED Requirements

### Requirement: Rank candidate props by edge ratio
The system SHALL consider every bettable player-prop projection for a given day as a candidate for Best Bets, ranked by descending edge ratio.

#### Scenario: Multiple bettable props exist for a day
- **WHEN** one or more player-prop projections for a day are marked bettable
- **THEN** the system ranks them by edge ratio, highest first, before applying any further selection rule

### Requirement: One pick per player
The system SHALL select at most one prop per player for a given day's Best Bets, keeping that player's highest-edge-ratio bettable prop and excluding their other bettable props from the pool.

#### Scenario: A player has multiple bettable props on the same day
- **WHEN** a player has more than one bettable player-prop projection for a day (e.g. points and points+rebounds)
- **THEN** only that player's single highest-edge-ratio prop is eligible for Best Bets, and their other bettable props for that day are excluded

#### Scenario: A player has exactly one bettable prop on the day
- **WHEN** a player has only one bettable player-prop projection for a day
- **THEN** that prop is eligible for Best Bets on its own merit

### Requirement: No backfill below the display target
The system SHALL NOT pad the Best Bets list with an additional pick from a player already selected, even when fewer than the target number of distinct players have a bettable prop that day.

#### Scenario: Fewer than the target number of distinct players qualify
- **WHEN** after deduplicating by player, fewer than the target number of picks remain for a day
- **THEN** the system displays only those remaining picks rather than filling remaining slots with a second pick from an already-selected player

### Requirement: Shared selection logic for display and grading
The system SHALL use the same ranked, deduplicated-by-player selection logic both when displaying the day's live Best Bets and when computing the historical Best Bets accuracy record, so the two never diverge.

#### Scenario: Computing the live Best Bets list
- **WHEN** the system displays the Best Bets list for a day with available projections
- **THEN** it applies the ranked, per-player-deduplicated selection logic to produce that day's picks

#### Scenario: Computing the historical Best Bets accuracy record
- **WHEN** the system computes the aggregate Best Bets hit rate across previously graded days
- **THEN** it re-derives each day's picks using the same ranked, per-player-deduplicated selection logic, rather than using a separately implemented selection rule
