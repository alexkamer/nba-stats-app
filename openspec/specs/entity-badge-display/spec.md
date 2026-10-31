# entity-badge-display Specification

## Purpose
Defines the shared circular badge treatment used for team/player crests and compact result or status indicators, replacing today's inconsistent mix of square and rounded image markup.

## Requirements

### Requirement: Team and player identity images render as circular badges
Wherever a team or player's identity image (logo or headshot) is shown, the system SHALL render it clipped to a circular badge of a size appropriate to its context, rather than an unclipped square image.

#### Scenario: Viewing a team crest in a matchup row
- **WHEN** a user views a row listing an opposing team (for example, a schedule row or a betting pick row)
- **THEN** that team's logo is rendered as a circular badge

#### Scenario: Viewing a player headshot
- **WHEN** a user views a player's headshot (for example, on that player's detail page)
- **THEN** the headshot is rendered as a circular badge

### Requirement: Badge falls back gracefully when an image is unavailable
If a team or player's identity image is missing or fails to load, the circular badge SHALL render a neutral placeholder of the same size and shape instead of a broken image or layout shift.

#### Scenario: Team with no logo URL
- **WHEN** a team or player record has no usable image URL
- **THEN** the badge renders a neutral-colored circular placeholder at the same dimensions the image would have occupied

### Requirement: Compact result and status indicators use the same circular badge shape
Compact indicators that mark a pick's status (for example, a graded hit/miss mark, or a high-confidence flag) SHALL use the same circular badge shape as identity badges, sized smaller, rather than a bare glyph with no badge container.

#### Scenario: Viewing a graded pick's result
- **WHEN** a user views a pick row for a graded pick
- **THEN** the hit/miss indicator renders inside a small circular badge, visually consistent with the identity badges on the same page
