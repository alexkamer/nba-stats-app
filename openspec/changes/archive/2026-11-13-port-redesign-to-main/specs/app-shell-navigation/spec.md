# Spec Delta

## MODIFIED Requirements

### Requirement: Desktop viewports show a persistent sidebar
On a desktop-width viewport, the system SHALL render section navigation (the app's top-level sections) as a persistent left rail, visible without user action, together with the wordmark, a search field and a "Tonight" list of today's games with scores or tip-off times, rather than a top-only link row.

#### Scenario: Viewing any page on desktop
- **WHEN** a user loads any page at a desktop viewport width
- **THEN** a left rail listing the app's top-level sections and today's games is visible alongside the page content without requiring a click to reveal it

#### Scenario: A game goes live while the page is open
- **WHEN** a game on today's slate starts or its score changes
- **THEN** the Tonight list reflects it within about 30 seconds without a reload

## ADDED Requirements

### Requirement: Navigation exposes the Briefing and Cover Story sections
The section navigation SHALL include Briefing, Scoreboard, Standings, Teams, News, Betting and Cover Story, and SHALL mark the current section.

#### Scenario: Viewing the Betting page
- **WHEN** a user is on any Betting page
- **THEN** the Betting link is shown as current

### Requirement: Breadcrumb labels name the entity
A breadcrumb for a detail page SHALL show the entity's name (player, team, game matchup, article title), never its raw identifier.

#### Scenario: Viewing a player page
- **WHEN** a user views a player's page
- **THEN** the last breadcrumb reads the player's name

#### Scenario: Viewing a news article
- **WHEN** a user views a news article
- **THEN** the last breadcrumb reads the article's headline, not its id
