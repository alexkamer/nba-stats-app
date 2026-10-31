# Spec Delta

## Purpose

Defines where team logos and player headshots appear in list and card views across the app, and how those views degrade gracefully when an image is unavailable.

## ADDED Requirements

### Requirement: Scoreboard game cards show both teams' logos
Each game card on the home page's scoreboard SHALL display both teams' logos alongside their abbreviations and scores.

#### Scenario: Viewing today's scoreboard
- **WHEN** a user views the home page's scoreboard for a date with games
- **THEN** each game card shows the home and away team's logo next to that team's abbreviation and score

### Requirement: Team list cards show each team's logo and brand color
Each team card on the teams list page SHALL display that team's logo and a visual treatment derived from that team's brand color.

#### Scenario: Viewing the teams list
- **WHEN** a user views the teams list page
- **THEN** each team's card shows that team's logo and a background treatment derived from that team's brand color

### Requirement: Player list cards show each player's headshot
Each player card on the players list page SHALL display that player's headshot alongside their name and team.

#### Scenario: Viewing the players list
- **WHEN** a user views the players list page
- **THEN** each player's card shows that player's headshot next to their name, team, and position

### Requirement: Imagery degrades gracefully when unavailable
When a team logo or player headshot URL is missing, the system SHALL render a neutral placeholder of the same size instead of a broken image or layout shift.

#### Scenario: Free-agent player with no current team
- **WHEN** a user views a player list card for a player with no current team (and therefore no team-derived accent)
- **THEN** that card renders with a neutral-colored accent and, if the player has no headshot, a neutral placeholder badge in its place
