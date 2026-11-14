# ui-theming Specification

## Purpose

Defines the light/dark theme system that governs which color tokens render across the app, how users switch between them, and how that choice persists.

## Requirements

### Requirement: Default theme is light
A first-time visitor with no stored theme preference SHALL see the app rendered in the light theme.

#### Scenario: New visitor with no stored preference
- **WHEN** a visitor loads any page for the first time, with no theme preference stored
- **THEN** the page renders using the light theme's tokens

### Requirement: User can toggle between light and dark themes
The system SHALL provide a toggle control, reachable from every page, that switches the active theme between light and dark.

#### Scenario: User switches to dark
- **WHEN** a user activates the toggle while the light theme is active
- **THEN** the app switches to the dark theme without a full page reload

#### Scenario: User switches back to light
- **WHEN** a user activates the toggle while the dark theme is active
- **THEN** the app switches to the light theme without a full page reload

### Requirement: Theme preference persists across sessions
Once a user explicitly selects a theme, the system SHALL remember that choice and apply it on subsequent visits, overriding the light default.

#### Scenario: Returning visitor after selecting dark
- **WHEN** a user previously selected the dark theme and returns in a new browser session
- **THEN** the app renders in the dark theme without requiring the user to toggle again

### Requirement: All UI surfaces use theme tokens
Every page and shared component SHALL render its background, text, surface, and border colors from the active theme's token set, not from a hardcoded color tied to one theme.

#### Scenario: Page renders correctly in both themes
- **WHEN** any page is viewed in either the light or dark theme
- **THEN** all backgrounds, text, surfaces, and borders on that page use colors from the active theme's tokens, with no leftover color hardcoded to only one theme

### Requirement: Theme switch avoids an unstyled flash
When a page loads, the system SHALL apply the correct theme (stored preference or light default) before the page is visibly rendered to the user.

#### Scenario: Page load with stored dark preference
- **WHEN** a user with a stored dark preference loads a page
- **THEN** the page does not visibly flash the light theme before switching to dark

### Requirement: Team accent colors stay legible in dark theme
A team's accent color used for a bar, strip or text SHALL remain distinguishable from the dark theme's surface; when a team color is too dark, the system SHALL lighten it for display.

#### Scenario: Dark team color in dark theme
- **WHEN** a user in the dark theme views a chart colored by a dark team color (for example a navy)
- **THEN** the bars are visibly distinct from the surface behind them
