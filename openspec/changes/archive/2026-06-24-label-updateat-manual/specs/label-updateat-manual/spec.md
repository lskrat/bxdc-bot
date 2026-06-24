## ADDED Requirements

### Requirement: Label updateAt field auto-assignment
The system SHALL automatically set the `updateAt` field to the current timestamp when creating or updating a label, without relying on MyBatis-Plus automatic filling mechanism.

#### Scenario: Create label with updateAt
- **WHEN** a new label is created via POST /api/labels
- **THEN** the `updateAt` field SHALL be set to the current datetime

#### Scenario: Update label with updateAt
- **WHEN** an existing label is updated via PUT /api/labels/{id}
- **THEN** the `updateAt` field SHALL be updated to the current datetime

#### Scenario: Update label with updateBy
- **WHEN** a label is updated with x-user-id header
- **THEN** the `updateBy` field SHALL be set to the value from x-user-id header

## MODIFIED Requirements

### Requirement: Create label
The system SHALL create a new label record with the provided name, type, and intro. The `updateAt` field SHALL be set to the current datetime and `updateBy` field SHALL be set from the x-user-id header if present.

#### Scenario: Create label successfully
- **WHEN** POST /api/labels is called with valid name, type, and intro
- **AND** x-user-id header is provided
- **THEN** label is created with correct name, type, intro
- **AND** updateAt is set to current datetime
- **AND** updateBy is set to the value from x-user-id header

#### Scenario: Create label without user ID
- **WHEN** POST /api/labels is called without x-user-id header
- **THEN** label is created with updateBy set to null

### Requirement: Update label
The system SHALL update an existing label record with the provided name, type, and intro. The `updateAt` field SHALL be updated to the current datetime and `updateBy` field SHALL be updated from the x-user-id header if present.

#### Scenario: Update label successfully
- **WHEN** PUT /api/labels/{id} is called with valid name, type, and intro
- **AND** x-user-id header is provided
- **THEN** label is updated with correct name, type, intro
- **AND** updateAt is updated to current datetime
- **AND** updateBy is updated to the value from x-user-id header

#### Scenario: Update label without user ID
- **WHEN** PUT /api/labels/{id} is called without x-user-id header
- **THEN** label is updated with updateBy set to null

