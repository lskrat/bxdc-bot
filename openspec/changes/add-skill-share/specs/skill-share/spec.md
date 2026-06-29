## ADDED Requirements

### Requirement: Share Skill to Specific Users

The system SHALL allow a Skill owner to share the Skill with one or more specific users. Each share record carries a permission level (`READ` or `WRITE`) that determines what the recipient can do.

Sharing SHALL be additive — the original owner always retains full control (edit, delete, share, unshare). A user SHALL NOT share a Skill they do not own.

#### Scenario: Owner shares a Skill to a single user with READ permission
- **WHEN** the owner POSTs to `/api/skills/{id}/share` with body `{userIds: ["u-2"], permission: "READ"}`
- **THEN** the system records `u-2` as a recipient with READ permission
- **AND** `u-2` sees this Skill in their Skill Hub list and can call it from a main Agent conversation
- **AND** `u-2` can view the Skill's detail/edit modal in read-only mode

#### Scenario: Owner shares a Skill to multiple users with WRITE permission
- **WHEN** the owner POSTs to `/api/skills/{id}/share` with body `{userIds: ["u-2","u-3"], permission: "WRITE"}`
- **THEN** both `u-2` and `u-3` are added as WRITE recipients
- **AND** both recipients can open the edit modal, modify name / description / configuration / enabled / requiresConfirmation / avatar / introMd, and save
- **AND** neither recipient can delete the Skill, change `visibility`, or share to other users

#### Scenario: Non-owner cannot share a Skill
- **WHEN** a non-owner user (neither `createdBy` nor a WRITE recipient) POSTs to `/api/skills/{id}/share`
- **THEN** the system responds with HTTP 403
- **AND** no share record is created

#### Scenario: Sharing to a non-existent user
- **WHEN** the share request body contains a user id that does not exist in `user` table
- **THEN** the system responds with HTTP 400 and a field-level error
- **AND** the request is rejected atomically (no partial share)

#### Scenario: Sharing an already-shared Skill to the same user updates permission
- **WHEN** the owner POSTs share for `u-2` with `READ`, then again with `WRITE`
- **THEN** `u-2`'s permission is updated to `WRITE`
- **AND** no duplicate share record exists

### Requirement: Unshare Skill from a Recipient

The system SHALL allow the Skill owner to revoke a share at any time.

#### Scenario: Owner unshares a Skill from a recipient
- **WHEN** the owner DELETEs `/api/skills/{id}/share/{userId}`
- **THEN** the recipient is removed from the share list
- **AND** the recipient can no longer see the Skill in their list
- **AND** any existing main Agent conversations the recipient had using this Skill remain valid (Skill data is not deleted)

#### Scenario: Non-owner cannot unshare
- **WHEN** a non-owner user DELETEs `/api/skills/{id}/share/{userId}`
- **THEN** the system responds with HTTP 403
- **AND** the share record is unchanged

#### Scenario: Unsharing an unshared recipient is idempotent
- **WHEN** the owner DELETEs a share that does not exist
- **THEN** the system responds with HTTP 200 (idempotent)
- **AND** no error is raised

### Requirement: Visibility Filter for Shared Skills

The system SHALL include Skill records shared to the requesting user in the result of `GET /api/skills` and the dedicated `GET /api/skills/shared-with-me` endpoint.

#### Scenario: Recipient sees shared Skill in their list
- **WHEN** user `u-2` has been shared Skill `s-1` (visibility=SHARED, owner=`u-1`)
- **THEN** `GET /api/skills` with `X-User-Id: u-2` includes `s-1` in the response
- **AND** the Skill row shows a "分享给我" badge with the owner's name

#### Scenario: Non-recipient does not see shared Skill
- **WHEN** user `u-3` has NOT been shared Skill `s-1`
- **THEN** `GET /api/skills` with `X-User-Id: u-3` does NOT include `s-1`

#### Scenario: Dedicated endpoint lists skills shared with the requesting user
- **WHEN** `GET /api/skills/shared-with-me` is called with `X-User-Id: u-2`
- **THEN** the response contains exactly the Skills where `u-2` is in `sharedWithUserIds`
- **AND** the response includes the owner's `createdBy` and `exportedAt`-style metadata for UI display

#### Scenario: Detail view respects share permission
- **WHEN** user `u-2` (READ permission) GETs `/api/skills/{id}` for a shared Skill
- **THEN** the response includes full Skill data
- **AND** the Skill edit modal opens in read-only mode (no save button)
- **AND** any subsequent PUT request from `u-2` is rejected with HTTP 403

### Requirement: Permission Boundaries for Shared Skills

The system SHALL enforce strict permission boundaries. The owner is the only one who can perform owner-level operations. Recipients' capabilities are bounded by their share permission.

#### Scenario: READ recipient can call but not edit
- **WHEN** a READ recipient uses the Skill in a main Agent conversation
- **THEN** the Skill executes normally (subject to existing `enabled` + `requiresConfirmation` checks)
- **AND** any edit modal opened by this user shows disabled fields and no save button

#### Scenario: WRITE recipient can edit fields but not delete or share
- **WHEN** a WRITE recipient PUTs the Skill with updated fields
- **THEN** the system updates only the editable fields (name, description, configuration, enabled, requiresConfirmation, avatar, introMd)
- **AND** if the request body attempts to change `visibility`, `teamId`, `sharedWithUserIds`, or `createdBy`, the system rejects with HTTP 400
- **AND** DELETE on the Skill returns HTTP 403

#### Scenario: WRITE recipient cannot share to other users
- **WHEN** a WRITE recipient POSTs to `/api/skills/{id}/share`
- **THEN** the system responds with HTTP 403

#### Scenario: WRITE recipient's edits update owner-recorded timestamps
- **WHEN** a WRITE recipient successfully updates a Skill
- **THEN** `updatedAt` is set to current timestamp
- **AND** `updatedBy` (or audit log) records the recipient's user id, NOT the owner

#### Scenario: Disabling a shared Skill cascades to all recipients
- **WHEN** the owner sets `enabled=false` on a shared Skill
- **THEN** the Skill disappears from all recipients' lists immediately on next refresh
- **AND** any active Agent conversation using the Skill receives a "Skill 已禁用" error on next invocation

### Requirement: Listing and Auditing Share Recipients

The system SHALL allow owners to view the list of users a Skill is currently shared with, including each user's permission level and share timestamp.

#### Scenario: Owner lists share recipients
- **WHEN** the owner GETs `/api/skills/{id}/shares`
- **THEN** the response contains an array of `{userId, userNickname, permission, sharedAt}` entries
- **AND** the list is sorted by `sharedAt` descending

#### Scenario: Non-owner cannot list share recipients
- **WHEN** a non-owner user GETs `/api/skills/{id}/shares`
- **THEN** the system responds with HTTP 403

### Requirement: Data Model Extension for Shared Skills

The system SHALL extend the Skill data model to record shared-with users without breaking backward compatibility.

#### Scenario: Skill.visibility accepts SHARED value
- **WHEN** the owner POSTs a Skill with `visibility: "SHARED"`
- **THEN** the system accepts the value
- **AND** the system requires `sharedWithUserIds` to be non-empty (validated server-side)
- **AND** the Skill is stored with `sharedWithUserIds` set

#### Scenario: Backward compatibility — existing Skills without sharedWithUserIds
- **WHEN** a Skill was created before this feature existed and has `sharedWithUserIds = NULL`
- **THEN** the Skill continues to function with its existing visibility (PUBLIC/PRIVATE/TEAM)
- **AND** the GET /api/skills endpoint filters such Skills exactly as before
- **AND** no migration script is required

#### Scenario: SHARED visibility requires non-empty sharedWithUserIds
- **WHEN** a Skill is created or updated with `visibility: "SHARED"` and empty `sharedWithUserIds`
- **THEN** the system rejects with HTTP 400 and message "SHARED visibility requires at least one user id"

#### Scenario: sharedWithUserIds format
- **WHEN** the system stores `sharedWithUserIds`
- **THEN** the format is a comma-separated string of user ids (e.g. `"u-2,u-3"`)
- **AND** duplicates are deduplicated on save
- **AND** whitespace around ids is trimmed