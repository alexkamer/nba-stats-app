# daily-briefing-page Specification

## Purpose

Presents a single, minimalist, single-column daily recap-and-preview page — yesterday's results alongside tonight's schedule — reachable for today and, in a reduced recap-only form, for any past date.

## Requirements

### Requirement: Default briefing shows today's date
`/briefing` SHALL render the briefing for the current local calendar date, using the same local-calendar-day convention already used elsewhere in the app (e.g. the Best Bets day key).

#### Scenario: Visiting the default route
- **WHEN** a user visits `/briefing`
- **THEN** the page renders the briefing for today's local calendar date

### Requirement: Briefing for an explicit past date
`/briefing/[date]` SHALL render that calendar date's briefing in recap-only form, showing only the sections that are inherently scoped to a date rather than to "right now."

#### Scenario: Visiting a past date directly
- **WHEN** a user visits `/briefing/2026-11-05` and that date is before today
- **THEN** the page renders that date's recap-only sections (yesterday's scores, top performers, that date's own game slate, and Best Bets with grading) and omits the sections that reflect current-moment state (headlines, injuries, standings)

### Requirement: No future-dated briefings
The system SHALL NOT render a briefing for a calendar date later than today.

#### Scenario: Visiting a future date
- **WHEN** a user visits `/briefing/[date]` for a date later than today
- **THEN** the system treats the route as not found rather than rendering an empty or placeholder briefing

### Requirement: Prev/next day navigation
Every briefing page SHALL offer controls to move to the adjacent calendar date's briefing, with the next-day control unavailable while viewing today's briefing.

#### Scenario: Paging from a past date
- **WHEN** a user viewing `/briefing/2026-11-05` activates the next-day control
- **THEN** the system navigates to the briefing for 2026-11-06

#### Scenario: No next-day control on today's briefing
- **WHEN** a user is viewing today's briefing
- **THEN** no control is offered to advance to a future date

### Requirement: Yesterday's scores section
Every briefing date SHALL include a section listing final scores for games played on the calendar date immediately before the viewed date, sourced from completed-game data.

#### Scenario: Prior day had completed games
- **WHEN** the calendar date before the viewed date has one or more final games
- **THEN** the section lists each game's final score

#### Scenario: Prior day had no games
- **WHEN** the calendar date before the viewed date has no games
- **THEN** the section displays an explicit no-games message instead of an empty list

### Requirement: Top performers section
Every briefing date SHALL include a section showing the prior calendar date's recorded points+rebounds+assists leader (with any triple-double flag) and a separate plain top-5-by-points list across that date's completed games.

#### Scenario: Prior day has a recorded daily leader
- **WHEN** the calendar date before the viewed date has a recorded daily points+rebounds+assists leader
- **THEN** the section shows that leader (or tied leaders) and whether a triple-double was recorded that date

#### Scenario: Prior day has completed games
- **WHEN** the calendar date before the viewed date has one or more completed games with recorded box scores
- **THEN** the section additionally lists the top 5 players by points across those games

#### Scenario: Prior day had no games
- **WHEN** the calendar date before the viewed date has no games
- **THEN** the top performers section displays an explicit no-data message

### Requirement: Headlines section shown only on today's briefing
The headlines section SHALL render only when viewing today's briefing and SHALL be omitted from any past-date briefing.

#### Scenario: Viewing today's briefing
- **WHEN** a user views `/briefing`
- **THEN** a headlines section listing current top news is shown

#### Scenario: Viewing a past date's briefing
- **WHEN** a user views `/briefing/[date]` for a date before today
- **THEN** no headlines section is rendered

### Requirement: Injury report section shown only on today's briefing
The injury report section SHALL render only when viewing today's briefing, listing availability snapshots for players on teams with a game scheduled today, and SHALL be omitted from any past-date briefing.

#### Scenario: Teams playing tonight have availability snapshots
- **WHEN** a user views today's briefing and one or more teams playing today have recorded player availability snapshots
- **THEN** the injury report section lists those players' statuses

#### Scenario: Viewing a past date's briefing
- **WHEN** a user views `/briefing/[date]` for a date before today
- **THEN** no injury report section is rendered

### Requirement: Standings snapshot shown only on today's briefing
A static, non-historical standings snapshot (no day-over-day movement) SHALL render only when viewing today's briefing, and SHALL be omitted from any past-date briefing.

#### Scenario: Viewing today's briefing
- **WHEN** a user views `/briefing`
- **THEN** an abbreviated current standings snapshot is shown, without rank or games-behind deltas

#### Scenario: Viewing a past date's briefing
- **WHEN** a user views `/briefing/[date]` for a date before today
- **THEN** no standings section is rendered

### Requirement: Tonight's schedule section on today's briefing
Today's briefing SHALL include a section listing today's scheduled games, each alongside the system's game pick and the market line where a projection exists.

#### Scenario: Games scheduled today with a projection
- **WHEN** a user views `/briefing` and one or more games are scheduled today with a recorded game projection
- **THEN** the section lists each game with the system's pick and the market line

#### Scenario: No games scheduled today
- **WHEN** a user views `/briefing` and no games are scheduled today
- **THEN** the section displays an explicit no-games message

### Requirement: That date's own slate on a past-date briefing
A past-date briefing SHALL include a section recapping the viewed date's own games (now final) in place of the forward-looking schedule shown on today's briefing.

#### Scenario: Viewing a past date with games that day
- **WHEN** a user views `/briefing/[date]` for a past date that had one or more games
- **THEN** the section lists that date's games with their final results

#### Scenario: Viewing a past date with no games that day
- **WHEN** a user views `/briefing/[date]` for a past date with no games
- **THEN** the section displays an explicit no-games message

### Requirement: Best Bets section shows both the prior night's and the viewed date's picks
Every briefing date SHALL embed two Best Bets (Initial view) pick lists side by side: the calendar date immediately before the viewed date's picks (graded, with each pick's hit/miss shown) and the viewed date's own picks, each re-derived using the same selection and grading logic as `best-bets-selection` and `prediction-accuracy-tracking`, falling back to a live re-derivation from already-graded data when no selection was ever locked in live for that date.

#### Scenario: Best Bets exist for the viewed date
- **WHEN** a day's Initial-view Best Bets selection exists for the viewed date
- **THEN** the section lists those picks

#### Scenario: Prior date has a Best Bets selection
- **WHEN** the calendar date before the viewed date has a Best Bets selection, graded or not
- **THEN** the section also lists that prior date's picks, each showing its graded hit/miss where decided

#### Scenario: No Best Bets selection exists for the viewed date
- **WHEN** no Best Bets selection exists for the viewed date
- **THEN** that half of the section displays an explicit no-data message instead of an empty strip

#### Scenario: No Best Bets selection exists for the prior date
- **WHEN** no Best Bets selection exists for the calendar date before the viewed date
- **THEN** that half of the section displays an explicit no-data message instead of an empty strip

### Requirement: Single-column layout
The briefing page SHALL render all of its sections stacked in a single vertical column at any viewport width, rather than a multi-column dashboard grid.

#### Scenario: Viewing on a desktop-width viewport
- **WHEN** a user views any briefing date at a desktop viewport width
- **THEN** sections appear stacked in one column rather than arranged side by side

### Requirement: Navigation entry
The briefing page SHALL be reachable from the site's primary navigation, per `app-shell-navigation`.

#### Scenario: Browsing the site
- **WHEN** a user views any page with the primary navigation
- **THEN** a link to the briefing page is present
