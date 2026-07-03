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

### 决策 10：空数据场景兜底（强约束，原有 Skill 链路零回归）

- **目标**：2 张新表为空时，**新功能完全不挂载**（schema 列表无 external 项），**原有 Skill 链路（api/ssh/python/template/openclaw/file_tool）零行为变化**
- **8 条兜底原则**（详见 `docs/external-service-skill-design.md §17.1`）：
  1. **新功能 = 完全 opt-in**：注册表为空 → 系统与本次改动前**行为一致**
  2. **空集合用 `Collections.emptyList()`，不用 `null`** —— 防止上游 NPE
  3. **冷启动逻辑包 try/catch**：失败仅 `log.warn`，**不阻塞 Spring 启动**（与 `PythonSandboxService` 启动模式一致）
  4. **新增 case 独立成方法**：`executeExternalSkill` 独立 `ExternalServiceSkillExecutor` 类，switch 入口 1 行委托，原 4 个 case 逻辑零修改
  5. **FK 校验用 `if (kind.equals("external"))` 包裹**：仅对 `kind=external` 生效，其他 kind 逻辑零改动
  6. **前端响应式状态初始为空数组**：`externalOptions.value = []` / `subTablePreview.value = []`，避免渲染时报错
  7. **认证注入按主表，不依赖子表**：即便子表为空，apiKey / bearer 仍生效 → 出站 HTTP 仍能调通（POST 空 body / GET 无 query）
  8. **`vue-tsc -b` 零 TS6133**：所有 `ExternalConfigDraft` / `isExternalDraft` / `parseExternalDraft` 等 export 必须被引用
- **关键代码路径**：
  - `ExternalServiceRegistry.loadAll()` 包 try/catch；`listEnabled()` 永不返回 null、永不抛异常
  - `SystemSkillController.listExecutionTypes()` 原 4 种类型逻辑保留，新增 `for (ExternalService svc : registry.listEnabled())` 0 次循环 = 无挂载
  - `SkillService.createOrUpdate()` 加 `if ("external".equals(kind))` 守卫，FK 校验仅对 external 触发
  - `SkillExecutionService.execute()` switch 追加 `case "external"` 不影响其他 case
  - `ExternalServiceSkillExecutor.executeExternalSkill()` 子表为空 → 所有 map 保持空 → 仍能出站
  - `GET /api/external-service/{name}/inputs` 服务不存在 → 404；子表空 → `[]`
- **前端兜底**：`externalOptions` / `subTablePreview` 初始为空数组；`serviceName` select `:disabled="!externalOptions.length"`；子表预览区 `v-if="subTablePreview.length"`
- **自检 checklist**：见 `docs/external-service-skill-design.md §17.5`（12 条验证项，覆盖冷启动 / 编译 / 运行时 / 空表 UI / 空子表出站）

### 决策 11：agent-core 0 改动机制 — Gateway `Skill.computeSchemaPropertiesInternal()` 派生 schemaProperties

**核心结论**：agent-core 通过 Gateway 返回的 `schemaProperties` 字段消费 Skill 入参契约，**不**关心 `kind`。本次 change 在 Gateway 单点扩展 `Skill.computeSchemaPropertiesInternal()` 的 `kind=external` 分支，agent-core **完全 0 改动**。

**机制详解**：

1. **既有路径**（api / python）：
   - [`Skill.java::computeSchemaPropertiesInternal()`](file:///d:/IdeaProjects/bxdc-bot/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/entity/Skill.java) 从 `configuration.parameterContract` 提取 → 派生成 `Map<propertyName, {type, description}>` → 持久化到 `skills.schema_properties` 列
   - agent-core [`java-skills.ts::buildSkillZodSchema(config, schemaProperties)`](file:///d:/IdeaProjects/bxdc-bot/backend/agent-core/src/tools/java-skills.ts) 直接读这个 Map → 构造 Zod → 注册为 `DynamicStructuredTool`
   - agent-core **完全不知道**这个 skill 是 `api` / `python` 还是别的

2. **新增路径**（external）：
   - **不**让 `configuration` 存 inputs 定义（避免运行时单一数据源被破坏，§决策 1）
   - **不**让 agent-core 写 external 特定代码（违反 AGENTS.md §5.5）
   - **在 `Skill.computeSchemaPropertiesInternal()` 新增 `kind=external` 分支**（单点 ~30 行）：
     - 读 `cfg.get("serviceName")` → `ExternalServiceRegistry.getByNameOrThrow(serviceName)`
     - 调 `registry.listInputs(svc.getId())` → 拿子表行（顺序 `display_order ASC, id ASC`）
     - 派生 `Map<external_param_name, {type: param_type, description: description}>`
     - 收集 `required` 列表（`is_required=1` 的 `external_param_name` 集合）
   - 持久化到 `skills.schema_properties`（与 api/python 完全一致的 schema 形态）
   - agent-core 走既有 `buildSkillZodSchema()` 路径 → 看到的是普通 CONFIG-mode schema → **零外部 kind 特定代码**

3. **执行链路**（无外部特定代码）：
   - LLM 按 schema 填 payload（payload key = `external_param_name`，字符级一致）
   - agent-core 原样 POST Gateway `/api/skills/execute`（既有路径）
   - Gateway `SkillExecutionService.execute()` switch 进 `case "external"` → `ExternalServiceSkillExecutor`
   - `ExternalServiceSkillExecutor` 再次查子表（运行时单一数据源）→ 拼出站 → 响应回 LLM

4. **关键不变量**：
   - agent-core 看到的 payload key **永远等于** 子表 `external_param_name`（由 Gateway 派生的 schemaProperties 决定）— §20 参数名一致性硬约束
   - agent-core **永远不知道** `kind` 字段存在 — 走通用 CONFIG-mode 路径
   - `ExternalServiceSkillExecutor` 在 Gateway 侧，与 agent-core **完全解耦** — 改出站逻辑不动 agent-core

**与 api/python 的对等性证据**（消除关注项 2）：

| 维度 | api / python | external（本次新增） |
|---|---|---|
| 派生子表 / 字段来源 | `configuration.parameterContract` | `external_service_input` 子表 |
| 派生位置 | `Skill.computeSchemaPropertiesInternal()` `if (kind == "api")` 分支 | **新增** `else if (kind == "external")` 分支 |
| 派生代码量 | ~20 行 | ~30 行（多 1 次 registry 调用 + service 校验）|
| agent-core 路径 | `buildSkillZodSchema(config, schemaProperties)` 统一 | **同一路径**，**零 external 特定代码** |
| 执行路径 | `POST /api/skills/execute` → switch case | **同一路径** |
| Gateway Executor | `ApiProxyService` / `PythonExecutorService` | `ExternalServiceSkillExecutor`（独立 @Service）|
| agent-core 改动 | 无 | **无**（合规 AGENTS.md §5.5）|

**这意味着**：
- 本次 change 在 Gateway `Skill.java` 单点加 1 个 `else if (kind.equals("external"))` 分支（~30 行代码）
- agent-core 不需要任何文件改动（不需要改 `java-skills.ts` / `agent.ts` / `skill-generator.ts` 等）
- 实施期只需确认 `Skill.computeSchemaPropertiesInternal()` 的现有 case 逻辑不被破坏（用现有的 `parameterContract` 分支继续处理 api/python）+ 新增 `external` 分支处理 sub-table 注入

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
| 2 张新表为空时影响原有 Skill 链路 | 中 | 严格按决策 10 兜底（详见 `docs/external-service-skill-design.md §17`）；`ExternalServiceRegistry` 冷启动 try/catch + `Collections.emptyList()` 返回；switch 新增 case 独立；FK 校验 `if (kind.equals("external"))` 守卫；前端响应式状态初始空数组；12 条自检 checklist 必跑 |

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
