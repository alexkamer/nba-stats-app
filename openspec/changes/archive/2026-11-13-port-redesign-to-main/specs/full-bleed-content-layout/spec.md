# Spec Delta

## ADDED Requirements

### Requirement: The team header band is the only full-bleed section
The team page's header band SHALL span the content area to the right of the persistent rail, flush with the rail's right edge and never under it. Game and player headers SHALL be contained cards inside the content column (per `visual-identity`) and SHALL NOT break out of it.

#### Scenario: Viewing a team header band on desktop
- **WHEN** a user views a team detail page at a desktop viewport width
- **THEN** the header band starts at the rail's right edge and extends to the viewport's right edge

#### Scenario: Viewing a game or player header on desktop
- **WHEN** a user views a game or player detail page at a desktop viewport width
- **THEN** the header sits inside the content column with margins on both sides

### Requirement: The team header band spans the viewport on mobile
On a viewport where the rail is replaced by the mobile bar, the team header band SHALL span the full viewport width.

#### Scenario: Viewing a team header band on mobile
- **WHEN** a user views a team detail page at a mobile viewport width
- **THEN** the header band spans the viewport edge to edge

## REMOVED Requirements

### Requirement: Full-bleed sections span the content area, not persistent navigation chrome
**Reason**: Game and player headers are no longer full-bleed; the rule is restated for the team header band alone.
**Migration**: See "The team header band is the only full-bleed section".

### Requirement: Full-bleed sections span the full viewport when no sidebar is shown
**Reason**: Restated for the team header band alone.
**Migration**: See "The team header band spans the viewport on mobile".
