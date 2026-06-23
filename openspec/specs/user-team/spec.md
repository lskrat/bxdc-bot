# user-team Specification

## Purpose

Provide REST API endpoints for managing user teams, allowing users to create, list, update, and delete teams. Each team can contain multiple member user IDs.

## Requirements

### Requirement: User Team Management API

The system SHALL provide REST API endpoints for managing user teams.

#### Scenario: Create a new team
- **WHEN** user sends POST request to `/api/user-teams` with `X-User-Id` header and JSON body containing `teamName`
- **THEN** system creates a new team record with `creatorId` set to the value of `X-User-Id` header
- **AND** system returns the created team object with generated `id`

#### Scenario: List user's teams with pagination
- **WHEN** user sends GET request to `/api/user-teams` with `X-User-Id` header
- **THEN** system returns paginated list of teams where `creatorId` matches the `X-User-Id` header
- **AND** system excludes teams where `isDeleted` equals 1
- **AND** results are ordered by `createdAt` descending

#### Scenario: Get a single team by ID
- **WHEN** user sends GET request to `/api/user-teams/{id}`
- **THEN** system returns the team if found and `isDeleted` equals 0
- **AND** system returns 404 if team not found or `isDeleted` equals 1

#### Scenario: Update a team
- **WHEN** user sends PUT request to `/api/user-teams/{id}` with `X-User-Id` header and JSON body
- **THEN** system updates the team with provided `teamName` and/or `members`
- **AND** system sets `updaterId` to the `X-User-Id` header value
- **AND** system sets `updatedAt` to current timestamp

#### Scenario: Delete a team (logical deletion)
- **WHEN** user sends DELETE request to `/api/user-teams/{id}` with `X-User-Id` header
- **THEN** system sets `isDeleted` to 1
- **AND** system sets `updatedAt` to current timestamp
- **AND** system does NOT physically delete the record from database

### Requirement: User Team Data Model

The system SHALL store user team data with the following structure:

| Field | Type | Description |
|-------|------|-------------|
| id | Long (auto-increment) | Primary key |
| teamName | String | Team name (required) |
| members | String | Comma-separated user IDs |
| creatorId | String | User ID who created the team |
| createdAt | DateTime | Creation timestamp |
| updaterId | String | User ID who last updated |
| updatedAt | DateTime | Last update timestamp |
| isDeleted | Integer | 0=not deleted, 1=deleted |

Database table: `user_team`

### Requirement: API Request/Response Format

#### Create Team Request
```json
POST /api/user-teams
Header: X-User-Id: <user_id>
{
  "teamName": "string",
  "members": "userId1,userId2,..."
}
```

#### Create Team Response
```json
{
  "id": 1,
  "teamName": "string",
  "members": "string",
  "creatorId": "string",
  "createdAt": "2026-06-22T10:00:00",
  "updaterId": null,
  "updatedAt": null,
  "isDeleted": 0
}
```

#### List Teams Response
```json
{
  "records": [...],
  "total": 100,
  "size": 20,
  "current": 1,
  "pages": 5
}
```

#### Update Team Request
```json
PUT /api/user-teams/{id}
Header: X-User-Id: <user_id>
{
  "teamName": "string",
  "members": "userId1,userId2,userId3"
}
```

#### Delete Team Response
```json
{
  "message": "团队删除成功"
}
```

### Requirement: Error Responses

- **401**: Missing or empty `X-User-Id` header
- **400**: Invalid request body (e.g., empty `teamName`)
- **404**: Team not found
