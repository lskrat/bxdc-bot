# external-service-registry 规格说明

## 目的
管理员专用的外部 HTTP 服务注册表 CRUD（`external_service` 及 `external_service_input`）。写权限仅限管理员；非管理员读权限限于已启用的服务。

## 新增需求

### 需求：external_service 表结构

系统必须提供 `external_service` 表，包含以下列：
- `id`（自增主键）
- `name`（VARCHAR(64)，唯一，非空——被 `Skill.configuration.serviceName` 引用）
- `endpoint_url`（VARCHAR(1024)，非空）
- `http_method`（VARCHAR(8)，非空，默认 `'POST'`）
- `headers`（JSON，可空）
- `timeout_seconds`（INT，非空，默认 30）
- `retry_max`（INT，非空，默认 0）
- `retry_backoff_ms`（INT，非空，默认 500）
- `auth_type`（VARCHAR(16)，非空，默认 `'none'`）
- `auth_header_name`（VARCHAR(64)，可空）
- `auth_value_static`（VARCHAR(1024)，可空——存储时加密）
- `auth_token_endpoint`（VARCHAR(1024)，可空）
- `auth_token_method`（VARCHAR(8)，非空，默认 `'POST'`）
- `auth_token_request_body`（JSON，可空）
- `auth_token_path`（VARCHAR(256)，可空）
- `auth_token_cache_seconds`（INT，非空，默认 300）
- `response_format`（VARCHAR(16)，非空，默认 `'json'`）
- `sort_order`（INT，非空，默认 0）
- `enabled`（TINYINT(1)，非空，默认 1）
- `description`（TEXT，可空）
- 标准 `created_at`/`updated_at` 时间戳

必须存在索引 `(enabled, sort_order)`。

#### 场景：插入时的默认值

- **当**插入新行时未指定 `http_method`、`headers`、`timeout_seconds`、`retry_max`、`retry_backoff_ms`、`auth_type`、`auth_token_method`、`auth_token_cache_seconds`、`response_format`、`sort_order`、`enabled`、`created_at`、`updated_at`
- **则**该行必须以下列值持久化：`http_method='POST'`、`headers=NULL`、`timeout_seconds=30`、`retry_max=0`、`retry_backoff_ms=500`、`auth_type='none'`、`auth_token_method='POST'`、`auth_token_cache_seconds=300`、`response_format='json'`、`sort_order=0`、`enabled=1`

#### 场景：拒绝重复 name

- **当**插入请求提供的 `name` 已在 `external_service` 中存在
- **则**系统必须拒绝该请求并抛出唯一性约束冲突

#### 场景：读取时解密 auth_value

- **当**读取包含 `auth_value_static` 的行（管理员视角）
- **则**该值必须通过 `AesCipher.decrypt` 解密后再返回到 API 响应中

### 需求：external_service_input 表结构

系统必须提供 `external_service_input` 表，包含以下列：
- `id`（自增主键）
- `service_id`（BIGINT，非空，FK → `external_service.id`）
- `external_param_name`（VARCHAR(64)，非空）
- `is_required`（TINYINT(1)，非空，默认 0）
- `is_raw_transmission`（TINYINT(1)，非空，默认 0）
- `in`（VARCHAR(16)，非空，默认 `'body'`）
- `content_type`（VARCHAR(16)，可空）
- `value_type`（VARCHAR(16)，非空，默认 `'string'`）
- `sensitive`（TINYINT(1)，非空，默认 0）
- `description`（TEXT，可空）
- `sort_order`（INT，非空，默认 0）

必须在 `(service_id, external_param_name)` 上存在唯一键。必须在 `(service_id, sort_order)` 上存在索引。

#### 场景：拒绝 service 内重复的 external_param_name

- **当**插入请求提供的 `(service_id, external_param_name)` 组合已存在
- **则**系统必须拒绝该请求并抛出唯一性约束冲突

### 需求：external_service 和 external_service_input 的写权限仅限管理员

系统必须将对 `external_service` 和 `external_service_input` 的创建/更新/删除操作限制为管理员用户（与 `python_sandbox` 使用的管理员 ID 约束一致）。所有其他认证用户必须被拒绝写权限。系统必须暴露仅返回 `enabled=true` 行的读接口供非管理员使用。

#### 场景：非管理员只能读已启用的服务

- **当**非管理员用户调用 `GET /api/external-service`
- **则**响应必须仅包含 `enabled=1` 的行

#### 场景：非管理员被拒绝写操作

- **当**非管理员用户调用 `POST /api/external-service`
- **则**系统必须返回 HTTP 403

### 需求：external_service_input inputs 查询接口

系统必须暴露 `GET /api/external-service/{serviceName}/inputs`，返回指定服务名的 `external_service_input` 行（按 `sort_order ASC, id ASC` 排序），适合用于 Skill 管理 UI 中的联动下拉框填充。

#### 场景：返回按 sort_order 排序的 inputs

- **当**调用 `GET /api/external-service/weather-openweathermap/inputs`
- **则**响应必须是一个 JSON 数组，包含 `external_service_input` 行，按 `sort_order ASC, id ASC` 排序
- **且**每个条目必须包含 `external_param_name`、`in`、`is_required`、`is_raw_transmission`、`description`
