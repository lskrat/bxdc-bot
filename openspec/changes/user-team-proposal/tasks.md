# User Team Feature Implementation Tasks

## Prerequisites

- [ ] Set up development environment
- [ ] Ensure database connection is working

## Implementation Tasks

### 1. Create Entity Class

- [ ] Create `UserTeam.java` entity class in `entity/` directory
- [ ] Define all fields with proper types
- [ ] Add MyBatis Plus annotations
- [ ] Set table name to `user_team`

### 2. Create Mapper Interface

- [ ] Create `UserTeamMapper.java` in `mapper/` directory
- [ ] Extend `BaseMapper<UserTeam>`
- [ ] Implement custom methods:
  - `selectByCreatorIdPaged()` - paginated query by creator
  - `selectByIdAndNotDeleted()` - get by ID excluding deleted

### 3. Create Service Class

- [ ] Create `UserTeamService.java` in `service/` directory
- [ ] Implement `createUserTeam()` - create new team
- [ ] Implement `updateUserTeam()` - update existing team
- [ ] Implement `deleteUserTeam()` - soft delete team
- [ ] Implement `getUserTeamById()` - get team by ID
- [ ] Implement `getUserTeamsByCreatorId()` - paginated list

### 4. Create Controller

- [ ] Create `UserTeamController.java` in `controller/` directory
- [ ] Implement POST `/api/user-teams` - create team
- [ ] Implement GET `/api/user-teams` - list teams
- [ ] Implement GET `/api/user-teams/{id}` - get team
- [ ] Implement PUT `/api/user-teams/{id}` - update team
- [ ] Implement DELETE `/api/user-teams/{id}` - delete team
- [ ] Add `X-User-Id` header validation

### 5. Database Schema

- [ ] Add `user_team` table definition to `schema-mysql.sql`
- [ ] Include proper indexes on `creator_id` and `is_deleted`

### 6. Testing

- [ ] Test all API endpoints
- [ ] Verify user isolation (cannot access others' teams)
- [ ] Verify soft delete behavior
- [ ] Verify pagination works correctly

### 7. Documentation

- [ ] Update API documentation
- [ ] Create OpenSpec delta spec

## Verification Tasks

- [ ] All tests pass
- [ ] Code follows project conventions
- [ ] No compilation errors
- [ ] API responses are correct

## Post-Implementation

- [ ] Sync delta spec to main specs
- [ ] Archive the change
