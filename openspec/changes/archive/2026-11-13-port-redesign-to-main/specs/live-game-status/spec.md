# Spec Delta

## Purpose

Defines when a game counts as underway and how every surface labels a game as not started, live, or final, so a game paused at halftime is never shown as upcoming.

## ADDED Requirements

### Requirement: A game is underway from tip-off until it is final
The system SHALL treat a game as underway when its status is in progress, halftime, or end of a period, and SHALL NOT treat a paused game as not started.

#### Scenario: Game at halftime
- **WHEN** a game's status is halftime
- **THEN** every surface that lists it (home, scoreboard, team schedule, team header, Tonight list, game page) shows it as live, not as scheduled

#### Scenario: Game between periods
- **WHEN** a game's status is end of a period
- **THEN** it is shown as live with the period break named in its status text

### Requirement: Paused live games read as paused
A live game whose clock is not running SHALL show its break (for example "Halftime") in place of a running clock, and its live indicator SHALL not pulse.

#### Scenario: Clock stopped at halftime
- **WHEN** a user views a game at halftime
- **THEN** the status reads "Halftime" with a non-pulsing indicator

### Requirement: The game page presents three states
The game page SHALL present a not-started, a live, and a final state, each with its own header content and tab set: tip-off time and preview for not started; live score, win chance, latest plays and a periodic refresh for live; final score with the winner emphasized and the recap for final.

#### Scenario: Opening a game that has not started
- **WHEN** a user opens a game before tip-off
- **THEN** the header shows the tip-off time and betting context, and no score or box score tabs

#### Scenario: Opening a live game
- **WHEN** a user opens a game that is underway
- **THEN** the page refreshes automatically about every 15 seconds and shows when it last updated

#### Scenario: Opening a final game
- **WHEN** a user opens a completed game
- **THEN** the header shows the final score with the winning team emphasized

### Requirement: Live win-probability chart ends at the latest play
For a game that is not final, the win-probability chart SHALL end at the most recent play and SHALL NOT add a closing "End of Game" point.

#### Scenario: Chart during a live game
- **WHEN** a user views the game flow chart while the game is underway
- **THEN** the last plotted point is the latest play, not a 100% result
