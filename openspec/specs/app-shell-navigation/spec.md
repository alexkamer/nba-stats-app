# app-shell-navigation Specification

## Purpose
Defines the persistent, responsive navigation shell (sidebar on desktop, top bar with hamburger on mobile) and the breadcrumb trail shown above every page's content.

## Requirements

### Requirement: Desktop viewports show a persistent sidebar
On a desktop-width viewport, the system SHALL render section navigation (the app's top-level sections) as a persistent left sidebar, visible without user action, rather than a top-only link row.

#### Scenario: Viewing any page on desktop
- **WHEN** a user loads any page at a desktop viewport width
- **THEN** a left sidebar listing the app's top-level sections is visible alongside the page content without requiring a click to reveal it

### Requirement: Mobile viewports collapse navigation behind a hamburger control
On a mobile-width viewport, the system SHALL render section navigation as a top bar with a hamburger control that reveals the section list when activated, instead of the persistent sidebar.

#### Scenario: Viewing any page on mobile
- **WHEN** a user loads any page at a mobile viewport width
- **THEN** the sidebar is replaced by a top bar containing a hamburger control, and activating that control reveals the same section links the sidebar would show on desktop

#### Scenario: Closing the mobile menu
- **WHEN** a user activates the hamburger control while the mobile menu is open
- **THEN** the section list collapses and is no longer visible

### Requirement: Every page shows a breadcrumb trail above its content
The system SHALL render a breadcrumb trail above the main content of every page, reflecting that page's position in the app's navigation hierarchy.

#### Scenario: Viewing a nested detail page
- **WHEN** a user views a page reached through a hierarchy (for example a specific team's detail page, reached via a teams listing)
- **THEN** a breadcrumb trail above the page content shows each level of that hierarchy, with each ancestor level rendered as a link back to it

#### Scenario: Viewing a top-level page
- **WHEN** a user views a page with no deeper hierarchy (for example the home page)
- **THEN** the breadcrumb trail shows that page's own position without broken or placeholder ancestor links

### Requirement: Navigation and breadcrumbs use active theme tokens
The sidebar, mobile top bar, hamburger menu, and breadcrumb trail SHALL render using the active theme's color tokens, consistent with the rest of the app's theming.

#### Scenario: Viewing the shell in dark theme
- **WHEN** a user with the dark theme active views any page
- **THEN** the sidebar (or mobile top bar) and breadcrumb trail render using dark-theme tokens, with no leftover light-only hardcoded colors
