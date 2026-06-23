## Context

Gateway 当前 6 种 Skill 类型中，`api` Skill 把 URL/方法/Headers 写在 `skills.configuration` 内——每接入一个外部服务都要在 skill 配置里重复填，且变更接入信息需要重新保存 Skill。**运维痛点**：换 URL、换 API Key、调整重试策略要 N 个 Skill 一起改。

本设计引入**外部服务注册表**——admin 在 `external_service` 主表配第三方接入信息（URL/方法/认证/响应格式/重试），在 `external_service_input` 子表配第三方入参契约（`external_param_name` / `is_required` / `is_raw_transmission` / `param_location` / `body_content_type` / `param_type` / `is_sensitive` / `display_name` / `display_order` / `description`），业务方 Skill 只存 `serviceName` 引用——admin 改一处即所有引用 Skill 立即生效（最长 5 分钟缓存过期）。

完整设计稿在 `docs/external-service-skill-design.md`（1630 行，含 §1-§16 全部章节、4 个典型场景 INSERT 例子、运行时 trace、风险评估、OpenSpec requirements 初稿）。

## Goals / Non-Goals

**Goals**：
- 新增 `kind="external"` Skill，与 `api` / `ssh` / `python` 并列，CONFIG-mode 协议兼容（agent-core 0 改动）
- 2 张新表 `external_service`（精简） + `external_service_input`（含 11 个业务字段）
- Skill 配置极简 `{kind, serviceName, interfaceDescription}`——**无** `inputs[]` / `mapsTo` / `operation` 旧字段
- Skill 创建页按子表行渲染 textarea（label = `display_name` 中文 + 辅助标识 = `external_param_name` 英文）
- 子表是**运行时单一数据源**——Skill 不存入参副本，Gateway 执行时直接查子表
- 出站支持 query / body（json / form / text / binary multipart）/ path / header
- `is_raw_transmission=1` 字段值原文透传（代码 / JSON 字符串 / 签名 / Base64 场景）
- 4 种认证：`none` / `apiKey` / `bearer` / `dynamicToken`（折进 `auth_config` JSON）
- 零新依赖 / 零新环境变量 / 零 agent-core 改动 / JDK 1.8 / TS6133 零容忍

**Non-Goals**：
- 不实现 GraphQL / gRPC / WebSocket / SSE
- 不实现外部服务多实例负载均衡
- 不实现外部服务健康检查（依赖 `enabled` + 出站时捕获 `IOException`）
- 不强制改造 `python` Skill（保留兼容性，二者可并存）
- 不实现 `inputs[]` / `mapsTo` / `operation` 旧字段（已删除，schema 强制拒绝）
- 不为 `external_service` 加 `extra_headers` 字段（新浪 Referer 需求 → future PR）
- 不为 `auth_config` 加 `timeoutMs` 字段（系统默认 30s）

## Decisions

### 决策 1：单一数据源原则（子表 = 运行时契约，skill 表只存引用）

- **方案**：Skill `configuration` 只存 `serviceName` 引用；`external_service_input` 行**不**复制到 `skills` 表
- **理由**：admin 改子表后所有引用 Skill 立即生效（无副本同步问题）；避免 N+1 同步 bug
- **备选**：把子表行 JSON 序列化存到 `skill.configuration.inputs`——被否，**破坏单一数据源**

### 决策 2：`is_raw_transmission` 字段区分原文透传 vs LLM-processed

- **方案**：子表每行 `is_raw_transmission` 决定 Gateway 出站时**不**做 JSON 序列化/URL 编码/转义
- **理由**：LLM 调用 Skill 时 payload 都是字符串，但**有些场景**（代码 / JSON 字符串 / 签名 / Base64）第三方期望"已成型内容"——不做处理会破坏
- **备选**：在 skill 端配"原文透传"标志——被否，**没有 mapping** 就不存在 skill 端标志
- **典型场景**：飞书 `content`（JSON 字符串）/ 脚本 `code`（Python 源码）/ 签名串（Base64-like）/ 天气 `q`（普通文本）——见 `docs/external-service-skill-design.md §4.2.1.2 ~ §4.2.1.4`

### 决策 3：精简主表 `external_service`（10 字段，不做 headers/timeout/retry_backoff/auth_token_* 独立列）

- **方案**：把 6 个 auth_* 字段折进 `auth_config` JSON；`headers` / `timeout_seconds` / `retry_backoff_ms` 不做（系统默认）
- **理由**：与 `api` Skill 行为对齐（`api` 也没有独立 `headers` / `timeout` 字段）；减少 admin 配置项
- **trade-off**：失去 `headers` 字段配置（新浪 Referer 需求需要 `extra_headers` → future PR）；失去 `timeout` 自定义（系统默认 30s → future PR）
- **新主表字段**：`id` / `name` / `endpoint_url` / `http_method` / `auth_kind` / `auth_config` (JSON) / `response_format` / `retry_max` / `enabled` / `display_order` / `description` / `created_at` / `updated_at`

### 决策 4：子表 = 12 字段，分三类（**关键澄清**，admin 必读）

- **第三方接口契约**（4 个）：`external_param_name` / `param_location` / `body_content_type` / `param_type`
- **LLM 行为标志**（3 个）：`is_raw_transmission`（核心）/ `is_required` / `is_sensitive`
- **Admin 元数据**（5 个）：`id` / `service_id` / `display_name` / `description` / `display_order`
- 详见 `docs/external-service-skill-design.md §4.2.1`

### 决策 5：Skill 创建页 = 子表行数 = textarea 数（**业务方不可增删改**）

- **方案**：admin 在子表加一行 = 前端自动多一个 textarea（label = `display_name` 中文，辅助标识 = `external_param_name` 英文）
- **理由**：消除"业务方配错 inputs[]"的复杂度；与子表运行时数据源一致
- **备选**：业务方可自由增删 inputs[] + mapsTo 下拉——被否，**单源原则 + 不需要 mapping**

### 决策 6：Schema 只含 `serviceName` + `interfaceDescription`（**无 inputs[] 动态 schema**）

- **方案**：`SystemSkillController.buildExternalConfigSchema()` 输出 schema 只 2 个键；`inputs` 由前端通过 `GET /api/external-service/{name}/inputs` 单独拉**只读展示**
- **理由**：消除 dynamicList 复杂度；沿用 `ConfigFormRenderer` 既有 `ui: 'select'` / `ui: 'textarea'` / `ui: 'input'`，**不**新增 Vue 组件
- **历史**：`openspec/reviews/2026-06-23-add-external-service-skill.md` 是基于旧设计（dynamicList）的 review，**本次 change 已重写为新设计，旧 review 仅作历史参考**

### 决策 7：审计脱敏两层（`is_sensitive` 字段 mask + `auth_config.valueStatic` 加密存储）

- **`is_sensitive=1` 字段**：Gateway 在 `api_call_log` 落库前 mask 为 `***MASKED***`
- **`auth_config.valueStatic`**：admin UI / SQL INSERT 路径强制 `AesCipher.encrypt()` 加密；读取时 `AesCipher.decrypt()` 解密；`ExternalServiceView` 默认脱敏（仅 admin 可见明文）
- **审计模式**：`HttpClientAuditMode.SKILL_OUTBOUND`（与 `python` / `api` 同模式）；`auth_config.tokenEndpoint` 调用走 `HttpClientAuditMode.NONE`（不污染 `api_call_log`）

### 决策 8：重试 + 超时（系统默认，**不**做配置字段）

- **重试**：`retry_max` 配置（0-5），**退避基数固定 500ms 指数**（不暴露配置项）
- **超时**：系统默认 30s（与 `api` Skill 一致；不暴露配置项；future PR 可加）
- **理由**：与 `api` Skill 行为对齐；减少 admin 配置项

### 决策 9：缓存策略（启动加载 + 5 分钟过期 + invalidate API）

- **冷启动**：`SELECT * FROM external_service; SELECT * FROM external_service_input;` 一次性加载到 `ConcurrentHashMap`
- **缓存有效期**：5 分钟（兜底，万一漏调 invalidate 也最多延迟生效）
- **失效**：`registry.invalidateAll()` / `registry.invalidateService(id)`（admin UI 或 SQL 修改后调用）
- **trade-off**：admin 改子表后最长 5 分钟生效（业务方可接受；admin 调 invalidate API 即时生效）

## Risks / Trade-offs

| 风险 | 严重度 | 缓解 |
|---|---|---|
| admin 误配 `is_raw_transmission=1` 但值非"成型内容" | 中 | `parseJsonOrKeepString` 兜底（解析失败当 string 写 `"<value>"`）；audit 标 WARN；前端 aiHint 强提示「该字段将整段透传」 |
| Dynamic Token 缓存雪崩（多 Skill 并发首次请求） | 低 | `synchronized(svc.getName().intern())` 单飞；token 失效时其他线程等待 |
| 审计日志泄露敏感凭证 | 高 | `ExternalOutboundPayloadMasker` 必跑；`auth_config.valueStatic` 在 `ExternalServiceView` 默认脱敏；后端 INSERT 路径加 `AesCipher.encrypt` 兜底 |
| 重试导致重复副作用（脚本执行 / 通知推送） | 中 | admin 应保证外部服务幂等；对写类外部服务 aiHint 提示「建议 `retry_max=0`」 |
| 业务方误以为可"自定义入参"（旧 design 思维惯性） | 中 | §6.4 UI 明确标记"**只读预览**"+ JsonSchemaValidator 拒绝 `inputs[]` 旧字段；新 design 文档、培训、admin UI 引导都说明"子表即表单" |
| File 上传 multipart 协议兼容性 | 中 | 仅 `RestTemplate` + `HttpEntity`（Spring 自带），不引新依赖；外部服务须按 RFC 7578 解析 |
| TS6133 触发（新增 `ExternalConfigDraft` / `isExternalDraft` 等未引用） | 中 | 实施完成后**必须** `vue-tsc -b` + `npm run build` 验证（AGENTS.md §5.6） |
| JDK 1.8 不支持的新 API（如 `List.of`） | 低 | 严格按 `Arrays.asList` / 显式类型；Code Review checklist 必查 |
| `schema-mysql.sql` 增量 DDL 不被现有部署感知 | 中 | 同步更新 `SchemaMigrationRunner`（启动时自检 + 建表）；旧部署升级时冷启动自动建新表（与 `python_sandbox` 同模式） |
| `auth_config` JSON 解析失败 | 中 | `AuthConfigParser` 解析失败 → 400 拒绝 Skill 执行，audit 标 ERROR |
| 缓存 5 分钟延迟生效 | 低 | 兜底；admin 主动调 `invalidate` API 即时生效；admin UI 集成 `invalidate` 调用 |
| 旧 `reviews/2026-06-23-add-external-service-skill.md` 基于旧设计 | 低 | 该 review 引用 `inputs[]` / `dynamicList` / `auth_value_static` 等已删除字段，**仅作历史参考**；本次 change 是新设计稿的完整重写，旧 review 不阻塞 apply |

## Migration Plan

### 部署步骤

1. **DB 升级**：
   - 启动 gateway 时 `SchemaMigrationRunner` 自动建新表（`CREATE TABLE IF NOT EXISTS`）
   - 旧部署升级后冷启动自动建表（无需手动跑 SQL）
2. **admin 录入**：参考 `docs/external-service-skill-design.md §4.7` 4 个场景 INSERT 例子执行 `INSERT INTO external_service / external_service_input`（**纯 SQL**，无 admin UI 依赖）
3. **业务方创建 Skill**：选 `kind="external"` → 选 `serviceName` → 填 `interfaceDescription` → 保存
4. **前端验证**：`vue-tsc -b` + `npm run build` 通过（AGENTS.md §5.6）
5. **后端验证**：`mvn -DskipTests compile` 通过（JDK 1.8 编译）

### 回滚策略

- 移除 `SystemSkillController.listExecutionTypes()` 中的 `external` 循环 + `case "external"` switch 分支
- 新表数据保留（`external_service` / `external_service_input` 不删除，下次部署可继续使用）
- 不影响现有 `api` / `ssh` / `python` / `template` / `openclaw` 链路

## Open Questions

无——所有关键决策已在 `docs/external-service-skill-design.md` 第 1-16 章固化，评审需确认项已全部处理（A/D/E 标记为 ✅ 已处理，B 待单独处理不在本次 change 范围）。
