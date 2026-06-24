## MODIFIED Requirements

### Requirement: Create label
The system SHALL automatically set updateAt to current time and updateBy to x-user-id header when creating a new label.

#### Scenario: Create label with user ID
- **WHEN** POST request sent to /api/labels with x-user-id header
- **THEN** label is saved with updateAt set to current time
- **AND** updateBy is set to the value from x-user-id header

#### Scenario: Create label without user ID
- **WHEN** POST request sent to /api/labels without x-user-id header
- **THEN** label is saved with updateAt set to current time
- **AND** updateBy is set to null

### Requirement: Update label
The system SHALL automatically update updateAt to current time and updateBy to x-user-id header when updating a label.

#### Scenario: Update label with user ID
- **WHEN** PUT request sent to /api/labels/{id} with x-user-id header
- **THEN** label is updated with updateAt set to current time
- **AND** updateBy is set to the value from x-user-id header

#### Scenario: Update label without user ID
- **WHEN** PUT request sent to /api/labels/{id} without x-user-id header
- **THEN** label is updated with updateAt set to current time
- **AND** updateBy is set to null