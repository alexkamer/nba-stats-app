# Spec Delta

## Purpose

Generates and persists a single agent-written sentence recapping each calendar date's slate of games, so the briefing page can show a human-readable summary line without calling a generation model on every view of the same date.

## ADDED Requirements

### Requirement: Generated at most once per calendar date
The system SHALL generate the one-line summary for a calendar date at most once, the first time it is needed, rather than regenerating it on every view of that date's briefing.

#### Scenario: First view with no stored summary
- **WHEN** a date's briefing is viewed and no summary is yet stored for that date
- **THEN** the system generates a summary and persists it for that date

#### Scenario: Later view of the same date
- **WHEN** a date's briefing is viewed and a summary is already stored for that date
- **THEN** the system reuses the stored summary without issuing another generation call

### Requirement: Generation input is limited to computed digest facts
The system SHALL pass only already-computed digest facts for the date (such as game count, final scores, and recorded top performers) as input to the generation call, not raw box-score or play-by-play data.

#### Scenario: Generating a date's summary
- **WHEN** the system generates a summary for a calendar date
- **THEN** the data given to the generation call is limited to that date's already-computed digest facts

### Requirement: No summary before the date's games are complete
The system SHALL NOT generate a summary for a calendar date that has no final games yet.

#### Scenario: Date with no final games
- **WHEN** a calendar date has no games that have reached final status
- **THEN** the system does not generate or store a summary for that date

### Requirement: Stored summary is immutable once generated
Once a summary is stored for a calendar date, the system SHALL NOT overwrite or regenerate it on a later view of that same date.

#### Scenario: Viewing a date with an existing summary
- **WHEN** a date already has a stored summary and its briefing is viewed again
- **THEN** the stored text is left unchanged

### Requirement: Omitted on generation failure
If a generation call fails or returns no usable text, the briefing page SHALL omit the summary line for that date rather than show an error or placeholder text.

#### Scenario: Generation call fails
- **WHEN** a summary generation attempt for a date fails or returns no usable text
- **THEN** the briefing for that date renders without a summary line, and the rest of the page is unaffected
