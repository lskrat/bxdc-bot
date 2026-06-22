# User Team Feature Design

## Architecture Overview

The User Team feature follows a standard Spring Boot layered architecture:

```
Controller Layer → Service Layer → Repository Layer → Database
```

## Data Model

### UserTeam Entity

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| id | Long | Primary key (auto-increment) | Required, unique |
| teamName | String | Team name | Required, non-empty |
| members | String | Comma-separated user IDs | Optional |
| creatorId | String | User ID of creator | Required |
| createdAt | DateTime | Creation timestamp | Required |
| updaterId | String | User ID of last updater | Optional |
| updatedAt | DateTime | Last update timestamp | Optional |
| isDeleted | Integer | Soft delete flag | Default: 0 |

### Database Table

```sql
CREATE TABLE user_team (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    team_name VARCHAR(255) NOT NULL,
    members TEXT,
    creator_id VARCHAR(64) NOT NULL,
    created_at DATETIME NOT NULL,
    updater_id VARCHAR(64),
    updated_at DATETIME,
    is_deleted INT DEFAULT 0,
    INDEX idx_creator_id (creator_id),
    INDEX idx_is_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## API Design

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/user-teams` | Create a new team |
| GET | `/api/user-teams` | List teams (paginated) |
| GET | `/api/user-teams/{id}` | Get team by ID |
| PUT | `/api/user-teams/{id}` | Update team |
| DELETE | `/api/user-teams/{id}` | Delete team (soft) |

### Request Headers

All endpoints require the `X-User-Id` header for authentication and user identification.

### Request/Response Examples

#### POST /api/user-teams

**Request:**
```json
POST /api/user-teams
Headers:
  X-User-Id: 123456
  Content-Type: application/json

{
  "teamName": "Engineering Team",
  "members": "100001,100002,100003"
}
```

**Response:**
```json
{
  "id": 1,
  "teamName": "Engineering Team",
  "members": "100001,100002,100003",
  "creatorId": "123456",
  "createdAt": "2026-06-22T10:00:00",
  "updaterId": null,
  "updatedAt": null,
  "isDeleted": 0
}
```

#### GET /api/user-teams

**Request:**
```
GET /api/user-teams?page=1&size=20
Headers:
  X-User-Id: 123456
```

**Response:**
```json
{
  "records": [...],
  "total": 100,
  "size": 20,
  "current": 1,
  "pages": 5
}
```

#### PUT /api/user-teams/{id}

**Request:**
```json
PUT /api/user-teams/1
Headers:
  X-User-Id: 123456
  Content-Type: application/json

{
  "teamName": "Engineering Team Updated",
  "members": "100001,100002"
}
```

**Response:**
```json
{
  "id": 1,
  "teamName": "Engineering Team Updated",
  "members": "100001,100002",
  "creatorId": "123456",
  "createdAt": "2026-06-22T10:00:00",
  "updaterId": "123456",
  "updatedAt": "2026-06-22T11:00:00",
  "isDeleted": 0
}
```

#### DELETE /api/user-teams/{id}

**Request:**
```
DELETE /api/user-teams/1
Headers:
  X-User-Id: 123456
```

**Response:**
```json
{
  "message": "团队删除成功"
}
```

## Security

### Access Control
- Users can only view and manage teams they created
- `creatorId` is automatically set from `X-User-Id` header
- Query filters automatically include `creatorId` matching and `isDeleted = 0`

### Error Handling
- 401: Missing or empty `X-User-Id` header
- 400: Invalid request body
- 404: Team not found or already deleted

## Project Structure

```
backend/skill-gateway/
├── src/main/java/com/lobsterai/skillgateway/
│   ├── controller/
│   │   └── UserTeamController.java    # REST API endpoints
│   ├── service/
│   │   └── UserTeamService.java       # Business logic
│   ├── mapper/
│   │   └── UserTeamMapper.java        # Data access
│   └── entity/
│       └── UserTeam.java              # Entity class
└── src/main/resources/
    └── schema-mysql.sql               # Database schema
```

## Implementation Notes

1. Use MyBatis Plus for database operations
2. Implement soft delete using `isDeleted` field
3. Use pagination for team listing
4. Validate all inputs
5. Follow existing project coding conventions
