# Spec Delta

## MODIFIED Requirements

### Requirement: Running accuracy record
The system SHALL maintain and expose an aggregate accuracy record (e.g., hit rate) per prediction source (the system's own model, ESPN's predictor, and always picking the market favorite) over a selectable window such as season-to-date.

#### Scenario: Viewing accuracy over time
- **WHEN** graded results exist for one or more completed games
- **THEN** the system can report the hit rate for each prediction source across those games

#### Scenario: Comparing our model against the market favorite baseline
- **WHEN** graded results exist for one or more completed games with a market line recorded at pick time
- **THEN** the system can report the hit rate of always picking the market's favored side, alongside our model's and ESPN's predictor's hit rates, for the same games
