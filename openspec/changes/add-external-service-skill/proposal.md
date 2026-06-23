## 背景与动机

当前 bot 支持的 Skill 类型有 `api`（HTTP 代理）、`ssh`（远程命令）、`python`（Python 沙箱）。这三者在 agent-core 侧统一走 `ensureObjectType` 的 `payload` 包装协议（LLM 调用时格式为 `{ skillId, payload: { ... } }`，Gateway 收到扁平的 `Map<String, Object>`），各自通过不同的 executor 处理。

现有类型无法满足以下需求：
- 调用任意第三方 HTTP 服务（天气 API、股票数据、脚本执行服务、通知平台等），而不需要在 Skill 配置里直接嵌入 URL/方法/Headers
- 同一个外部服务可被多个 Skill 复用，变更接入信息时不动 Skill 本身
- Python 沙箱 Skill 与外部脚本执行 Skill 是不同需求，但底层都是 HTTP 调用，应该有统一且可扩展的外部服务接入方案

## 变更内容

- **新增 Skill 类型 `external`**：CONFIG-mode 的扩展 Skill，调用预注册的外部 HTTP 服务。服务元数据（URL、方法、Headers、认证、超时、重试、响应格式）存放在独立的 `external_service` 表；每个服务的入参契约存放在 `external_service_input` 表。每个 Skill 通过 `skills.configuration.inputs[]` 定义自己的输入字段，通过 `mapsTo` 字段将 Skill 输入框映射到外部服务的入参名。
- **Admin 注册表**：提供 `external_service` 和 `external_service_input` 两张表的 CRUD 接口，写权限仅限管理员。
- **基于映射的请求组装**：Gateway 执行时遍历 `inputs[]`，将每个 Skill 输入框的 `mapsTo` 解析为 `external_service_input` 表中的入参契约，然后按契约组装出站 HTTP 请求（path/query/body/header）。
- **原文透传支持**：`external_service_input.is_raw_transmission=1` 的字段不做 JSON 序列化、不做 URL 编码、不做转义，整段透传到外部服务，支持代码片段、JSON 字符串、复杂 query 值等场景。
- **不改动 agent-core**：所有逻辑位于 skill-gateway Java 层。agent-core 看到的是与 `api`/`ssh`/`python` 完全相同的 `payload` 包装，零改动。

## 能力

### 新增能力

- `external-service-skill`：运行时执行 `kind="external"` 的 Skill。将 Skill 输入框映射到外部服务入参，按契约组装出站 HTTP 请求（支持 GET query、POST body（JSON/form/text/binary）、header 注入），注入认证信息（apiKey/bearer/dynamicToken），处理超时重试和响应格式化，并做审计日志脱敏。
- `external-service-registry`：管理员专用的外部 HTTP 服务注册表 CRUD（`external_service` 及 `external_service_input`）。在 Skill 创建/更新时校验：所有 `external_service_input.is_required=1` 的入参必须有至少一个 Skill 输入框 `mapsTo` 到它。

## 影响范围

- **后端**：`external_service` 和 `external_service_input` 两张新表；新增 Java 类（Entity、Mapper、Service、Controller、Executor、Masker）；修改 `SkillExecutionService`（switch case）、`SystemSkillController`（schema 生成）、`SkillService`（映射校验）。
- **前端**：在 `skillEditor.ts` 和 `SkillManagementModal.vue` 中扩展对 `external` 配置类型的支持。不新增 Vue 组件，不新增 npm 包。
- **数据库**：通过 `SchemaMigrationRunner` 在服务启动时自动创建两张新表。
- **agent-core**：**零改动**。现有的 `ensureObjectType` payload 包装和工具注册管道无需任何修改即可支持 `kind="external"` 的 Skill。
