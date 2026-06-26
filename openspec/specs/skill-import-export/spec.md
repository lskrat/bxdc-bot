# Capability: skill-import-export

## Purpose

让用户可以把单条 Skill（含其完整配置）导出为 JSON 文件，并能在另一会话/用户/部署中通过 JSON 文件导入一份新的 Skill。导入流程需要明确处理同名冲突与权限（importer 永远成为新 Skill 的 owner）。

## Requirements

### Requirement: Export Skill as JSON File

The system SHALL allow users to export a single Skill they have permission to manage as a JSON file download.

The exported JSON file MUST contain a `metaSchemaVersion` field (current: `1.0.0`), `exportedAt` (ISO 8601 timestamp), `exportedBy` (user id), `sourceType` (skill type), and a `skill` object containing the full record.

#### Scenario: User exports their own Skill
- **WHEN** the user clicks the "Export" button on a row in Skill Hub for a Skill where they are the creator
- **THEN** the browser downloads a JSON file named `<sanitized-skill-name>-<yyyyMMdd-HHmm>.json`
- **AND** the file contains the Skill's `name`, `description`, `type`, `configuration`, `executionMode`, `enabled`, `requiresConfirmation`, `visibility`, `avatar` fields

#### Scenario: Session/conversation-scoped fields are stripped
- **WHEN** the Skill's `configuration` contains keys `conversationId`, `sessionId`, `userId`, or `xUserId`
- **THEN** the exported JSON does NOT include those keys (compliance with `main-agent-conversation-scoped-skills` spec)

#### Scenario: User cannot export a system seed Skill
- **WHEN** the user attempts to export a Skill where `createdBy = "public"` (platform seed)
- **THEN** the "Export" button is disabled with tooltip "系统种子技能不可导出"

### Requirement: Import Skill from JSON File

The system SHALL allow users to import a single Skill from a previously exported JSON file.

#### Scenario: User selects a valid JSON file
- **WHEN** the user clicks the "Import Skill" button in Skill Hub toolbar and selects a JSON file
- **THEN** the file is parsed and a preview dialog appears showing: Skill name, type, description, configuration field count, import timestamp and exporter user id
- **AND** the dialog has a "Confirm Import" button (disabled if any required fields are invalid)

#### Scenario: Drag-and-drop import
- **WHEN** the user drags a JSON file onto the import dialog drop zone
- **THEN** the file is processed exactly the same way as if selected via file picker

#### Scenario: Invalid JSON structure
- **WHEN** the user selects a file that is not valid JSON, or does not match `metaSchemaVersion + skill` schema
- **THEN** the system displays an error dialog "文件格式错误，请确认是合法的 Skill 导出文件"
- **AND** no Skill record is created

#### Scenario: Unsupported metaSchemaVersion
- **WHEN** the file's `metaSchemaVersion` is higher than the current supported version (e.g. `2.0.0` while system supports `1.x.x`)
- **THEN** the system displays "该文件由更高版本导出，请升级系统后再导入"
- **AND** no Skill record is created

#### Scenario: Import with no name conflict
- **WHEN** the user confirms import and the target user has no Skill with the same name
- **THEN** a new Skill is created with `createdBy = current user id`, `visibility = PRIVATE` regardless of source visibility
- **AND** a success toast appears "Skill 已导入"
- **AND** the Skill Hub list refreshes to show the new Skill

#### Scenario: Import with name conflict — user chooses to overwrite
- **WHEN** the target user already has a Skill with the same name AND user selects "覆盖"
- **THEN** the existing Skill is deleted (FTP/Skill records removed if any) and a new Skill is created with the imported data

#### Scenario: Import with name conflict — user chooses to rename
- **WHEN** the target user already has a Skill with the same name AND user selects "重命名"
- **THEN** the imported Skill is renamed to `<original-name>-imported-<HHmmss>` before saving

#### Scenario: Import with name conflict — user cancels
- **WHEN** the target user already has a Skill with the same name AND user selects "取消"
- **THEN** no Skill is created; import dialog closes

### Requirement: Permission Model for Import/Export

The system SHALL enforce permission boundaries on import/export.

#### Scenario: User can only export their own Skills (or PUBLIC Skills they did not create)
- **WHEN** the user clicks "Export" on a Skill
- **THEN** the system only allows export if `skill.createdBy === currentUser.id` OR `skill.visibility === "PUBLIC"`
- **AND** for PUBLIC Skills, the export file's `exportedBy` field records the exporting user id (NOT the original creator)

#### Scenario: Imported Skill is always owned by the importer
- **WHEN** a user successfully imports a Skill
- **THEN** the new Skill's `createdBy` is set to the importing user's id
- **AND** the new Skill's `visibility` defaults to `PRIVATE` regardless of source visibility
- **AND** only the importer can edit/delete the new Skill

#### Scenario: User cannot import into another user's namespace
- **WHEN** the import API receives a `userId` field in the request body
- **THEN** the system ignores it and forces `createdBy = currentUser.id`
- **AND** the import succeeds with the importing user as owner

### Requirement: REST API Extensions

The system SHALL extend the existing `POST /api/skills` endpoint to accept an optional `importPayload` field.

#### Scenario: Create via import path
- **WHEN** the request body contains `importPayload.metaSchemaVersion` matching supported versions
- **THEN** the Skill is created with the imported data, `createdBy` forced to current user, `visibility` forced to PRIVATE
- **AND** the response returns the created Skill DTO with HTTP 201

#### Scenario: Field size limits enforced
- **WHEN** the import request contains a Skill with `name.length > 100`, `description.length > 2000`, or `configuration.length > 65536`
- **THEN** the system responds with HTTP 400 and a field-level error message