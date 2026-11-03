# Spec Delta

## ADDED Requirements

### Requirement: Player streaks section
The page SHALL display notable player/stat streaks for Over prop picks, as produced by the player-prop-streak-tracking capability, showing each qualifying player's stat, fixed floor, consecutive-game streak length, and last-10-game hit rate.

#### Scenario: Notable streaks exist for the relevant date
- **WHEN** one or more player/stat pairs are flagged as a notable streak for the relevant date
- **THEN** the page lists each qualifying player with their stat, floor, streak length, and hit rate

#### Scenario: No notable streaks exist
- **WHEN** no player/stat pair qualifies as a notable streak for the relevant date, including when no upcoming date has any eligible Over prop
- **THEN** the section shows an explicit no-data state instead of an empty or broken view
