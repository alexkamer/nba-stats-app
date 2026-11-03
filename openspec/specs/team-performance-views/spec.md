# team-performance-views Specification

## Purpose

Presents team performance against market expectation: a per-team season view on the team page and a league-wide leaderboard on the Teams index, so users can scan who is over- or underperforming and why.

## Requirements

### Requirement: Team Performance tab summary
The team page SHALL provide a Performance tab showing, for the selected season's regular-season games with a recorded spread, the team's average cover margin, its average over the last 10 graded games, and its average as a favorite, as an underdog, at home, and on the road.

#### Scenario: Team with graded games
- **WHEN** a user opens a team's Performance tab and the team has graded games this season
- **THEN** the tab shows the season average cover margin and each split, with a qualitative overall label (over, as expected, or under) for the season average, using a tighter band than the per-game labels (±1.5 points)

#### Scenario: Split with no games
- **WHEN** a split (for example, games as an underdog) has no graded games
- **THEN** that split displays as unavailable rather than as zero

### Requirement: Per-game trend and list
The Performance tab SHALL display a per-game cover margin chart in chronological order, with positive and negative values visually distinguished, and a per-game list showing date, opponent, home/away, the spread, final result, cover margin, qualitative label, and reason tags.

#### Scenario: Viewing a graded game row
- **WHEN** the game list includes a game a team won by 3 as a 13.5-point favorite
- **THEN** the row shows the 13.5-point spread, the 3-point win, a cover margin of -10.5, the "under" label, and any applicable tags

#### Scenario: Linking to the game
- **WHEN** a user selects a game row
- **THEN** the user is taken to that game's detail page

### Requirement: Performance tab empty state
The Performance tab SHALL display an explicit message when the team has no graded games for the selected season, instead of an empty or broken view.

#### Scenario: No graded games
- **WHEN** a team has no games with a recorded spread for the selected season
- **THEN** the tab displays a message that no performance data is available for that season

### Requirement: League leaderboard on Teams index
The Teams index page SHALL include a leaderboard of all teams with at least one graded game, ranked by average cover margin descending, showing for each team its average cover margin, number of graded games, and qualitative label, and linking to that team's Performance tab.

#### Scenario: Ranking teams
- **WHEN** a user views the Teams index
- **THEN** teams appear ordered from highest to lowest average cover margin, with the over- and under-performers distinguishable at a glance

#### Scenario: Team with no graded games
- **WHEN** a team has no graded games this season
- **THEN** it is excluded from the ranking rather than shown with a zero average

#### Scenario: League has no graded games
- **WHEN** no team has any graded game this season
- **THEN** the leaderboard section displays an explicit no-data message

### Requirement: Regular season scope
The performance views and aggregates SHALL include regular-season games only; games of any other season type (for example preseason or playoffs) SHALL be excluded from averages and lists.

#### Scenario: Playoff game excluded
- **WHEN** a final game has a season type other than regular season
- **THEN** it does not contribute to any average and does not appear in the per-game list

### Requirement: Season-over-season trend
The Performance tab SHALL display a season-over-season trend section listing, for every season that has at least one graded game for the team, that season's average cover margin, qualitative label, and graded game count, in chronological order, independent of the season currently selected elsewhere on the tab.

#### Scenario: Team with graded games across multiple seasons
- **WHEN** a user opens a team's Performance tab and the team has graded games in more than one season
- **THEN** the trend section lists each of those seasons in chronological order with its average cover margin, qualitative label, and graded game count

#### Scenario: Season with no graded games omitted from the trend
- **WHEN** a season has no games with a recorded spread for the team
- **THEN** that season does not appear in the trend section

#### Scenario: No seasons have graded games
- **WHEN** the team has no graded games in any season
- **THEN** the trend section displays an explicit no-data message instead of an empty chart or list
