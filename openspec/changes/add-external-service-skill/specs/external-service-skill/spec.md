# external-service-skill 规格说明

## 目的
`kind="external"` CONFIG-mode Skill 的运行时执行。将 Skill 输入框映射到外部服务入参，按契约组装出站 HTTP 请求，注入认证信息，处理超时重试和响应格式化。

## 新增需求

### 需求：External CONFIG Skill 模型

系统必须支持 canonical 配置类型为 `external` 的 CONFIG-mode 扩展 Skill，其存储的 `configuration` 对象必须包含以下规范字段：
- `serviceName`（引用 `external_service.name` 行）
- `operation`（LLM 工具名后缀）
- `inputs`（Skill 输入框定义的 JSON 数组）

`inputs` 数组中的每个对象必须包含字段：`key`（字符串，在 Skill 内唯一）、`displayName`、`isRequired`（布尔）、`placeholder`、`valueType`（枚举：string/number/boolean）、`description`、`mapsTo`（字符串，引用该 service 下某 `external_service_input.external_param_name`，或 null）、`sortOrder`。

#### 场景：使用所有字段持久化 external Skill

- **当**用户创建一个扩展 Skill，`executionMode` 为 CONFIG，`configuration` 包含 `"kind": "external"`、非空 `serviceName`、非空 `operation`、非空 `inputs` 数组，且 `inputs` 中每个 `mapsTo != null` 的项都引用了对应 service 存在的 `external_service_input.external_param_name`
- **则**系统成功持久化该 Skill
- **且**`inputs` 数组完整存入 `skills.configuration`

#### 场景：拒绝 inputs 数组内重复的 key

- **当**创建或更新请求中 `kind=external` 且有两个 `inputs` 条目共享相同的 `key`
- **则**系统拒绝该请求并返回校验错误

#### 场景：拒绝未映射到必填外部入参的 Skill

- **当**创建或更新请求中 `kind=external`，且存在一个 `external_service_input` 行（属于该 service）的 `is_required=1`，但 `inputs` 数组中没有任何条目的 `mapsTo` 指向该 `external_param_name`
- **则**系统拒绝该请求并返回校验错误
- **且**错误信息中指明缺失的外部参数名

#### 场景：拒绝引用不存在的 service

- **当**创建或更新请求中 `kind=external` 且 `serviceName` 在 `external_service` 中不存在
- **则**系统拒绝该请求并返回校验错误

### 需求：External Skill 对 LLM 的暴露

agent 扩展 Skill 加载器必须为每个已启用的 `kind=external` Skill 注册一个工具，使用与 `api`/`ssh`/`python`/`template` 相同的外部 `payload` Zod 包装（agent-core 中无需针对 kind 的分支），且内层 `payload` 对象的 Zod schema 必须从 Skill 的 `configuration.inputs` 数组派生，使得 LLM 仅看到 Skill 定义的输入字段（而非外部服务的参数名）。

#### 场景：LLM 看到 Skill 定义的 key，而非外部参数名

- **当**一个 Skill 的 `configuration.inputs` 包含 `[{"key": "city", "mapsTo": "q"}, {"key": "units", "mapsTo": "units"}]`
- **则**LLM 工具 schema 必须包含属性 `city` 和 `units`
- **且**LLM 不得看到属性 `q`（外部参数名）

### 需求：基于映射的请求组装

Gateway executor 必须在运行时遍历 `inputs[]`，将每个 `mapsTo` 值解析为 `external_service_input` 表中的对应行，并按以下方式组装出站 HTTP 请求：对于每个 `mapsTo != null` 的 `inputs[]` 条目，定位对应的 `external_service_input` 行，将 LLM 提供的值按 `external_service_input.in` 指示的位置（query/path/body/header）追加到请求中，使用 `external_param_name` 作为出站 key。`mapsTo = null` 的条目必须被静默忽略。

#### 场景：GET query 组装（带 URL 编码）

- **当**一个 Skill 引用一个 `http_method=GET` 的 service，一个 `inputs` 条目 `{"key": "city", "mapsTo": "q"}` 解析到 `external_service_input`（`in=query`、`is_raw_transmission=0`），且 LLM 提供 `city="北京"`
- **则**Gateway 必须将 `?q=%E5%8C%97%E4%BA%AC` 追加到 service URL

#### 场景：原文透传（不编码、不序列化）

- **当**一个 `inputs` 条目 `{"key": "code", "mapsTo": "code"}` 解析到 `external_service_input`（`in=body`、`content_type=json`、`is_raw_transmission=1`），且 LLM 提供 `code="print('hello')\nimport json"`（包含换行和引号的字符串）
- **则**Gateway 必须将值原文写入 JSON body，即 `"code": "print('hello')\nimport json"`，不转义换行或引号
- **且**不得再次 JSON 序列化该字符串值

#### 场景：未映射的输入被忽略

- **当**一个 Skill 有 `inputs` 条目 `{"key": "internalNote", "mapsTo": null}`，且 LLM 提供了 `internalNote="debug-123"`
- **则**Gateway 不得将 `internalNote` 包含在出站请求中

### 需求：出站请求位置组装

对于 `in=path`：Gateway 必须将 service URL 中的 `{external_param_name}` 占位符替换为提供的值（URL 解码后的字符串）。对于 `in=header`：Gateway 必须追加一个 Header，名称为 `external_param_name`，值为提供的值。对于 `in=body`：当 service 的 inputs 中存在任何 `in=body` 条目时，Gateway 必须收集所有此类值，并按第一个 body 的 `content_type` 序列化（json → Jackson 序列化；form → `application/x-www-form-urlencoded`；text → 纯文本 body）。

#### 场景：Path 参数替换

- **当**一个 service 的 `endpoint_url = "https://api.example.com/users/{userId}/orders/{orderId}"`，且有两个 `inputs` 条目映射到 `in=path` 的 `external_service_input` 行
- **则**Gateway 必须用对应值替换 `{userId}` 和 `{orderId}`
- **且**结果 URL 中不得包含剩余的 `{placeholder}` 段

### 需求：认证注入

Gateway 必须在发送出站请求前根据 `external_service.auth_type` 注入认证 Header：
- `apiKey`：注入名称为 `auth_header_name`、值为 `auth_value_static`（已解密）的 Header
- `bearer`：注入 `Authorization: Bearer {auth_value_static}`
- `dynamicToken`：首先调用 `auth_token_endpoint`（使用 `auth_token_method` 和 `auth_token_request_body`），通过 JSONPath `auth_token_path` 提取 token，在 `auth_token_cache_seconds` 秒内缓存，然后注入该 Header

#### 场景：Bearer Token 注入

- **当**一个 Skill 引用一个 `auth_type=bearer`、`auth_value_static`（已加密）= "s3cr3t" 的 service
- **则**Gateway 必须解密该值，计算 "Bearer s3cr3t"，并注入 `Authorization: Bearer s3cr3t` 到出站请求 Header

#### 场景：Dynamic Token 缓存和复用

- **当**一个 Skill 引用一个 `auth_type=dynamicToken`、`auth_token_cache_seconds=300` 的 service，且 10 个并发 Skill 执行请求在 5 秒内到达
- **则**Gateway 必须仅调用 `auth_token_endpoint` 一次
- **且**在 300 秒窗口内复用该缓存 token 处理全部 10 个出站请求

### 需求：超时和重试

Gateway 必须将 `timeout_seconds` 作为每次请求的超时时间。请求失败（非 2xx 响应或网络错误）时，Gateway 必须按 `retry_max` 重试最多 N 次（N = retry_max + 1 次尝试），指数退避从 `retry_backoff_ms` 毫秒开始（每次翻倍：1×、2×、4×、...）。

#### 场景：一次重试后成功

- **当**一个 service 的 `retry_max=2`、`retry_backoff_ms=500`，且第一次出站请求返回 HTTP 503
- **则**Gateway 必须等待 500ms 后重试
- **且**若第二次尝试返回 200，不得进行第三次重试，直接返回响应给 LLM

#### 场景：全部重试耗尽

- **当**一个 service 的 `retry_max=2` 且全部三次尝试均返回 HTTP 500
- **则**Gateway 必须在第三次尝试后向 LLM 返回错误

### 需求：响应格式化

Gateway 必须根据 `external_service.response_format` 处理外部服务响应：
- `json`：将响应 body 解析为 JSON，返回解析后的对象给 LLM
- `text`：返回原始字符串
- `binary-base64`：将 body 作为 Base64 编码字符串返回

#### 场景：JSON 响应解析

- **当**一个 service 的 `response_format=json`，且外部服务返回 `{"temp": 25.3, "humidity": 80}`
- **则**Gateway 必须返回解析后的 JSON 对象 `{temp: 25.3, humidity: 80}` 给 LLM

### 需求：带脱敏的审计日志

Gateway 必须以 `HttpClientAuditMode.SKILL_OUTBOUND` 模式将出站请求写入 `api_call_log`。对于每个 `external_service_input.sensitive=1` 的行，Gateway 必须在写入日志前将对应值替换为 `"***MASKED***"`。

#### 场景：敏感字段在审计日志中脱敏

- **当**一个 `inputs` 条目映射到 `sensitive=1` 的 `external_service_input`，且 LLM 提供了值 `"sk-abc123"`
- **则**出站请求中必须包含真实值 `"sk-abc123"`
- **且**`api_call_log.payload` 字段必须包含 `"***MASKED***"` 而非真实值

### 需求：Skill 输入框必填字段校验

运行时，Gateway 必须验证每个 `isRequired=true` 的 `inputs[]` 条目在 LLM 提供的参数中存在（非 null）。缺失必填字段必须导致 HTTP 400，并在消息中指明缺失的字段 key。

#### 场景：缺失必填 Skill 输入字段

- **当**一个 Skill 有 `inputs` 条目 `{"key": "city", "isRequired": true, "mapsTo": "q"}`，且 LLM 在 payload 中未提供 `city` 字段
- **则**Gateway 必须返回 HTTP 400，消息为 `"Missing required field: city"`
