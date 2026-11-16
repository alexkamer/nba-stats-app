# Spec Delta

## ADDED Requirements

### Requirement: Methodology version breakdown
The page SHALL display, for each accuracy category where more than one projection-methodology version has graded picks, a separate hit rate per methodology version — so a change to how projections are computed can be judged on its own real-world results, distinct from the overall season-to-date accuracy scoreboard.

#### Scenario: Multiple methodology versions have graded picks in the same category
- **WHEN** an accuracy category (e.g. player props) has graded picks under two or more distinct projection-methodology versions
- **THEN** the page shows each methodology version's hit rate and graded count for that category separately, rather than only a single combined figure

#### Scenario: Only one methodology version has graded picks
- **WHEN** an accuracy category has graded picks under only one projection-methodology version so far
- **THEN** the page omits that category from the methodology breakdown rather than showing a comparison with nothing to compare against

#### Scenario: No methodology version has any graded picks yet
- **WHEN** no accuracy category has any graded picks under any methodology version
- **THEN** the page shows an explicit no-data state for this section instead of an empty or broken view
