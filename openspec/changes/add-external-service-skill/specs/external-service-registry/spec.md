# external-service-registry Specification

## Purpose
TBD - created by archiving change add-external-service-skill. Update Purpose after archive.
## ADDED Requirements
### Requirement: external_service table structure

The system SHALL persist external service access information in an `external_service` table with the following columns:

| Column | Type | Required | Description |
|---|---|---|---|
| `id` | `BIGINT AUTO_INCREMENT PRIMARY KEY` | yes | Surrogate primary key |
| `name` | `VARCHAR(64) UNIQUE NOT NULL` | yes | Service reference name; referenced by `skills.configuration.serviceName` |
| `endpoint_url` | `VARCHAR(1024) NOT NULL` | yes | Full URL; supports `{external_param_name}` placeholders for `param_location=path` substitution |
| `http_method` | `VARCHAR(8) NOT NULL DEFAULT 'POST'` | yes | `GET` / `POST` / `PUT` / `DELETE` / `PATCH` |
| `auth_kind` | `VARCHAR(16) NOT NULL DEFAULT 'none'` | yes | `none` / `apiKey` / `bearer` / `dynamicToken` |
| `auth_config` | `JSON NULL` | conditional | Authentication configuration (schema depends on `auth_kind`); see Requirement: auth_config JSON schemas |
| `response_format` | `VARCHAR(16) NOT NULL DEFAULT 'json'` | yes | `json` / `text` / `binary-base64` |
| `retry_max` | `INT NOT NULL DEFAULT 0` | yes | Number of retries on failure (excluding first attempt); 0=no retry, max=5; backoff base fixed at 500ms exponential |
| `enabled` | `TINYINT(1) NOT NULL DEFAULT 1` | yes | Whether the service is enabled; disabled services cannot be invoked |
| `display_order` | `INT NOT NULL DEFAULT 0` | yes | Admin list display order; smaller value first; ties broken by `id ASC` |
| `description` | `TEXT NULL` | no | Admin note describing the service |
| `created_at` | `DATETIME DEFAULT CURRENT_TIMESTAMP` | yes | Row creation timestamp |
| `updated_at` | `DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | yes | Row update timestamp |

Indexes: `idx_es_enabled_sort (enabled, display_order)`.

#### Scenario: Create external_service row

- **WHEN** admin inserts a row with `name = "weather-openweathermap"`, `endpoint_url = "https://api.openweathermap.org/data/2.5/weather"`, `http_method = "GET"`, `auth_kind = "apiKey"`, `auth_config = {"headerName": "appid", "valueStatic": "<encrypted>"}`, `response_format = "json"`, `retry_max = 2`, `enabled = 1`, `display_order = 10`
- **THEN** the system persists the row successfully
- **AND** the `id` is auto-assigned and returned

#### Scenario: Reject duplicate name

- **WHEN** admin inserts a row with `name = "weather-openweathermap"` but a row with this name already exists
- **THEN** the system rejects the insert with constraint violation on `name` UNIQUE

#### Scenario: Reject invalid http_method

- **WHEN** admin inserts a row with `http_method = "OPTIONS"` (not in allowed list)
- **THEN** the system rejects the insert with validation error

#### Scenario: Reject invalid auth_kind

- **WHEN** admin inserts a row with `auth_kind = "oauth2"` (not in allowed list)
- **THEN** the system rejects the insert with validation error

### Requirement: auth_config JSON schemas per auth_kind

The `auth_config` JSON column SHALL conform to one of the following schemas based on `auth_kind`:

- `auth_kind = "none"`: `auth_config` SHALL be `{}` or `NULL`; no authentication headers injected
- `auth_kind = "apiKey"`: `auth_config` SHALL be `{"headerName": "<string>", "valueStatic": "<encrypted string>"}`; the Gateway injects header `{headerName}: {decrypted valueStatic}` (or, if `headerName` is empty, appends `?{headerName}={valueStatic}` to the query string)
- `auth_kind = "bearer"`: `auth_config` SHALL be `{"valueStatic": "<encrypted string>"}`; the Gateway injects `Authorization: Bearer {decrypted valueStatic}`
- `auth_kind = "dynamicToken"`: `auth_config` SHALL be `{"headerName": "Authorization", "tokenEndpoint": "<url>", "tokenRequestBody": {...}, "tokenPath": "<jsonpath>", "cacheSeconds": 300}`; the Gateway calls `tokenEndpoint` (POST) with `tokenRequestBody`, extracts the token via `tokenPath` (JSONPath), caches for `cacheSeconds` seconds, then injects as bearer (or per `headerName` if specified)

The `valueStatic` field SHALL be encrypted at rest via `AesCipher.encrypt()`. The admin INSERT path MUST enforce encryption (admin UI encrypts; SQL INSERT path may pass plaintext but the DB layer re-encrypts before storage).

#### Scenario: apiKey auth_config validated

- **WHEN** admin inserts a row with `auth_kind = "apiKey"` and `auth_config = {"headerName": "X-API-Key", "valueStatic": "abc123"}` (plaintext)
- **THEN** the system encrypts `valueStatic` to `<ciphertext>` before storage
- **AND** on read, the executor decrypts it back to `abc123` to inject the header

#### Scenario: bearer auth_config validated

- **WHEN** admin inserts a row with `auth_kind = "bearer"` and `auth_config = {"valueStatic": "token-xyz"}` (plaintext)
- **THEN** the system encrypts `valueStatic` before storage

#### Scenario: dynamicToken auth_config validated

- **WHEN** admin inserts a row with `auth_kind = "dynamicToken"` and `auth_config = {"tokenEndpoint": "https://auth.example.com/token", "tokenRequestBody": {"client_id":"x"}, "tokenPath": "data.token", "cacheSeconds": 600}`
- **THEN** the system accepts the row (no `valueStatic` to encrypt)
- **AND** the Gateway's `DynamicTokenCache` uses this configuration

#### Scenario: Invalid auth_config for auth_kind

- **WHEN** admin inserts a row with `auth_kind = "apiKey"` and `auth_config = {}` (missing required `headerName` / `valueStatic`)
- **THEN** the system rejects the insert with validation error "auth_config missing required keys: headerName, valueStatic"

### Requirement: external_service_input table structure

The system SHALL persist external service input contracts in an `external_service_input` table with the following columns:

| Column | Type | Required | Description |
|---|---|---|---|
| `id` | `BIGINT AUTO_INCREMENT PRIMARY KEY` | yes | Surrogate primary key |
| `service_id` | `BIGINT NOT NULL` (FK → `external_service.id`) | yes | Foreign key to the parent service |
| `external_param_name` | `VARCHAR(64) NOT NULL` | yes | The third-party API parameter name; equals the LLM tool schema property key and the outbound query/body/header key (no `mapsTo` indirection) |
| `display_name` | `VARCHAR(64) NULL` | no | Chinese display name shown as the textarea label on the Skill creation page (admin-configured, business-user cannot edit) |
| `is_required` | `TINYINT(1) NOT NULL DEFAULT 0` | yes | Whether the third-party API requires this parameter; controls the LLM tool schema's `required` list and Gateway execution-time validation |
| `is_raw_transmission` | `TINYINT(1) NOT NULL DEFAULT 0` | yes | `1` = raw transmission (no URL encoding / JSON serialization / escaping); `0` = LLM-processed string per `param_location` standard encoding |
| `param_location` | `VARCHAR(16) NOT NULL DEFAULT 'body'` | yes | `query` / `body` / `path` / `header` |
| `body_content_type` | `VARCHAR(16) NULL` | conditional | When `param_location='body'`: `json` / `form` / `text` / `binary`; otherwise NULL |
| `param_type` | `VARCHAR(16) NOT NULL DEFAULT 'string'` | yes | `string` / `number` / `boolean` (LLM tool schema property type; does not affect actual transmission) |
| `is_sensitive` | `TINYINT(1) NOT NULL DEFAULT 0` | yes | Whether to mask the value in `api_call_log` audit (replace with `***MASKED***`) |
| `description` | `TEXT NULL` | no | Detailed description; shown as textarea helper text on Skill creation page AND as the LLM tool schema property's `description` |
| `display_order` | `INT NOT NULL DEFAULT 0` | yes | Form rendering order AND Gateway outbound traversal order; smaller value first; ties broken by `id ASC` |

Constraints: `UNIQUE KEY uk_service_external_param (service_id, external_param_name)`. Indexes: `idx_esi_service_sort (service_id, display_order)`.

#### Scenario: Create sub-table row

- **WHEN** admin inserts a row with `service_id = 1`, `external_param_name = "q"`, `display_name = "城市名"`, `is_required = 1`, `is_raw_transmission = 0`, `param_location = "query"`, `param_type = "string"`, `is_sensitive = 0`, `display_order = 0`
- **THEN** the system persists the row successfully

#### Scenario: Reject duplicate external_param_name per service

- **WHEN** admin inserts a row with `service_id = 1` and `external_param_name = "q"` but a row with the same `(service_id, external_param_name)` already exists
- **THEN** the system rejects the insert with constraint violation on `uk_service_external_param`

#### Scenario: body_content_type required when param_location=body

- **WHEN** admin inserts a row with `param_location = "body"` and `body_content_type = NULL`
- **THEN** the system rejects the insert with validation error "body_content_type is required when param_location=body"

### Requirement: Admin CRUD for external_service

The system SHALL provide admin REST endpoints under `/api/external-service`:

- `GET /api/external-service` — list all services, ordered by `display_order ASC, id ASC`; admin-only
- `GET /api/external-service/{id}` — get one service (with sub-table rows) by `id`; admin-only
- `GET /api/external-service/by-name/{name}` — get one service by `name`; admin-only
- `POST /api/external-service` — create one service (with sub-table rows in same request); admin-only
- `PUT /api/external-service/{id}` — update one service (full replace of sub-table rows in same request); admin-only
- `DELETE /api/external-service/{id}` — delete one service (CASCADE deletes sub-table rows); admin-only
- `POST /api/external-service/{id}/invalidate-cache` — invalidate the in-memory cache for this service; admin-only
- `POST /api/external-service/invalidate-cache` — invalidate all cached services; admin-only

The `valueStatic` field in `auth_config` SHALL be returned in `ExternalServiceView` as masked (e.g., `***MASKED-1234***` showing only last 4 chars) for non-admin roles; admins see the decrypted value.

#### Scenario: List services as admin

- **WHEN** admin calls `GET /api/external-service`
- **THEN** the system returns all services ordered by `display_order ASC, id ASC` with full `auth_config.valueStatic` (decrypted)

#### Scenario: List services as non-admin

- **WHEN** non-admin user calls `GET /api/external-service`
- **THEN** the system returns 403 Forbidden

#### Scenario: Get service with sub-table rows

- **WHEN** admin calls `GET /api/external-service/1` for a service with 3 sub-table rows
- **THEN** the system returns the service object with a `inputs` array containing 3 ordered rows

#### Scenario: Create service with sub-table rows

- **WHEN** admin calls `POST /api/external-service` with body containing the main service fields and an `inputs` array of 3 sub-table rows
- **THEN** the system creates the main row and 3 sub-table rows in a single transaction
- **AND** the `auth_config.valueStatic` is encrypted before storage
- **AND** the response returns the created service with its assigned `id`

#### Scenario: Update service replaces sub-table

- **WHEN** admin calls `PUT /api/external-service/1` with body containing updated main fields and a new `inputs` array of 4 sub-table rows (different from the existing 3)
- **THEN** the system updates the main row, deletes the existing 3 sub-table rows, and creates 4 new sub-table rows in a single transaction

#### Scenario: Delete service cascades

- **WHEN** admin calls `DELETE /api/external-service/1` for a service with 3 sub-table rows
- **THEN** the system deletes the main row and all 3 sub-table rows in a single transaction
- **AND** any `kind=external` skill referencing this service SHALL fail at execution with "External service not found: {name}"

#### Scenario: Invalidate cache for one service

- **WHEN** admin calls `POST /api/external-service/1/invalidate-cache`
- **THEN** the `ExternalServiceRegistry` removes the cached entries for service 1
- **AND** the next execution of any skill referencing this service re-fetches from DB

### Requirement: Public read endpoint for sub-table

The system SHALL provide a public read endpoint for the sub-table to support the Skill creation page's read-only preview:

- `GET /api/external-service/{name}/inputs` — list sub-table rows for the service identified by `name`; returns 404 if service not found; rows ordered by `display_order ASC, id ASC`; **does NOT require admin role** (any authenticated user can read)

The response payload is the sub-table rows only (no main table fields, no `auth_config`).

#### Scenario: Read inputs as authenticated user

- **WHEN** an authenticated business user calls `GET /api/external-service/weather-openweathermap/inputs`
- **THEN** the system returns 3 sub-table rows (q, units, lang) with `display_name`, `is_required`, `description`, `display_order` (NOT `is_sensitive` — keep internal)
- **AND** the rows are ordered by `display_order ASC, id ASC`

#### Scenario: Read inputs for non-existent service

- **WHEN** an authenticated business user calls `GET /api/external-service/nonexistent/inputs`
- **THEN** the system returns 404 Not Found

#### Scenario: Read inputs as unauthenticated user

- **WHEN** an unauthenticated request calls `GET /api/external-service/weather-openweathermap/inputs`
- **THEN** the system returns 401 Unauthorized

### Requirement: List endpoint filters disabled services for skill loader

The system SHALL provide a method `ExternalServiceRegistry.listEnabled()` that returns only services with `enabled=1`, used by `SystemSkillController.listExecutionTypes()` to populate the `serviceName` dropdown options on the Skill creation page.

#### Scenario: Skill creation page dropdown

- **WHEN** business user opens the Skill creation page
- **THEN** the `serviceName` dropdown shows only services with `enabled=1`
- **AND** disabled services are NOT shown in the dropdown (even if the row exists)

### Requirement: SchemaMigrationRunner auto-creates new tables

The `SchemaMigrationRunner` SHALL include idempotent `CREATE TABLE IF NOT EXISTS` DDL for both `external_service` and `external_service_input` tables. On Gateway startup, the runner executes these DDLs, so existing deployments get the new tables automatically without manual SQL execution.

#### Scenario: Cold start creates new tables

- **WHEN** the Gateway starts on a deployment that does not have `external_service` / `external_service_input` tables
- **THEN** the `SchemaMigrationRunner` creates both tables via `CREATE TABLE IF NOT EXISTS`
- **AND** the Gateway proceeds to start normally

#### Scenario: Existing tables left untouched

- **WHEN** the Gateway starts on a deployment that already has `external_service` / `external_service_input` tables
- **THEN** the `CREATE TABLE IF NOT EXISTS` is a no-op (existing tables preserved)

### Requirement: FK validation when creating external skill

The Gateway's `SkillService.createOrUpdate()` MUST, when processing a `kind=external` skill, call `ExternalServiceRegistry.assertExists(serviceName)` to verify the referenced service exists and is enabled. If the assertion fails, the system rejects the create/update with 400 and does NOT persist the skill.

#### Scenario: FK validation passes

- **WHEN** admin creates a `kind=external` skill with `serviceName = "weather-openweathermap"` (which exists with `enabled=1`)
- **THEN** the system persists the skill successfully

#### Scenario: FK validation fails

- **WHEN** admin creates a `kind=external` skill with `serviceName = "nonexistent"`
- **THEN** the system rejects the create with 400 "External service not found: nonexistent"

#### Scenario: FK validation rejects disabled service

- **WHEN** admin creates a `kind=external` skill with `serviceName = "weather-openweathermap"` (which exists but `enabled=0`)
- **THEN** the system rejects the create with 400 "External service is disabled: weather-openweathermap"

### Requirement: Schema rejects deprecated kind=external fields

The Gateway's `JsonSchemaValidator` MUST reject any `kind=external` skill create/update request that contains the deprecated fields `inputs` (array), `mapsTo`, or `operation` in `configuration`. The validation error message SHALL be specific to the deprecated field.

#### Scenario: Reject inputs array

- **WHEN** admin creates a `kind=external` skill with `configuration.inputs = [...]`
- **THEN** the system rejects with 400 "Field 'inputs' is not allowed for kind=external"

#### Scenario: Reject mapsTo

- **WHEN** admin creates a `kind=external` skill with `configuration.mapsTo = "q"`
- **THEN** the system rejects with 400 "Field 'mapsTo' is not allowed for kind=external"

#### Scenario: Reject operation

- **WHEN** admin creates a `kind=external` skill with `configuration.operation = "query-weather"`
- **THEN** the system rejects with 400 "Field 'operation' is not allowed for kind=external"

### Requirement: Admin-only write access to external_service tables

The `ExternalServiceController` write endpoints (`POST` / `PUT` / `DELETE`) SHALL require admin role. Non-admin authenticated users SHALL receive 403 Forbidden. The read endpoints (`GET /api/external-service` and `GET /api/external-service/{id}`) also require admin role, but `GET /api/external-service/{name}/inputs` is open to all authenticated users (per Requirement: Public read endpoint for sub-table).

#### Scenario: Non-admin write attempt

- **WHEN** a non-admin authenticated user calls `POST /api/external-service` with a new service body
- **THEN** the system returns 403 Forbidden

#### Scenario: Admin write succeeds

- **WHEN** an admin calls `POST /api/external-service` with a new service body
- **THEN** the system returns 201 Created with the new service object

### Requirement: Sub-table migration is additive only

The system SHALL NOT require destructive migrations to existing `external_service` / `external_service_input` tables. If a future change requires schema modifications, the change SHALL use additive migrations (new columns with defaults, new indexes) and SHALL be applied via `SchemaMigrationRunner`'s `ensureColumn` / `ensureIndex` pattern (consistent with AGENTS.md §5.3).

#### Scenario: Future additive migration

- **WHEN** a future change adds a new column `timeout_ms INT` to `external_service`
- **THEN** the migration uses `ensureColumn(conn, "external_service", "timeout_ms", existingColumns, "ALTER TABLE external_service ADD COLUMN timeout_ms INT DEFAULT 30000")`
- **AND** the migration is idempotent (running twice does not fail)
