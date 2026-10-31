# game-recap Specification

## Purpose

Surfaces a game's post-game recap article — headline, byline, and body text — on the game detail page's Recap tab, sourced live from ESPN and never persisted.

## Requirements

### Requirement: Recap content extraction
The system SHALL extract a recap (headline, source, published date, and body paragraphs) from a game's ESPN summary data only when that summary's article is of type "Recap". Any other article type (e.g. a pregame "Preview") or a missing article SHALL be treated as no recap being available.

#### Scenario: Finished game with a published recap
- **WHEN** a game's ESPN summary includes an article of type "Recap"
- **THEN** the system extracts its headline, source, published date, and body text for display

#### Scenario: Game with only a pregame preview article
- **WHEN** a game's ESPN summary includes an article whose type is not "Recap" (e.g. "Preview")
- **THEN** the system treats the game as having no recap available

#### Scenario: Game with no article at all
- **WHEN** a game's ESPN summary includes no article
- **THEN** the system treats the game as having no recap available

### Requirement: Recap body is rendered as plain text
The recap body SHALL be presented as plain text paragraphs, with any markup in the source content stripped rather than rendered, and without using any image from the source content's generic media list as an illustration of the game.

#### Scenario: Body text contains inline markup
- **WHEN** the recap's source body text contains inline markup (e.g. links around player or team names)
- **THEN** the displayed body shows the plain text content with the markup removed, not interpreted as markup

#### Scenario: Recap available for a game
- **WHEN** a recap is available for a game
- **THEN** the Recap tab displays the headline, byline (source and published date), and body paragraphs, and does not display any image from the source content's generic media list

### Requirement: Recap tab empty state
The Recap tab SHALL display an explicit "no recap available" message whenever no recap is available for the current game, rather than an empty or broken view.

#### Scenario: Viewing the Recap tab for a game with no recap
- **WHEN** a user opens the Recap tab for a game that has no recap available
- **THEN** the tab displays a message indicating no recap is available for this game
