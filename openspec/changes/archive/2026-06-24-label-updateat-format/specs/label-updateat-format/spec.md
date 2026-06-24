## ADDED Requirements

### Requirement: Label updateAt field format
The system SHALL return the `updateAt` field in the format `yyyy-MM-dd HH:mm:ss` (e.g., `2026-06-24 10:02:05`) instead of ISO-8601 format.

#### Scenario: UpdateAt format in response
- **WHEN** any label API returns a SysLabel object
- **THEN** the `updateAt` field SHALL be formatted as `yyyy-MM-dd HH:mm:ss`
- **AND** the timezone SHALL be Asia/Shanghai

## MODIFIED Requirements

### Requirement: Create label response format
The system SHALL return the created label with `updateAt` field formatted as `yyyy-MM-dd HH:mm:ss`.

#### Scenario: Create label response format
- **WHEN** POST /api/labels is called and label is created successfully
- **THEN** the response `updateAt` field SHALL be in format `yyyy-MM-dd HH:mm:ss`

### Requirement: Update label response format
The system SHALL return the updated label with `updateAt` field formatted as `yyyy-MM-dd HH:mm:ss`.

#### Scenario: Update label response format
- **WHEN** PUT /api/labels/{id} is called and label is updated successfully
- **THEN** the response `updateAt` field SHALL be in format `yyyy-MM-dd HH:mm:ss`

### Requirement: Get label response format
The system SHALL return label details with `updateAt` field formatted as `yyyy-MM-dd HH:mm:ss`.

#### Scenario: Get label response format
- **WHEN** GET /api/labels/{id} is called
- **THEN** the response `updateAt` field SHALL be in format `yyyy-MM-dd HH:mm:ss`

#### Scenario: List labels response format
- **WHEN** GET /api/labels is called
- **THEN** each label in the `records` array SHALL have `updateAt` field formatted as `yyyy-MM-dd HH:mm:ss`

