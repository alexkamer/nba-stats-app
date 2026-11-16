# Spec Delta

## ADDED Requirements

### Requirement: Minutes trend adjustment
The system SHALL adjust a player's prop projection by a multiplier reflecting whether his minutes over his last 3 games are trending up or down relative to his whole recent-form window, bounded within an empirically validated range so a single blowout or garbage-time game cannot swing the projection beyond what historical outcomes support.

#### Scenario: Recent minutes are trending down
- **WHEN** a player's average minutes over his last 3 games are lower than his average minutes over his whole recent-form window
- **THEN** the projection is scaled down relative to what it would be without this adjustment

#### Scenario: Recent minutes are trending up
- **WHEN** a player's average minutes over his last 3 games are higher than his average minutes over his whole recent-form window
- **THEN** the projection is scaled up relative to what it would be without this adjustment

#### Scenario: Trend multiplier is bounded
- **WHEN** the ratio of a player's last-3-games minutes average to his whole recent-form window's minutes average exceeds the system's validated bound in either direction
- **THEN** the multiplier applied is clamped at that bound rather than scaling the projection further
