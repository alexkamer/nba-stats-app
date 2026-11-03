# Spec Delta

## ADDED Requirements

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
