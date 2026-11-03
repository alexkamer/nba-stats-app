# Spec Delta

## Purpose

Presents a single retrospective page — Cover Story — summarizing this season's betting outcomes and daily box-score highlights, as the historical counterpart to the forward-looking betting-insights page.

## ADDED Requirements

### Requirement: Team cover records section
The page SHALL display, for every team, the current season's ATS record, over/under record, and favorite/underdog splits (straight-up and ATS) as produced by the team-cover-record-tracking capability, ranked by ATS win percentage.

#### Scenario: Records available
- **WHEN** a user opens the page and cover records exist for the current season
- **THEN** the page lists each team's ATS record, over/under record, and favorite/underdog splits, including each team's current streak, ordered from highest to lowest ATS win percentage

### Requirement: King of the Court calendar
The page SHALL present a calendar for the current season where each day shows the player with that day's highest combined points+rebounds+assists total, as produced by the daily-stat-leader-tracking capability, and flags whether a triple-double occurred that day.

#### Scenario: Day has a recorded leader
- **WHEN** a user views a calendar day for which games were played and a daily leader has been computed
- **THEN** the page shows that day's leading player and their points+rebounds+assists total, and indicates if a triple-double occurred that day

#### Scenario: Day has no games
- **WHEN** a user views a calendar day with no games played
- **THEN** the page shows that day as having no leader, rather than an error or a misleading blank value

### Requirement: King of the Court day detail leaderboard
Clicking a calendar day SHALL open a detail view showing the full ranked list of players' combined points+rebounds+assists totals for that day's games, not just the day's leader(s).

#### Scenario: Day has games with box scores
- **WHEN** a user clicks a calendar day that has one or more completed games
- **THEN** the detail view lists every player who recorded a points+rebounds+assists total that day, ranked highest to lowest, with each player's triple-double status indicated

### Requirement: Season crown tally
The page SHALL show a season-to-date tally of how many days each player has been the King of the Court.

#### Scenario: Multiple players have led different days
- **WHEN** daily leaders have been computed for one or more days this season
- **THEN** the page lists players ranked by number of days they were the daily leader

### Requirement: Today's active player birthdays
The page SHALL list active players whose birth date's month and day match the current date.

#### Scenario: One or more active players share today's birthday
- **WHEN** the page is viewed on a date matching an active player's birth month and day
- **THEN** that player appears in a birthdays list on the page

#### Scenario: No active player has a birthday today
- **WHEN** no active player's birth month and day match the current date
- **THEN** the page communicates that there are no birthdays today, rather than showing an empty or broken section

### Requirement: Player prop hit-rate breakdown
The page SHALL display the system's player-prop pick hit rate broken down by stat type, season-to-date, sourced from the prediction-accuracy-tracking capability.

#### Scenario: Graded prop picks exist across multiple stat types
- **WHEN** graded player-prop projections exist for two or more `PropStatType` values
- **THEN** the page shows a separate hit rate for each stat type that has at least one graded pick

### Requirement: Today strip
The page SHALL present a summary strip above the page's sections surfacing the most recent noteworthy item from each section — the most recent King of the Court day's leader(s), any team with a notably long current ATS or over/under streak, today's birthdays, any triple-double from the most recent King of the Court day, and the top on-this-day historical performance — so the page reads as "what happened" rather than only static season-to-date tables.

#### Scenario: Recent highlights exist
- **WHEN** at least one of the underlying sections has data to summarize
- **THEN** the strip shows a highlight chip for each section that has one, omitting any section with nothing noteworthy

#### Scenario: Nothing noteworthy yet
- **WHEN** none of the underlying sections have data to summarize
- **THEN** the strip does not render, rather than showing an empty bar

### Requirement: On this day
The page SHALL show the top individual points+rebounds+assists performances recorded on today's calendar month/day across all past seasons, independent of the page's current-season scope for its other sections, and flag any that were triple-doubles.

#### Scenario: Historical performances exist for today's calendar date
- **WHEN** one or more players recorded a points+rebounds+assists total on today's month/day in a past season
- **THEN** the page lists those performances ranked highest to lowest, each showing the player, season/year, final score, and triple-double status

#### Scenario: No historical performances for this calendar date
- **WHEN** no past-season game falls on today's calendar month/day
- **THEN** the page shows an explicit no-data state for this section instead of an empty or broken view

### Requirement: Navigation entry
The page SHALL be reachable from the site's primary navigation.

#### Scenario: User browses site navigation
- **WHEN** a user opens the site's primary navigation
- **THEN** a link to the Cover Story page is present

### Requirement: No-data fallback
The page SHALL communicate clearly when no cover records, daily leaders, birthdays, prop hit-rate data, or on-this-day performances are available for a section, rather than showing an empty or broken view.

#### Scenario: A section has no data yet
- **WHEN** the current season has not yet produced data for one of the page's sections
- **THEN** that section shows an explicit "no data yet" state instead of being blank or erroring
