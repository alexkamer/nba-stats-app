# briefing-summary-generation Specification

## Purpose

Generates and persists a short, energetic agent-written recap or preview (a few sentences) of each calendar date's slate of games, so the briefing page can show an engaging, human-readable summary without calling a generation model on every view of the same date.

## Requirements

### Requirement: Recap generated at most once per calendar date, once its games are final
Once a calendar date's own games are final, the system SHALL generate a recap summary for that date at most once, the first time it is needed, rather than regenerating it on every later view of that date's briefing.

#### Scenario: First view after the date's games are final with no stored recap
- **WHEN** a date's games are final and its briefing is viewed with no recap yet stored for that date
- **THEN** the system generates a recap and persists it for that date

#### Scenario: Later view of a date with a stored recap
- **WHEN** a date's briefing is viewed and a recap is already stored for that date
- **THEN** the system reuses the stored recap without issuing another generation call

### Requirement: Preview generated before a date's games are final
Before a calendar date's own games are final, if that date has a scheduled slate, the system SHALL generate a forward-looking preview summarizing the slate to come, distinct from a recap, and reuse it for later views of that same date for as long as its games remain not final.

#### Scenario: Viewing a date with a scheduled, not-yet-final slate and no stored summary
- **WHEN** a date has one or more scheduled games, none of which are final yet, and no summary is yet stored for that date
- **THEN** the system generates a preview of the scheduled slate and persists it for that date

#### Scenario: Later view before the date's games are final
- **WHEN** a date's briefing is viewed again while its games are still not final and a preview is already stored for that date
- **THEN** the system reuses the stored preview without issuing another generation call

#### Scenario: No scheduled games to preview
- **WHEN** a date has no scheduled games and no games are final yet
- **THEN** the system does not generate or store a summary for that date

### Requirement: A preview is upgraded to a recap exactly once, when its date's games go final
The first time a date's own games are found to be final after a preview was stored for that date, the system SHALL replace the stored preview with a generated recap, after which the stored summary SHALL NOT be regenerated or overwritten again.

#### Scenario: A previewed date's games go final
- **WHEN** a date has a stored preview and that date's games are now final
- **THEN** the system generates a recap for that date and overwrites the stored preview with it

#### Scenario: Viewing a date whose preview has already been upgraded
- **WHEN** a date's stored summary has already been upgraded from a preview to a recap
- **THEN** a later view of that date reuses the stored recap without generating anything further

### Requirement: Generation input is limited to computed digest facts
The system SHALL pass only already-computed digest facts for the date as input to a generation call — for a recap, facts such as game count, final scores, and recorded top performers; for a preview, facts such as game count and scheduled matchups — never raw box-score or play-by-play data.

#### Scenario: Generating a date's recap
- **WHEN** the system generates a recap for a calendar date
- **THEN** the data given to the generation call is limited to that date's already-computed digest facts

#### Scenario: Generating a date's preview
- **WHEN** the system generates a preview for a calendar date
- **THEN** the data given to the generation call is limited to that date's already-computed schedule facts

### Requirement: Omitted on generation failure
If a generation call fails or returns no usable text, the briefing page SHALL omit the summary line for that date rather than show an error or placeholder text.

#### Scenario: Generation call fails
- **WHEN** a summary generation attempt for a date fails or returns no usable text
- **THEN** the briefing for that date renders without a summary line, and the rest of the page is unaffected
