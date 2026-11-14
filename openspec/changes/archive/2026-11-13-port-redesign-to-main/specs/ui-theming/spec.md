# Spec Delta

## ADDED Requirements

### Requirement: Team accent colors stay legible in dark theme
A team's accent color used for a bar, strip or text SHALL remain distinguishable from the dark theme's surface; when a team color is too dark, the system SHALL lighten it for display.

#### Scenario: Dark team color in dark theme
- **WHEN** a user in the dark theme views a chart colored by a dark team color (for example a navy)
- **THEN** the bars are visibly distinct from the surface behind them
