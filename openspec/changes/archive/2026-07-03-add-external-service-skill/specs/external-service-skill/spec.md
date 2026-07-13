# external-service-skill Specification

## Purpose
TBD - created by archiving change add-external-service-skill. Update Purpose after archive.
## ADDED Requirements
### Requirement: External CONFIG Skill model

The system SHALL support a CONFIG-mode extended skill whose canonical configuration kind is `external`, and whose stored `configuration` object SHALL contain only the normative fields `serviceName` (reference to a `external_service.name` row where `enabled=1`) and `interfaceDescription` (free-form text shown to the LLM). The system SHALL reject creation or update when `kind=external` is used with any of the deprecated fields `inputs` (array) / `mapsTo` / `operation`, when `serviceName` is missing, or when the referenced `external_service` row does not exist or is disabled.

#### Scenario: Persist external skill with serviceName and interfaceDescription

- **WHEN** a user creates an extended skill with `executionMode` CONFIG and `configuration` containing `"kind": "external"`, a non-empty `serviceName` that references an `enabled=1` row in `external_service`, and an optional `interfaceDescription` string
- **THEN** the system persists the skill successfully through SkillGateway
- **AND** `configuration` is stored as `{"kind":"external","serviceName":"...","interfaceDescription":"..."}` (no other fields)

#### Scenario: Reject deprecated inputs array

- **WHEN** a create or update request uses `kind=external` with `configuration.inputs` (array) present
- **THEN** the system rejects the request with validation error "Field 'inputs' is not allowed for kind=external"

#### Scenario: Reject deprecated mapsTo field

- **WHEN** a create or update request uses `kind=external` with `configuration.mapsTo` present at any nesting level
- **THEN** the system rejects the request with validation error "Field 'mapsTo' is not allowed for kind=external"

#### Scenario: Reject deprecated operation field

- **WHEN** a create or update request uses `kind=external` with `configuration.operation` present
- **THEN** the system rejects the request with validation error "Field 'operation' is not allowed for kind=external"

#### Scenario: Reject missing serviceName

- **WHEN** a create or update request uses `kind=external` with missing or whitespace-only `serviceName`
- **THEN** the system rejects the request with validation error "serviceName is required for kind=external"

#### Scenario: Reject non-existent serviceName

- **WHEN** a create or update request uses `kind=external` with `serviceName` that does not exist in `external_service` table
- **THEN** the system rejects the request with validation error "External service not found: {serviceName}"

#### Scenario: Reject disabled serviceName

- **WHEN** a create or update request uses `kind=external` with `serviceName` that references a row in `external_service` with `enabled=0`
- **THEN** the system rejects the request with validation error "External service is disabled: {serviceName}"

### Requirement: Sub-table is runtime single source of truth

The Gateway SHALL NOT copy any `external_service_input` row data into `skills.configuration` at create or update time. The skill's runtime behavior MUST be determined solely by querying the `external_service_input` rows that reference the skill's `serviceName` at execution time. When an admin modifies the `external_service_input` table (adds a row / changes `is_required` / changes `is_raw_transmission` / changes `param_location` / changes `display_name`), all `kind=external` skills referencing that `serviceName` SHALL pick up the change on the next execution (no skill re-save required, no redeploy required).

#### Scenario: Admin adds new input row

- **WHEN** admin inserts a new row into `external_service_input` with `service_id=X` and `external_param_name=q2` and `is_required=1`
- **THEN** all `kind=external` skills with `serviceName` referencing row X (no skill re-save) SHALL fail at execution with "Missing required field: q2" if the LLM does not provide `q2` in `parameters`
- **AND** the LLM tool schema (next time the skill is loaded) SHALL include `q2` as a required property

#### Scenario: Admin changes is_raw_transmission

- **WHEN** admin updates `external_service_input` row for `external_param_name=q` to set `is_raw_transmission=1` (was 0)
- **THEN** on the next execution of any skill referencing that service, the Gateway SHALL pass `q` value to the third-party without URL encoding / JSON serialization / escaping

#### Scenario: Skill configuration has no input copies

- **WHEN** a `kind=external` skill is persisted with `configuration = {"kind":"external","serviceName":"X","interfaceDescription":"Y"}`
- **THEN** the `configuration` JSON in the database contains exactly those 3 keys and no input-related fields
- **AND** at execution time the Gateway fetches the input contract from `external_service_input WHERE service_id = X.id`

### Requirement: External skill runtime exposure to LLM

The Gateway's `Skill.computeSchemaPropertiesInternal()` SHALL, when processing a `kind=external` skill, derive the `schemaProperties` Map by querying `ExternalServiceRegistry.listInputs(svc.getId())`: each sub-table row contributes one property whose name is `external_param_name`, whose type is `param_type` (string / number / boolean), and whose `is_required=1` rows become `required` in the schema. The `schemaProperties` Map is then persisted to `skills.schema_properties` and returned to agent-core via the existing `GET /api/skills` endpoint. agent-core's `buildSkillZodSchema()` consumes this Map generically — it MUST NOT contain any `if (config.kind === 'external')` branch and MUST use the same outer-`payload` Zod wrapper as `api` / `ssh` / `template` / `python`.

#### Scenario: Gateway derives schemaProperties from sub-table rows

- **WHEN** a `kind=external` skill's `serviceName` references an `external_service` with 3 sub-table rows: `q` (string, required), `units` (string, optional), `lang` (string, optional)
- **THEN** the Gateway's `Skill.computeSchemaPropertiesInternal()` returns the Map:
  ```
  {
    "q":     {"type": "string", "description": "<description of q>"},
    "units": {"type": "string", "description": "<description of units>"},
    "lang":  {"type": "string", "description": "<description of lang>"}
  }
  ```
- **AND** `required` array is `["q"]` (only the `is_required=1` rows)
- **AND** the Map is persisted to `skills.schema_properties` (with required list embedded)

#### Scenario: agent-core Zod schema is generic over kind

- **WHEN** agent-core receives a skill with `schemaProperties = {q, units, lang}` (regardless of original `kind`)
- **THEN** agent-core's Zod schema for this tool's inner payload is `z.object({ q: z.string(), units: z.string().optional(), lang: z.string().optional() })`
- **AND** the LLM is informed that `q` is mandatory and `units` / `lang` are optional
- **AND** agent-core has NO awareness of whether this skill is `external` / `api` / `python` — it consumes `schemaProperties` generically

#### Scenario: agent-core has no external-specific branch

- **WHEN** the LLM invokes a `kind=external` tool
- **THEN** agent-core MUST NOT contain any `if (config.kind === 'external')` branch in the tool invocation path
- **AND** the call MUST go through the same `POST /api/skills/execute` path as `api` / `ssh` / `template` / `python` extension skills
- **AND** agent-core's `java-skills.ts` MUST NOT be modified by this change

#### Scenario: payload key is verbatim external_param_name

- **WHEN** the LLM fills the tool payload with `{q: "北京", units: "metric", lang: "zh"}`
- **THEN** the agent-core POST to Gateway `/api/skills/execute` includes payload with the **exact** keys `q` / `units` / `lang` (no transformation)
- **AND** the Gateway's `ExternalServiceSkillExecutor` reads the payload keys directly against the sub-table `external_param_name` values (see Requirement: Outbound parameter names are character-exact with external_param_name)

#### Scenario: schemaProperties re-derives on cache invalidation

- **WHEN** admin adds a new sub-table row `q2` (is_required=1) and calls `registry.invalidateService(serviceId)`
- **AND** admin then updates the skill (triggers `computeSchemaPropertiesInternal()` re-run)
- **THEN** the new `schemaProperties` Map includes `q2` with `required` array now `["q", "q2"]`
- **AND** the LLM, on next skill load, sees `q2` as required and MUST provide it

#### Scenario: agent-core files unchanged

- **GIVEN** the change is applied
- **THEN** the following agent-core files SHALL be unmodified (verified via `git diff backend/agent-core/`):
  - `backend/agent-core/src/tools/java-skills.ts`
  - `backend/agent-core/src/agent/agent.ts`
  - `backend/agent-core/src/tools/skill-generator.ts`
  - `backend/agent-core/src/tools/execute-skill.ts`
  - All other agent-core source files

### Requirement: External skill execution by Gateway

The Gateway's `SkillExecutionService.execute()` MUST route `kind=external` skills to a new `executeExternalSkill()` method (in `ExternalServiceSkillExecutor`) that:
1. Resolves the referenced `external_service` row from `configuration.serviceName` (return 400 if disabled or not found)
2. Resolves the `external_service_input` rows for that service (ordered by `display_order ASC, id ASC`)
3. Performs required-field validation: for every sub-table row with `is_required=1`, asserts that `llmParams` contains a value for `external_param_name`; returns 400 with "Missing required field: {external_param_name}" if any is missing
4. Constructs the outbound HTTP request by iterating sub-table rows and applying their `param_location` / `is_raw_transmission` / `body_content_type` rules to the LLM-provided value
5. Injects authentication headers per `external_service.auth_kind` and `auth_config` JSON
6. Executes the HTTP call with `retry_max` exponential backoff (base 500ms, fixed)
7. Returns the response (formatted per `response_format`) to the LLM

#### Scenario: Forward LLM parameters by sub-table rules

- **WHEN** the LLM calls a `kind=external` skill with `parameters = { q: "北京", units: "metric" }` and the referenced service has sub-table row `q` (param_location=query, is_raw_transmission=0) and `units` (param_location=query, is_raw_transmission=0)
- **THEN** the Gateway's outbound URL contains `?q=%E5%8C%97%E4%BA%AC&units=metric`
- **AND** no LLM-side field renaming occurs (the LLM key `q` directly becomes the query key `q`)

#### Scenario: Raw transmission for code field

- **WHEN** the LLM calls a `kind=external` skill with `parameters = { code: "def add(a,b):\n  return a+b" }` and the referenced service has sub-table row `code` (param_location=body, body_content_type=json, is_raw_transmission=1)
- **THEN** the Gateway's outbound request body is `{"code":"def add(a,b):\n  return a+b"}` (the `\n` is a real newline, not the 2-character `\n` escape)
- **AND** Jackson serialization is NOT applied to the `code` value

#### Scenario: Missing required field rejected

- **WHEN** the LLM calls a `kind=external` skill with `parameters = { units: "metric" }` (missing `q`) and the referenced service has sub-table row `q` with `is_required=1`
- **THEN** the Gateway returns 400 with error "Missing required field: q"
- **AND** no outbound HTTP call is made

#### Scenario: Disabled service rejected at execution

- **WHEN** the LLM calls a `kind=external` skill whose `serviceName` references an `external_service` row with `enabled=0`
- **THEN** the Gateway returns 400 with error "External service disabled: {serviceName}"
- **AND** no sub-table query is made

#### Scenario: LLM extra key not in sub-table

- **WHEN** the LLM calls a `kind=external` skill with `parameters = { q: "北京", foo: "bar" }` where the sub-table has row `q` but not `foo`
- **THEN** the Gateway's outbound request does NOT include `foo` (no sub-table row = no outbound)
- **AND** the audit log records `foo` as "LLM 误传" (LLM-provided but no sub-table row) for traceability

### Requirement: Outbound supports query / body / path / header

The Gateway's `executeExternalSkill()` MUST support placing LLM-provided values in the outbound HTTP request at 4 locations based on each sub-table row's `param_location`:

- `query`: URL query parameter (URL-encoded if `is_raw_transmission=0`, raw if `=1`)
- `body`: request body, with format determined by `body_content_type`:
  - `json`: included in a JSON object body, with Jackson serialization skipped if `is_raw_transmission=1`
  - `form`: included in `application/x-www-form-urlencoded` body
  - `text`: the entire body is the value (only one sub-table row may have `body_content_type=text`); `is_raw_transmission=0` applies standard text encoding, `=1` writes the value verbatim
  - `binary`: multipart upload, where the value is a `file:<userFileId>` reference resolved via `FileRefResolver` and `FileToolService`
- `path`: replaces `{external_param_name}` placeholder in `endpoint_url` with the URL-encoded (or raw) value
- `header`: added as a request header with the value as-is (URL encoding does not apply to headers)

#### Scenario: Path placeholder substitution

- **WHEN** `endpoint_url = "https://api.example.com/users/{userId}/posts"` and the sub-table has row `userId` (param_location=path, is_raw_transmission=0)
- **AND** the LLM provides `parameters = { userId: "123" }`
- **THEN** the Gateway's outbound URL is `https://api.example.com/users/123/posts`

#### Scenario: Multipart file upload

- **WHEN** the sub-table has row `file` (param_location=body, body_content_type=binary)
- **AND** the LLM provides `parameters = { file: "file:42" }` (a `user_file.id=42` reference)
- **THEN** the Gateway resolves the user_file via `FileRefResolver`, reads the file via `FileToolService`, and constructs a multipart/form-data body with one part named `file` containing the file content

### Requirement: Authentication via auth_config JSON

The Gateway's `executeExternalSkill()` MUST inject authentication headers per `external_service.auth_kind` and the `auth_config` JSON field:

- `none`: no authentication headers injected
- `apiKey`: inject header `{auth_config.headerName}: {decrypted auth_config.valueStatic}` (or, if `headerName` is empty, append `?{headerName}={valueStatic}` to the query string)
- `bearer`: inject header `Authorization: Bearer {decrypted auth_config.valueStatic}`
- `dynamicToken`: call `auth_config.tokenEndpoint` with `auth_config.tokenRequestBody` (HTTP POST), extract the token via `auth_config.tokenPath` (JSONPath), cache for `auth_config.cacheSeconds` seconds, then inject as bearer (or per `auth_config.headerName` if specified)

The `auth_config.valueStatic` field MUST be encrypted at rest via `AesCipher.encrypt()` (admin INSERT path enforces encryption; the SELECT path uses `AesCipher.decrypt()` to expose plaintext only in the executor and `ExternalServiceView` admin endpoint, with `ExternalServiceView` masking the value by default for non-admin roles).

#### Scenario: API Key authentication

- **WHEN** `external_service.auth_kind = "apiKey"` and `auth_config = {"headerName": "appid", "valueStatic": "<encrypted>"}`
- **THEN** the Gateway's outbound request includes header `appid: <decrypted value>`
- **AND** the decrypted value is NOT logged in `api_call_log` (masked by `ExternalOutboundPayloadMasker` if `is_sensitive=1`)

#### Scenario: Bearer authentication

- **WHEN** `external_service.auth_kind = "bearer"` and `auth_config = {"valueStatic": "<encrypted>"}`
- **THEN** the Gateway's outbound request includes header `Authorization: Bearer <decrypted value>`

#### Scenario: Dynamic Token with caching

- **WHEN** `external_service.auth_kind = "dynamicToken"` and `auth_config = {"tokenEndpoint": "https://auth.example.com/token", "tokenRequestBody": {"client_id":"x","client_secret":"y"}, "tokenPath": "data.token", "cacheSeconds": 300}`
- **THEN** on first request, the Gateway POSTs to `tokenEndpoint` with `tokenRequestBody`, extracts `data.token` from the response, caches it for 300 seconds
- **AND** on subsequent requests within 300 seconds, the Gateway uses the cached token without calling `tokenEndpoint` again
- **AND** the `tokenEndpoint` call is audited with `HttpClientAuditMode.NONE` (not logged in `api_call_log` to avoid pollution)

### Requirement: Retry with exponential backoff

The Gateway's `executeExternalSkill()` MUST retry failed outbound calls up to `retry_max` times (excluding the first attempt). The backoff base is fixed at 500ms with exponential growth: 500ms, 1000ms, 2000ms, 4000ms, 8000ms for attempts 1-5. Total timeout per attempt is system default 30s (not configurable in this change).

#### Scenario: Retry on 5xx error

- **WHEN** `retry_max = 2` and the first outbound call returns HTTP 503
- **THEN** the Gateway waits 500ms, retries (attempt 2)
- **IF** the second attempt also fails, the Gateway waits 1000ms, retries (attempt 3)
- **IF** the third attempt also fails, the Gateway gives up and returns the last error to the LLM

#### Scenario: No retry for non-idempotent operations

- **WHEN** `retry_max = 0` and the outbound call fails
- **THEN** the Gateway does not retry and returns the error immediately
- **AND** admin is advised (via description field) to set `retry_max=0` for non-idempotent operations (e.g., script execution, notification push)

### Requirement: Response format handling

The Gateway's `executeExternalSkill()` MUST format the outbound response per `external_service.response_format`:

- `json`: parse the response body as JSON and return as a structured object to the LLM
- `text`: return the response body as a plain string to the LLM
- `binary-base64`: base64-encode the response body (e.g., file download) and return as a string to the LLM

#### Scenario: JSON response formatting

- **WHEN** the outbound call returns `Content-Type: application/json` and body `{"temp": 25, "humidity": 60}`
- **THEN** the Gateway returns the parsed object `{"temp": 25, "humidity": 60}` to the LLM

#### Scenario: Text response formatting

- **WHEN** the outbound call returns `Content-Type: text/plain` and body `var hq_str_sh600519="贵州茅台,1880.00,..."`
- **THEN** the Gateway returns the raw string `var hq_str_sh600519="贵州茅台,1880.00,..."` to the LLM

### Requirement: Audit log masking by is_sensitive

The Gateway's `ExternalOutboundPayloadMasker` MUST, before writing the LLM parameters to `api_call_log`, replace the value of any `external_service_input` row with `is_sensitive=1` with the string `"***MASKED***"`. LLM-provided keys that are NOT in the sub-table MUST still be included in the audit log (labeled as "LLM-provided but no sub-table row" for traceability).

#### Scenario: Sensitive field masked in audit

- **WHEN** the LLM provides `parameters = { q: "北京", token: "abc123" }` and the sub-table has `q` (is_sensitive=0) and `token` (is_sensitive=1)
- **THEN** the `api_call_log` audit entry shows `q: "北京"` and `token: "***MASKED***"`

#### Scenario: LLM extra key visible in audit

- **WHEN** the LLM provides `parameters = { q: "北京", foo: "bar" }` and the sub-table has only `q` (no `foo` row)
- **THEN** the `api_call_log` audit entry shows `q: "北京"` and `foo: "bar"` (with note that `foo` was not transmitted to the third party)

### Requirement: Link trace header propagation

The Gateway's `executeExternalSkill()` MUST propagate the inbound trace headers (`X-Trace-Id`, `X-Request-Id`, `X-User-Id`, `X-Session-Id`) to the outbound request, and add `X-Parent-Span-Id` referencing the gateway's span. The reuse of `GatewayHttpClientAuditInterceptor` is sufficient; no new interceptor is required.

#### Scenario: Trace header propagation

- **WHEN** the inbound request has `X-Trace-Id: trace-xyz` and `X-User-Id: 12345`
- **THEN** the outbound request includes `X-Trace-Id: trace-xyz` and `X-User-Id: 12345`
- **AND** the outbound request includes `X-Parent-Span-Id: <gateway-span-id>`

### Requirement: Sub-table caching with 5-minute TTL

The Gateway's `ExternalServiceRegistry` MUST cache `external_service` and `external_service_input` rows in memory (`ConcurrentHashMap`) for 5 minutes. On startup, the cache is loaded eagerly. Admin-initiated table modifications SHOULD call `registry.invalidateAll()` or `registry.invalidateService(id)` for immediate effect; otherwise the change takes effect within 5 minutes.

#### Scenario: Cache loaded at startup

- **WHEN** the Gateway starts and the DB has 3 services with 10 sub-table rows total
- **THEN** the cache is populated with all 3 services and 10 sub-table rows before the first request is served

#### Scenario: Admin invalidates cache after modification

- **WHEN** admin updates a sub-table row and calls `registry.invalidateService(serviceId)`
- **THEN** the next execution of any skill referencing that service picks up the change (no 5-minute delay)

#### Scenario: Cache TTL fallback

- **WHEN** admin updates a sub-table row but does NOT call `invalidateService` (e.g., direct SQL)
- **THEN** within 5 minutes (cache TTL), the change takes effect automatically on the next execution

### Requirement: Empty sub-table still allows outbound execution

The Gateway's `executeExternalSkill()` MUST handle the case where the referenced `external_service` row has zero sub-table rows (empty `external_service_input` list for that `serviceId`). In this case:
1. Required-field validation loop MUST execute zero iterations and pass
2. Outbound map assembly (`query` / `body` / `header`) MUST initialize to empty maps
3. Authentication injection MUST still execute (based on the main table's `auth_kind` / `auth_config`)
4. The HTTP call MUST still execute via `RetryableHttpClient` — only the URL + auth headers + (possibly empty) body are sent to the third party
5. The response MUST be returned to the LLM through `ExternalResponseFormatter`

#### Scenario: Empty sub-table zero-iteration validation

- **WHEN** the LLM calls a `kind=external` skill with `parameters = { random_key: "value" }` and the referenced service has zero sub-table rows
- **THEN** the required-field validation loop iterates 0 times
- **AND** no `Missing required field` error is raised
- **AND** the executor proceeds to the outbound assembly phase

#### Scenario: Empty sub-table outbound without query/body/header

- **WHEN** the LLM calls a `kind=external` skill with arbitrary `parameters` and the referenced service has zero sub-table rows
- **THEN** the executor assembles:
  - `queryMap = {}` (empty)
  - `bodyMap = {}` (empty)
  - `headerMap = { auth-related headers }` (auth injected from main table)
- **AND** the HTTP call executes with the main table's `endpoint_url` + `http_method` + auth headers
- **AND** the response is returned to the LLM

#### Scenario: Empty sub-table with auth still works

- **WHEN** the referenced service has `auth_kind = "apiKey"` and `auth_config = {"headerName": "X-API-Key", "valueStatic": "<encrypted>"}` and zero sub-table rows
- **THEN** the executor injects the `X-API-Key` header from the main table
- **AND** the HTTP call is made with URL + `X-API-Key` header + empty body / empty query
- **AND** the response is returned to the LLM

### Requirement: Non-external skill execution is unaffected by external tables

The Gateway's `SkillExecutionService.execute()` switch MUST route `kind=external` skills to the new `ExternalServiceSkillExecutor` and route all other kinds (`api` / `ssh` / `python` / `template`) to their existing handlers without modification. The presence or absence of data in `external_service` / `external_service_input` tables MUST NOT affect execution of non-external skills.

#### Scenario: Switch routes api skill normally

- **WHEN** the LLM calls a `kind=api` skill while `external_service` is empty
- **THEN** the switch routes to `executeApiSkill()`
- **AND** `ExternalServiceSkillExecutor.executeExternalSkill()` is NOT invoked
- **AND** the skill executes via the original `api` flow

#### Scenario: Switch routes ssh skill normally

- **WHEN** the LLM calls a `kind=ssh` skill while `external_service` is empty
- **THEN** the switch routes to `executeSshSkill()`
- **AND** the skill executes via the original `ssh` flow

#### Scenario: Switch routes python skill normally

- **WHEN** the LLM calls a `kind=python` skill while `external_service` is empty
- **THEN** the switch routes to `executePythonSkill()`
- **AND** the skill executes via the original `python` flow

#### Scenario: Switch routes template skill normally

- **WHEN** the LLM calls a `kind=template` skill while `external_service` is empty
- **THEN** the switch routes to `executeTemplateSkill()`
- **AND** the skill executes via the original `template` flow

### Requirement: ExternalServiceSkillExecutor defensive null handling

The `ExternalServiceSkillExecutor.executeExternalSkill()` MUST defensively convert null `inputs` / `llmParams` to empty collections at the entry of the method, so that subsequent loops and method calls do not raise `NullPointerException`.

#### Scenario: Null inputs handled

- **WHEN** `registry.listInputs(svc.getId())` returns null (defensive case)
- **THEN** the executor converts it to `Collections.emptyList()` before any iteration
- **AND** no `NullPointerException` is raised

#### Scenario: Null llmParams handled

- **WHEN** `asMap(parameters)` returns null (defensive case, e.g., empty parameters)
- **THEN** the executor converts it to `Collections.emptyMap()` before any iteration
- **AND** no `NullPointerException` is raised

### Requirement: Audit masking handles empty sub-table

The `ExternalOutboundPayloadMasker.mask()` MUST handle empty / null inputs gracefully: when `inputs` is empty or null, no masking occurs, and all LLM-provided keys are passed through unchanged.

#### Scenario: Empty inputs no-op masking

- **WHEN** `mask(llmParams = { foo: "bar", baz: "qux" }, inputs = [])` is called
- **THEN** no sensitive-key collection occurs
- **AND** the returned map contains `{ foo: "bar", baz: "qux" }` unchanged

#### Scenario: Null inputs no-op masking

- **WHEN** `mask(llmParams, null)` is called
- **THEN** the inputs parameter is converted to `Collections.emptyList()` internally
- **AND** the returned map equals the input llmParams map unchanged

### Requirement: Outbound parameter names are character-exact with external_param_name

The Gateway's `executeExternalSkill()` MUST use the value of `external_service_input.external_param_name` as the outbound HTTP request key (query parameter name, JSON body field name, header name) **without any transformation** (no camelCase conversion, no snake_case conversion, no aliasing, no `mapsTo` indirection). The character-exact `external_param_name` MUST appear in the outbound request at the position determined by `param_location` (`query` / `body` / `path` / `header`).

#### Scenario: Query parameter name is verbatim

- **WHEN** the sub-table has row `external_param_name = "q"` with `param_location = "query"`
- **AND** the LLM provides `parameters = { q: "北京" }`
- **THEN** the outbound URL MUST contain `?q=%E5%8C%97%E4%BA%AC`
- **AND** the URL MUST NOT contain `?query=...` or `?cityName=...` or `?city=...`
- **AND** the outbound key is the **exact** value of `external_param_name` from the sub-table

#### Scenario: Body field name is verbatim

- **WHEN** the sub-table has row `external_param_name = "msg_type"` with `param_location = "body"` and `body_content_type = "json"`
- **AND** the LLM provides `parameters = { msg_type: "text" }`
- **THEN** the outbound body MUST contain `"msg_type": "text"` (snake_case, verbatim)
- **AND** the outbound body MUST NOT contain `"msgType": "text"` or `"msg-type": "text"`
- **AND** the JSON field name is the **exact** value of `external_param_name` from the sub-table

#### Scenario: Header name is verbatim

- **WHEN** the sub-table has row `external_param_name = "X-API-Key"` with `param_location = "header"`
- **AND** the LLM provides `parameters = { "X-API-Key": "abc123" }`
- **THEN** the outbound request MUST have header `X-API-Key: abc123` (case-preserved, hyphens preserved)
- **AND** the outbound request MUST NOT have header `x-api-key: abc123` or `X-Api-Key: abc123`
- **AND** the header name is the **exact** value of `external_param_name` from the sub-table

#### Scenario: Path placeholder substitution is verbatim

- **WHEN** `endpoint_url = "https://api.example.com/users/{userId}/posts"` and the sub-table has row `external_param_name = "userId"` with `param_location = "path"`
- **AND** the LLM provides `parameters = { userId: "123" }`
- **THEN** the Gateway MUST substitute the `{userId}` placeholder with `123`
- **AND** the final URL MUST be `https://api.example.com/users/123/posts`
- **AND** the placeholder name in the URL MUST be the **exact** value of `external_param_name` from the sub-table (case-sensitive)

#### Scenario: LLM payload key must match external_param_name

- **WHEN** the sub-table has row `external_param_name = "appid"`
- **THEN** the LLM tool schema exposes a property named exactly `appid`
- **AND** the LLM MUST provide the value under the key `appid` (NOT `apiKey` / `app_id` / `api-key`)
- **AND** if the LLM provides the value under a different key (e.g., `apiKey`), the Gateway MUST NOT include that value in the outbound request (no sub-table row = no outbound)
- **AND** the audit log records the mismatched key as "LLM-provided but no sub-table row"

#### Scenario: Snake_case preserved in body

- **WHEN** the sub-table has row `external_param_name = "user_id"` (snake_case) with `param_location = "body"`
- **AND** the LLM provides `parameters = { user_id: "12345" }`
- **THEN** the outbound body MUST contain `"user_id": "12345"` (snake_case preserved)
- **AND** the Gateway MUST NOT auto-convert to `userId` (camelCase) or `user-id` (kebab-case)

#### Scenario: Case sensitivity enforced in header

- **WHEN** the sub-table has row `external_param_name = "Content-Type"` with `param_location = "header"`
- **AND** the LLM provides `parameters = { "Content-Type": "application/json" }`
- **THEN** the outbound header MUST be `Content-Type: application/json` (case-preserved)
- **AND** the Gateway MUST NOT auto-lowercase to `content-type: application/json`
