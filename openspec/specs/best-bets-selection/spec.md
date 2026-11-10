# Best Bets Selection Specification

## Purpose

Selects the day's featured "Best Bets" player-prop picks from the pool of bettable props so that each pick represents a distinct player, keeping the displayed picks and their accuracy record from being dominated by correlated stat lines on a single player. Offers both a frozen pick-time ("Initial") view and a live market-line ("Current") view of that same selection.

## Requirements

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

### Requirement: Current-line selection variant
In addition to the frozen pick-time selection above (the "Initial" view), the system SHALL offer a "Current" view: the same ranked, per-player-deduplicated top-N selection, but with edge ratio, lean, and line all recomputed against each prop's live current market line instead of the line frozen at projection time. The two views are independent and can select different props, or the same prop with a different lean, when the market has moved.

#### Scenario: The market has moved since a projection was frozen
- **WHEN** a prop's live market line differs from the line its projection was frozen against
- **THEN** the Current view ranks and leans that prop using the live line, independently of what the Initial view shows for the same prop

### Requirement: Current-line selection is recorded without duplicating a prop
The system SHALL persist each day's Current-view top-N selection so it can be graded later, recording at most one row per (day, player, stat type) no matter how many times that prop's live line changes before the game starts. A later recomputation for a prop already recorded that day SHALL overwrite that same row's line, lean, odds, and rank rather than create an additional row.

#### Scenario: A prop's live line moves during the day after it was already recorded
- **WHEN** a prop already recorded in a day's Current selection has its live line move (e.g. a 3-pointers-made prop's line drifting from 0.5 to 1.5) and the prop is recomputed
- **THEN** the system updates that same (day, player, stat type) row's line/lean/odds/rank in place, so the day's Current record still has exactly one row for that prop

### Requirement: Current-line recording stops once a game is final
The system SHALL NOT update a prop's recorded Current-selection row once that prop's game has reached final status, preserving whatever live line/lean/odds were last captured before the game ended rather than overwriting them with the now-frozen line.

#### Scenario: A game goes final after its props were recorded live
- **WHEN** a game reaches final status and one or more of its props already have a recorded Current-selection row from earlier that day
- **THEN** those rows are left unchanged by any later recomputation for that day
