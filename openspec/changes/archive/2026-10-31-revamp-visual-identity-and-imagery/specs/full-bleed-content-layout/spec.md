# Spec Delta

## Purpose

Defines how a page section breaks out of the centered content column to span the full content area, without ever overlapping persistent navigation chrome such as the sidebar.

## ADDED Requirements

### Requirement: Full-bleed sections span the content area, not persistent navigation chrome
A page section that breaks out of the centered content column to appear full-width SHALL span only the content area to the right of any persistent navigation sidebar, never rendering under or overlapping that sidebar.

#### Scenario: Viewing a game's header band on desktop
- **WHEN** a user views a game detail page at a desktop viewport width, where the sidebar is visible
- **THEN** the game's full-bleed header band starts flush with the sidebar's right edge and extends to the viewport's right edge, with no part of the band rendered underneath the sidebar

#### Scenario: Viewing a team or player header band on desktop
- **WHEN** a user views a team or player detail page at a desktop viewport width
- **THEN** that page's full-bleed header band is likewise flush with the sidebar's right edge, not the viewport's left edge

### Requirement: Full-bleed sections span the full viewport when no sidebar is shown
On a viewport width where the sidebar is replaced by the mobile top bar (per `app-shell-navigation`), a full-bleed section SHALL span the full viewport width, since no persistent chrome occupies part of it.

#### Scenario: Viewing a game header band on mobile
- **WHEN** a user views a game detail page at a mobile viewport width, where the sidebar is hidden
- **THEN** the game's full-bleed header band spans the full viewport width edge to edge
