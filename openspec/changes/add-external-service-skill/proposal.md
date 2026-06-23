## Why

当前 Gateway 的 Skill 类型（`api` / `ssh` / `python` / `template` / `openclaw` / `file_tool`）覆盖不了"调用任意外部 HTTP 服务"的需求——`api` Skill 把 URL/方法/Headers 写在 skill 内，**不能**被多个 Skill 共享且**不能**统一管理接入配置；业务方每接入一个新服务（如天气、股票、脚本执行、飞书通知）都要重复配置，且变更接入信息（换 URL、换认证）需要重新保存 Skill。

需要新增 `kind="external"` Skill：让 LLM 能通过统一配置的**外部服务注册表**调用任意外部 HTTP 服务——admin 配一次外部服务接入信息（URL / 认证 / 重试 / 响应格式 / 入参契约），业务方**只引用** `serviceName` 即可创建 Skill，admin 改接入信息后业务方所有引用 Skill **立即生效**。

## What Changes

- **新增 `kind="external"` Skill 类型**：与 `api` / `ssh` / `python` 并列，CONFIG-mode Extension Skill
- **新增 2 张表**：
  - `external_service`（主表，存外部服务接入信息：URL / 方法 / `auth_config` JSON / 响应格式 / 重试 / 启用 / display_order）
  - `external_service_input`（子表，存第三方入参契约：external_param_name / display_name / is_required / is_raw_transmission / param_location / body_content_type / param_type / is_sensitive / display_order / description）
- **Skill 配置极简**：`{kind: "external", serviceName: "...", interfaceDescription: "..."}`——**不**存 URL/方法/Headers/入参定义（这些都在外部服务注册表里，**单一数据源**）
- **Skill 创建页直接按子表行渲染 textarea**（label = `display_name` 中文，辅助标识 = `external_param_name` 英文），**业务方不能**增删改入参
- **Gateway 出站 = 查子表按 `param_location` + `is_raw_transmission` + `body_content_type` 拼装**：支持 GET query / POST body（json / form / text / binary multipart）/ path / header
- **`is_raw_transmission=1` 字段值原文透传**（代码片段 / JSON 字符串 / 签名 / Base64 场景，不做 JSON 序列化/URL 编码/转义）
- **认证支持** `none` / `apiKey` / `bearer` / `dynamicToken` 四种（折进 `auth_config` JSON 字段，按 `auth_kind` 决定 schema）
- **重试**：按 `retry_max` 指数退避（基数 500ms 写死，**不**做 `retry_backoff_ms` 字段）；**超时**系统默认 30s（**不**做 `timeout_seconds` 字段）
- **审计脱敏**：按子表 `is_sensitive` 标志；`auth_config.valueStatic` 在 `ExternalServiceView` 默认脱敏
- **Admin CRUD 接口**：`/api/external-service` 主表管理 + `/api/external-service/{name}/inputs` 只读查询（供前端 Skill 创建页预览）
- **前端改造**：`skillEditor.ts` 加 `ExternalConfigDraft` / `parseExternalDraft` / `serializeExternalDraft` / `isExternalDraft`（**无 `inputs[]` / `SkillInputDraft` 子结构**）；`SkillManagementModal.vue` 加 `isExternalDraft` 分支（**只处理 serviceName + interfaceDescription** + 拉子表行只读预览）；**不**新增 Vue 组件（沿用 `ConfigFormRenderer.vue` 既有 `ui: 'select'` / `ui: 'textarea'` / `ui: 'input'`）

## Capabilities

### New Capabilities

- `external-service-skill`：Skill 侧——`kind="external"` Skill 的注册、编辑、删除、启用/禁用；Gateway 端出站执行；审计脱敏；链路追踪透传；multipart 文件上传
- `external-service-registry`：Admin 侧——`external_service` / `external_service_input` 表的 CRUD 入口；启用/禁用外部服务；FK 约束（`serviceName` 必须在主表存在）

### Modified Capabilities

（无——本 change **不**修改任何已有 spec 的 requirement；与 `python-execution-skill` / `api-extension-skill-llm-tool-call` 平行存在）

## Impact

**后端改动**（`backend/skill-gateway/`）：

**新增 13 个文件**：
- `entity/ExternalService.java`
- `entity/ExternalServiceInput.java`
- `mapper/ExternalServiceMapper.java` + `mapper/ExternalServiceInputMapper.java` + 两个 XML
- `dto/ExternalServiceRequest.java` + `dto/ExternalServiceInputRequest.java` + `dto/ExternalServiceView.java`
- `service/ExternalServiceRegistry.java`（含本地内存缓存 5 分钟 + `invalidate` API）
- `service/ExternalServiceSkillExecutor.java`（核心出站逻辑）
- `service/DynamicTokenCache.java`（dynamicToken 模式本地缓存）
- `service/RetryableHttpClient.java`（重试封装）
- `service/AuthConfigParser.java`（按 `auth_kind` 解析 `auth_config` JSON）
- `audit/ExternalOutboundPayloadMasker.java`
- `controller/ExternalServiceController.java` + `controller/ExternalServiceQueryController.java`

**修改 5 个文件**：
- `controller/SystemSkillController.java`（`listExecutionTypes()` + `buildExternalConfigSchema()`）
- `service/SkillExecutionService.java`（`switch` 加 `case "external"`）
- `service/SkillService.java`（`createOrUpdate()` 加 `registry.assertExists(serviceName)` 校验 + 拒绝 `inputs[]` / `mapsTo` / `operation` 旧字段）
- `resources/schema-mysql.sql`（追加 2 张表 DDL）
- `config/SchemaMigrationRunner.java`（启动自检新表）

**前端改动**（`frontend/src/`）：

**修改 2 个文件**：
- `utils/skillEditor.ts`（ConfigKind / ExternalConfigDraft / parse / serialize / isExternalDraft）
- `components/SkillManagementModal.vue`（`isExternalDraft` 分支 + 拉子表行只读预览）

**新增 0 个文件**（严格不新增 Vue 组件）

**不动**：
- `backend/agent-core/`：**零改动**（AGENTS.md §5.5 强约束）
- `frontend/package.json` / `vite.config.ts` / `tsconfig.json`：零改动
- `python_sandbox` 表 / `skills` 表结构 / `api` / `ssh` / `python` / `template` / `openclaw` 链路：零行为改动

**依赖**：
- 零新 Maven / npm 包（沿用 `JDK 1.8` / `NestJS 11` / `Vue 3` / `Spring Boot 2.7` 自带标准库）
- 零新环境变量
- JDK 1.8 编译目标不变
- 前端 `vue-tsc -b` 严格模式零 TS6133（AGENTS.md §5.6）

**数据库**：
- 2 张新表，DDL 同步到 `schema-mysql.sql` + `SchemaMigrationRunner` 启动自检（AGENTS.md §5.3 强约束：增量变更走 Java 迁移类）

**完整设计稿**：`docs/external-service-skill-design.md`（1630 行，已与本次 proposal 对齐）
