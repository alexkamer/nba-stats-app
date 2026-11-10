# Betting Insights Page Specification

## Purpose

Presents forward-looking betting insights — game picks, player prop leans, market and ESPN reference numbers, and historical accuracy — in a single page for users deciding what to bet on.

## Requirements

### Requirement: Upcoming games list
The page SHALL list upcoming/scheduled games with the system's game pick and the market line shown together.

#### Scenario: User visits the page with upcoming games available
- **WHEN** there are scheduled games with projections
- **THEN** the page lists each game with the system's projected pick alongside the market spread, total, and moneyline

### Requirement: ESPN predictor reference
The page SHALL show ESPN's predictor projection alongside the system's own pick for each game, where available, without presenting it as the system's recommendation.

#### Scenario: ESPN predictor available
- **WHEN** a snapshotted ESPN predictor exists for a listed game
- **THEN** the page displays it as a separate reference value next to the system's own pick

### Requirement: Player prop leans
The page SHALL present player prop picks (stat, line, projected value, over/under lean) for players in upcoming games where a projection exists.

#### Scenario: Player prop projections exist for a game
- **WHEN** a listed game has player prop projections
- **THEN** the page shows each player's prop pick with the line and the system's projected value

### Requirement: Initial/Current line toggle for Best Bets
The page SHALL let the user toggle the Best Bets strip between the "Initial" selection (frozen pick-time line, locked in once per day) and the "Current" selection (recomputed against the live market line on every load), per best-bets-selection, without affecting which day's games are being viewed.

#### Scenario: User toggles from Initial to Current
- **WHEN** a user viewing the Best Bets strip switches the toggle from "Initial" to "Current"
- **THEN** the page replaces the displayed picks, line, lean, and odds with the Current-view selection for the same day

### Requirement: Accuracy scoreboard
The page SHALL display the running accuracy record for the system's own picks and for ESPN's predictor.

#### Scenario: Accuracy history exists
- **WHEN** graded accuracy records exist for one or more prediction sources
- **THEN** the page displays each source's hit rate

### Requirement: Navigation entry
The page SHALL be reachable from the site's primary navigation.

#### Scenario: User browses the site
- **WHEN** a user views any page with the primary navigation
- **THEN** a link to the betting insights page is present

### Requirement: No-data fallback
The page SHALL communicate clearly when no upcoming games, picks, or props are available, rather than showing an empty or broken view.

#### Scenario: No upcoming games
- **WHEN** there are no scheduled games with available projections
- **THEN** the page displays an explicit empty state
