# Label Management

## Purpose

标签管理功能，支持对标签的增删改查操作，采用逻辑删除机制。

## Requirements

### Requirement: Create label
The system SHALL allow creating a new label with name, type, and optional intro.

#### Scenario: Successful creation
- **WHEN** POST request sent to /api/labels with name, type, and intro
- **THEN** label is saved to database with auto-generated ID
- **AND** response returns the created label with all fields

#### Scenario: Missing required fields
- **WHEN** POST request sent without name or type
- **THEN** response returns 400 Bad Request with error message

#### Scenario: Create label with user ID
- **WHEN** POST request sent to /api/labels with x-user-id header
- **THEN** label is saved with updateAt set to current time
- **AND** updateBy is set to the value from x-user-id header

#### Scenario: Create label without user ID
- **WHEN** POST request sent to /api/labels without x-user-id header
- **THEN** label is saved with updateAt set to current time
- **AND** updateBy is set to null

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

#### Scenario: Update label with user ID
- **WHEN** PUT request sent to /api/labels/{id} with x-user-id header
- **THEN** label is updated with updateAt set to current time
- **AND** updateBy is set to the value from x-user-id header

#### Scenario: Update label without user ID
- **WHEN** PUT request sent to /api/labels/{id} without x-user-id header
- **THEN** label is updated with updateAt set to current time
- **AND** updateBy is set to null

### Requirement: Logical delete label
The system SHALL perform logical deletion by setting del=1 instead of physical deletion.

#### Scenario: Successful deletion
- **WHEN** DELETE request sent to /api/labels/{id} with valid ID
- **THEN** sets del=1 for the label
- **AND** label is no longer returned in queries

#### Scenario: Delete non-existent label
- **WHEN** DELETE request sent to /api/labels/{id} with non-existent ID
- **THEN** returns 404 Not Found

### Requirement: Label updateAt field auto-assignment
The system SHALL automatically set the `updateAt` field to the current timestamp when creating or updating a label, without relying on MyBatis-Plus automatic filling mechanism.

#### Scenario: Create label with updateAt
- **WHEN** a new label is created via POST /api/labels
- **THEN** the `updateAt` field SHALL be set to the current datetime

#### Scenario: Update label with updateAt
- **WHEN** an existing label is updated via PUT /api/labels/{id}
- **THEN** the `updateAt` field SHALL be updated to the current datetime

### Requirement: Label updateAt field format
The system SHALL return the `updateAt` field in the format `yyyy-MM-dd HH:mm:ss` (e.g., `2026-06-24 10:02:05`) instead of ISO-8601 format.

#### Scenario: UpdateAt format in response
- **WHEN** any label API returns a SysLabel object
- **THEN** the `updateAt` field SHALL be formatted as `yyyy-MM-dd HH:mm:ss`
- **AND** the timezone SHALL be Asia/Shanghai

#### Scenario: Create label response format
- **WHEN** POST /api/labels is called and label is created successfully
- **THEN** the response `updateAt` field SHALL be in format `yyyy-MM-dd HH:mm:ss`

#### Scenario: Update label response format
- **WHEN** PUT /api/labels/{id} is called and label is updated successfully
- **THEN** the response `updateAt` field SHALL be in format `yyyy-MM-dd HH:mm:ss`

#### Scenario: Get label response format
- **WHEN** GET /api/labels/{id} is called
- **THEN** the response `updateAt` field SHALL be in format `yyyy-MM-dd HH:mm:ss`

#### Scenario: List labels response format
- **WHEN** GET /api/labels is called
- **THEN** each label in the `records` array SHALL have `updateAt` field formatted as `yyyy-MM-dd HH:mm:ss`

### Requirement: Database table structure
The system SHALL create sys_label table with specified fields.

#### Scenario: Table creation
- **WHEN** application starts
- **THEN** sys_label table is created with id, name, type, intro, updateAt, updateBy, del fields
- **AND** id is auto-increment primary key
- **AND** del defaults to 0
