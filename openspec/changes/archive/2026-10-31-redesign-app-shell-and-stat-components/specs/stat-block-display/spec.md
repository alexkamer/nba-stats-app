# Spec Delta

## Purpose

Defines the shared stat-block pattern (headline number, label, and optional comparison bar) used consistently anywhere the app shows a statistical figure, replacing duplicated one-off tile implementations.

## ADDED Requirements

### Requirement: A stat block always shows a label and a headline value
Every statistical figure rendered as a stat block SHALL display a short label describing what the figure measures and a single headline value rendered as the visually dominant element of the block.

#### Scenario: Rendering a graded-pick accuracy figure
- **WHEN** the betting page shows the hit rate for a tracked pick type
- **THEN** the stat block shows that pick type's label and its hit-rate percentage as the headline value

#### Scenario: Value is unavailable
- **WHEN** a stat block's underlying value cannot be computed (for example, no games have been graded yet)
- **THEN** the stat block shows a placeholder ("—") in place of the headline value rather than an error or blank space

### Requirement: A stat block may show a comparison bar beneath its value
When a stat block's figure has a meaningful split (for example, a ratio toward a threshold, or a home/away breakdown), the system SHALL render a comparison bar beneath the headline value representing that split.

#### Scenario: Confidence figure with a threshold
- **WHEN** a stat block shows a pick's confidence figure relative to the bettable threshold
- **THEN** a filled comparison bar beneath the value reflects how far the figure is toward that threshold

#### Scenario: Figure with no meaningful split
- **WHEN** a stat block's figure has no secondary split to show (for example, a plain season total)
- **THEN** the stat block renders without a comparison bar, showing only the label and headline value

### Requirement: Stat blocks render identically across pages
The system SHALL use the same stat-block component for every statistical figure shown across pages (including the betting page's accuracy and confidence figures, and player/team per-game statistics), rather than page-specific tile implementations.

#### Scenario: Comparing a betting-page figure and a player-page figure
- **WHEN** a user views a stat block on the betting page and a stat block on a player's detail page
- **THEN** both use the same visual structure (label position, headline value styling, optional comparison bar), differing only in their label, value, and color
