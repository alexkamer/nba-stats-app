# team-game-performance-tracking Specification

## Purpose

Measures how each team performed in each completed game relative to the market's expectation, and records plausible reasons for the gap, so a team's season can be scanned for over- and underperformance without recomputing from raw game data on every read.

## Requirements

### Requirement: Compute cover margin per team per final game
The system SHALL compute, for every final game with a recorded spread, each participating team's expected margin, actual margin, and cover margin. A team's expected margin is the margin the spread implies for that team (positive when favored, negative when an underdog), the actual margin is the team's final score minus its opponent's, and the cover margin is actual margin minus expected margin.

#### Scenario: Favorite wins by less than the spread
- **WHEN** a team favored by 13.5 wins by 3
- **THEN** the system records an expected margin of +13.5, an actual margin of +3, and a cover margin of -10.5 for that team in that game

#### Scenario: Underdog loses by less than the spread
- **WHEN** a team that is a 3-point underdog loses by 2
- **THEN** the system records an expected margin of -3, an actual margin of -2, and a cover margin of +1.0 for that team in that game

#### Scenario: Opponent's cover margin mirrors
- **WHEN** a game is graded
- **THEN** the two teams' cover margins for that game are equal in magnitude and opposite in sign

#### Scenario: Game with no recorded spread
- **WHEN** a game goes final and has no `Odds` row, or its spread is null
- **THEN** the system records no performance row for either team in that game

### Requirement: Qualitative performance label
The system SHALL assign each performance row one label from: strongly over, over, as expected, under, strongly under, determined by the cover margin against defined thresholds (strongly over at +15 or more, over from +5 up to +15, as expected within 5 points of zero, under from -5 down to -15, strongly under at -15 or less). The label SHALL be independent of whether the team won or lost the game.

#### Scenario: Losing team labeled as expected or better
- **WHEN** a team loses by 2 as a 3-point underdog (cover margin +1.0)
- **THEN** its label is "as expected" even though it lost

#### Scenario: Winning team labeled under
- **WHEN** a team wins by 3 as a 13.5-point favorite (cover margin -10.5)
- **THEN** its label is "under" even though it won

### Requirement: Reason tags are derived deterministically from ingested data
The system SHALL attach zero or more reason tags to each performance row, each derived deterministically from ingested data rather than generated or inferred.

#### Scenario: No tag applies
- **WHEN** none of the tag rules match a game
- **THEN** the performance row has no tags

### Requirement: Star-player-out tag
The system SHALL attach a star-player-out tag to a team's performance row when one of that team's top players by season minutes was recorded as OUT in the game's pre-game availability snapshot.

#### Scenario: Star player listed out
- **WHEN** one of a team's top players by season minutes has OUT status in the game's availability snapshot
- **THEN** that team's performance row for the game carries the star-player-out tag

### Requirement: Early-blowout tag
The system SHALL attach an early-blowout tag to both teams' performance rows when the game's margin reached at least 20 points by halftime.

#### Scenario: Early blowout
- **WHEN** the margin between the teams reached 20 or more points by halftime
- **THEN** both teams' rows for the game carry the early-blowout tag

### Requirement: Late-collapse tag
The system SHALL attach a late-collapse tag to a team's performance row when that team led by at least 15 points at some point in the game and did not win.

#### Scenario: Team blows a big lead
- **WHEN** a team led by 15 or more points at some point in the game and lost
- **THEN** that team's performance row for the game carries the late-collapse tag

### Requirement: Garbage-time-swing tag
The system SHALL attach a garbage-time-swing tag to a team's performance row when that team's cover result at the start of the fourth quarter differs from its final cover result.

#### Scenario: Cover result flips in the fourth quarter
- **WHEN** a team was covering the spread at the start of the fourth quarter but finishes the game not covering it (or vice versa)
- **THEN** that team's performance row for the game carries the garbage-time-swing tag

### Requirement: Shooting-hot and shooting-cold tags
The system SHALL attach a shooting-hot or shooting-cold tag to a team's performance row when that team's field-goal percentage in the game deviates from its season-to-date average by a defined threshold.

#### Scenario: Team shoots well above its season average
- **WHEN** a team's field-goal percentage in the game exceeds its season-to-date average by at least the defined threshold
- **THEN** that team's performance row for the game carries the shooting-hot tag

### Requirement: Tags omitted when source data is missing
The system SHALL omit a reason tag when the data its rule depends on is missing for a game, while still recording that game's cover margin and label.

#### Scenario: Required source data missing
- **WHEN** a game has no play-by-play rows or no availability snapshot
- **THEN** the system omits the tags that depend on the missing data and still records the cover margin and label

### Requirement: Computed once on game completion and idempotent
The system SHALL compute performance rows for a game once, after it goes final, and re-running the computation SHALL NOT create duplicate rows or alter rows already computed.

#### Scenario: Re-running the computation
- **WHEN** the computation runs again after a game already has performance rows
- **THEN** no duplicate rows are created and existing rows are unchanged

#### Scenario: New final game since last run
- **WHEN** a game has gone final since the last run and has a recorded spread
- **THEN** the next run creates performance rows for both teams
