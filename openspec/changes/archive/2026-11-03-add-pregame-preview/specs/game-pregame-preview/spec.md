# Spec Delta

## Purpose

Gives a scheduled, not-yet-started game its own purpose-built tab set on the game detail page — a pregame Gamecast dashboard, ESPN's own preview article, and odds with player prop leans — in place of the live/post-game tabs that have nothing to show before tip-off.

## ADDED Requirements

### Requirement: Pregame tab set shown only for scheduled games
The system SHALL show Gamecast, Preview, and Odds tabs on the game detail page, with Gamecast selected by default, whenever the game's status is scheduled, and SHALL hide the recap, box score, play-by-play, and team stats tabs while that status holds.

#### Scenario: Visiting a scheduled game's detail page
- **WHEN** a user opens the game detail page for a game whose status is scheduled
- **THEN** the tab bar shows Gamecast, Preview, and Odds, with Gamecast as the active tab, and does not show the recap, box score, play-by-play, or team stats tabs

#### Scenario: Game moves to in-progress or final
- **WHEN** a game's status changes from scheduled to in-progress or final
- **THEN** the recap, box score, play-by-play, and team stats tabs become available again, and the pregame Gamecast/Preview/Odds tab set is no longer shown

### Requirement: Betting projection summary on the pregame Gamecast tab
The pregame Gamecast tab SHALL display, for a scheduled game, the system's own projected score and win probability for each team alongside the market line, when a projection exists for that game.

#### Scenario: Projection available for a scheduled game
- **WHEN** a scheduled game has a betting projection on record
- **THEN** the pregame Gamecast tab shows each team's projected score, each team's win probability, and the market line for comparison

#### Scenario: No projection available
- **WHEN** a scheduled game has no betting projection on record
- **THEN** the pregame Gamecast tab omits the projection summary rather than showing blank or placeholder values

### Requirement: Win probability derived from the system's own margin projection
The system's own win probability for the betting projection summary SHALL be derived from that same projection's margin and standard deviation, not from a separately-sourced win-probability model, so the displayed score and win probability can never disagree in favored side.

#### Scenario: Projected margin favors a team
- **WHEN** a scheduled game's betting projection favors one team by a nonzero margin
- **THEN** that team's displayed win probability is greater than 50%, consistent with its favored score

### Requirement: ESPN predictor shown separately from the system's own projection
The pregame Gamecast tab SHALL display ESPN's own win-probability predictor for each team in its own container, visually and structurally separate from the system's own projection summary, when ESPN's predictor data is available for that game.

#### Scenario: ESPN predictor available
- **WHEN** a scheduled game's ESPN summary data includes a matchup predictor for both teams
- **THEN** the pregame Gamecast tab shows a separate container with each team's ESPN-predicted win probability, distinct from the projection summary

#### Scenario: ESPN predictor unavailable
- **WHEN** a scheduled game's ESPN summary data includes no matchup predictor
- **THEN** the pregame Gamecast tab omits the ESPN predictor container rather than showing blank or placeholder values

### Requirement: Preview article blurb on the pregame Gamecast tab
The pregame Gamecast tab SHALL display the pregame preview article's headline, description, and byline above the projection and ESPN predictor cards, when a preview article is available for that game.

#### Scenario: Preview article available
- **WHEN** a scheduled game has a pregame preview article available
- **THEN** the pregame Gamecast tab shows that article's headline, description, and byline above the projection and ESPN predictor cards

#### Scenario: No preview article available
- **WHEN** a scheduled game has no pregame preview article available
- **THEN** the pregame Gamecast tab omits the blurb rather than showing blank or placeholder values

### Requirement: Starting lineups panel on the pregame Gamecast tab
The pregame Gamecast tab SHALL display each team's current depth-chart-based top five players, labeled as projected starters.

#### Scenario: Viewing a scheduled game's lineups
- **WHEN** a user opens the Gamecast tab for a scheduled game
- **THEN** the tab shows each team's depth-chart-based top five players, labeled as projected starters

#### Scenario: Depth chart unavailable for a team
- **WHEN** a team's depth chart cannot be retrieved
- **THEN** the pregame Gamecast tab omits that team's lineup panel rather than showing a blank or broken one

### Requirement: Injury and availability panel on the pregame Gamecast tab
The pregame Gamecast tab SHALL display, for each team, every rostered player's frozen pre-game availability status (OUT, DOUBTFUL, QUESTIONABLE, PROBABLE, or AVAILABLE) for the current game, grouped so that unavailable or limited players are easy to find.

#### Scenario: Team has players with a non-available status
- **WHEN** a scheduled game's roster includes a player whose frozen availability status for that game is OUT, DOUBTFUL, QUESTIONABLE, or PROBABLE
- **THEN** the pregame Gamecast tab lists that player with their status on their team's side of the panel

#### Scenario: Team has no flagged players
- **WHEN** every rostered player on a team is AVAILABLE for the game
- **THEN** the pregame Gamecast tab indicates that team has no reported availability concerns, rather than showing an empty panel

### Requirement: Pregame preview article on the Preview tab
The Preview tab SHALL display a scheduled game's ESPN preview article (headline, byline, and body text) when that game's summary data includes an article of type "Preview", and SHALL show an explicit "no preview available" message otherwise.

#### Scenario: Preview article available
- **WHEN** a scheduled game's ESPN summary includes an article of type "Preview"
- **THEN** the Preview tab displays its headline, byline (source and published date), and body paragraphs

#### Scenario: No preview article available
- **WHEN** a scheduled game's ESPN summary includes no article, or an article whose type is not "Preview"
- **THEN** the Preview tab displays a message indicating no preview is available for this game

### Requirement: Odds and player props on the Odds tab
The Odds tab SHALL display a scheduled game's market odds (spread, total, moneyline) when available, and the player prop leans (projected value, line, and over/under lean) for players with a tracked prop projection for that game.

#### Scenario: Odds and props available
- **WHEN** a scheduled game has market odds and one or more player prop projections on record
- **THEN** the Odds tab shows the odds table and a list of player prop leans, each with the player's name, stat type, projected value, line, and over/under lean

#### Scenario: No odds or props available
- **WHEN** a scheduled game has no market odds or no player prop projections on record
- **THEN** the Odds tab omits the missing section rather than showing blank or placeholder values
