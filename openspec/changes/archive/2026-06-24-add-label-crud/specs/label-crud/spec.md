## ADDED Requirements

### Requirement: Create label
The system SHALL allow creating a new label with name, type, and optional intro.

#### Scenario: Successful creation
- **WHEN** POST request sent to /api/labels with name, type, and intro
- **THEN** label is saved to database with auto-generated ID
- **AND** response returns the created label with all fields

#### Scenario: Missing required fields
- **WHEN** POST request sent without name or type
- **THEN** response returns 400 Bad Request with error message

### Requirement: Query labels with pagination
The system SHALL provide paginated query of labels, returning max 20 items per page by default.

#### Scenario: Query first page
- **WHEN** GET request sent to /api/labels with page=0 and size=20
- **THEN** returns first 20 labels ordered by update time descending
- **AND** filters out deleted labels (del=0)

#### Scenario: Query specific page
- **WHEN** GET request sent to /api/labels with page=2 and size=20
- **THEN** returns labels from page 3 (0-indexed)

### Requirement: Get label by ID
The system SHALL allow retrieving a single label by its ID.

#### Scenario: Existing label
- **WHEN** GET request sent to /api/labels/{id} with valid ID
- **THEN** returns the label details if exists and not deleted

#### Scenario: Non-existent label
- **WHEN** GET request sent to /api/labels/{id} with invalid ID
- **THEN** returns 404 Not Found

### Requirement: Update label
The system SHALL allow updating label name, type, and intro.

#### Scenario: Successful update
- **WHEN** PUT request sent to /api/labels/{id} with updated fields
- **THEN** updates the label in database
- **AND** updateAt field is automatically set to current time

#### Scenario: Update non-existent label
- **WHEN** PUT request sent to /api/labels/{id} with non-existent ID
- **THEN** returns 404 Not Found

### Requirement: Logical delete label
The system SHALL perform logical deletion by setting del=1 instead of physical deletion.

#### Scenario: Successful deletion
- **WHEN** DELETE request sent to /api/labels/{id} with valid ID
- **THEN** sets del=1 for the label
- **AND** label is no longer returned in queries

#### Scenario: Delete non-existent label
- **WHEN** DELETE request sent to /api/labels/{id} with non-existent ID
- **THEN** returns 404 Not Found

### Requirement: Database table structure
The system SHALL create sys_label table with specified fields.

#### Scenario: Table creation
- **WHEN** application starts
- **THEN** sys_label table is created with id, name, type, intro, updateAt, updateBy, del fields
- **AND** id is auto-increment primary key
- **AND** del defaults to 0