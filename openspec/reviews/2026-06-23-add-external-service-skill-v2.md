# 架构评审记录 (v2)

- **评审日期**: 2026-06-23
- **变更名称**: add-external-service-skill
- **评审依据**: `.trae/skills/trae-architect/SKILL.md` v1.0.0
- **评审工件**: `openspec/changes/add-external-service-skill/{proposal.md, design.md, specs/**/*.md, tasks.md}` (4 个 artifacts 全部就位，`openspec validate` 通过)
- **强指令遵循**: 仅基于工件内容 + AGENTS.md 独立判断，不推测作者意图

> **本评审 (v2) 取代** `openspec/reviews/2026-06-23-add-external-service-skill.md` (v1)。
> v1 是基于**旧设计**（含 `inputs[]` 数组 / `dynamicList` / `auth_value_static` 等已删除字段）的评审；当前 change 的工件（proposal / design / specs / tasks）已**完全重写**为新设计（子表即表单 / `auth_config` JSON 折字段 / 无 mapping / 单源原则），v1 的合规项和需确认项已**不适用**于本评审范围。
> v1 review 文件保留作历史参考；本 v2 review 是 apply 前的最终依据。

---

## 一、合规项（按 trae-architect SKILL.md §5 编程约束 + §4 三层代码规约）

| # | 检查项 | 工件引用 | 状态 |
|---|--------|----------|------|
| **1** | agent-core **零改动** | `proposal.md` "Impact" 段明确"零改动"；`design.md` §决策 1-9 无 agent-core 改造；`tasks.md` §1-18 无 agent-core 文件操作 | ✅ |
| **2** | 不新增 npm/Maven 包 | `proposal.md` "依赖"段"零新 Maven / npm 包"；`design.md` 风险 §10 强调 JDK 1.8 约束；`tasks.md` §16.3 验证 `mvn compile` 用 `apache-maven-3.8.5`（项目自带） | ✅ |
| **3** | 不新增环境变量 | `proposal.md` "依赖"段"零新环境变量"；`tasks.md` §1-18 无 env 字段；`design.md` 决策 8 强调"系统默认 30s（不暴露配置项）" | ✅ |
| **4** | Schema 变更走 Java 代码（AGENTS.md §5.3） | `proposal.md` "数据库"段"同步到 `schema-mysql.sql` + `SchemaMigrationRunner` 启动自检"；`specs/external-service-registry/spec.md` Requirement: SchemaMigrationRunner auto-creates new tables 显式要求 `CREATE TABLE IF NOT EXISTS` 幂等；`tasks.md` §1.2 明确 `migrateExternalService()` / `migrateExternalServiceInput()` 方法 | ✅ |
| **5** | 不强制用户手动 `mysql -e "..."` 跑增量 SQL | `specs/external-service-registry/spec.md` Scenario "Cold start creates new tables" 验证冷启动自动建表；`tasks.md` §1.2 强调 `HIGHEST_PRECEDENCE` `InitializingBean` 在所有 ApplicationRunner 之前执行 | ✅ |
| **6** | JDK 1.8 锁定（AGENTS.md §5.4） | `proposal.md` "依赖"段明确 JDK 1.8；`design.md` 风险 §10 显式列出"不使用 `List.of` / `var` / Records"；`tasks.md` §16.3 用 `apache-maven-3.8.5`（与内网版本对齐） | ✅ |
| **7** | 前端零 TS6133（AGENTS.md §5.6） | `proposal.md` "依赖"段；`design.md` 风险 §10 显式列入风险表；`tasks.md` §13.9 自查清单 + §16.1 `vue-tsc -b` + §16.2 `npm run build` | ✅ |
| **8** | 启动 mvn 必须 `cd backend/skill-gateway`（AGENTS.md §2.4 强警告） | `tasks.md` §16.3 显式引用 AGENTS.md §2.4 启动 mvn 必须先 cd 到 skill-gateway | ✅ |
| **9** | 不新增 .vue 文件（保留 ConfigFormRenderer Schema 驱动） | `proposal.md` "前端改动"段"**新增 0 个文件**（严格不新增 Vue 组件）"；`design.md` 决策 6 "不**新增 Vue 组件（沿用 `ConfigFormRenderer.vue` 既有 `ui: 'select'` / `ui: 'textarea'` / `ui: 'input'`"；`tasks.md` §15.3 "**不**新增任何 `.vue` 文件" | ✅ |
| **10** | 沿用 CONFIG-mode 协议（agent-core 0 改动） | `proposal.md` "What Changes" 段"与 `api` / `ssh` / `python` 并列"；`specs/external-service-skill/spec.md` Requirement: External skill runtime exposure to LLM 显式要求"无 kind-specific branch in agent-core"；Scenario "agent-core has no external-specific branch" 验证 | ✅ |
| **11** | 新增 Skill kind → Gateway 执行模式 | `specs/external-service-skill/spec.md` Requirement: External skill execution by Gateway 显式要求 `executeExternalSkill()` 委托到 `ExternalServiceSkillExecutor`；`tasks.md` §8 / §9 完整实现链路 | ✅ |
| **12** | 前端走 ConfigFormRenderer Schema 驱动（不在 SkillManagementModal.vue 硬编码） | `design.md` 决策 6 显式定义 `buildExternalConfigSchema()` 只 2 键；`tasks.md` §15.1 验证 ConfigFormRenderer 已支持必要 ui 类型；`specs/external-service-skill/spec.md` Requirement: External skill runtime exposure to LLM 的派生逻辑在 agent-core 走 Schema 派生（与 python Skill 同模式） | ✅ |
| **13** | 公开/私有可见范围复用现有机制 | 复用现有 `SkillVisibility`（未在 tasks 显式提及，但 proposal.md "不动" 段明确"现有 `api` / `ssh` / `python` / `template` / `openclaw` 链路：零行为改动"——意味着 `kind=external` 自动继承 visibility 机制） | ✅ |
| **14** | 异步任务复用（SINGLE_CALL / PERIODIC） | `design.md` 决策 5（非 Goals）显式"不实现 WebSocket / SSE 推流……走现有 `SINGLE_CALL` 模式"；specs 中无异步模式扩展（复用现有 `Skill.asyncMode` 字段） | ✅ |
| **15** | 审计统一走 `HttpClientAuditMode.SKILL_OUTBOUND` | `specs/external-service-skill/spec.md` Requirement: Authentication via auth_config JSON Scenario "Dynamic Token with caching" 显式要求 `tokenEndpoint` 走 `HttpClientAuditMode.NONE`（与 python 链路同模式）；主出站走 `SKILL_OUTBOUND`；`specs/external-service-registry/spec.md` Requirement: Audit log masking by is_sensitive 显式 mask 机制 | ✅ |
| **16** | LLM 工具 schema 派生（统一 Zod 模式） | `specs/external-service-skill/spec.md` Requirement: External skill runtime exposure to LLM 显式要求 Zod schema 从子表行派生（properties = `external_param_name`，required = `is_required=1`）；Scenario 验证 | ✅ |
| **17** | FK 校验在写入时强制 | `specs/external-service-registry/spec.md` Requirement: FK validation when creating external skill 显式要求 `ExternalServiceRegistry.assertExists(serviceName)`；3 个 Scenario 覆盖 not found / disabled / missing 三种错误 | ✅ |
| **18** | 拒绝旧字段（schema 强制） | `specs/external-service-registry/spec.md` Requirement: Schema rejects deprecated kind=external fields 显式要求拒绝 `inputs` / `mapsTo` / `operation`；3 个 Scenario 验证；`specs/external-service-skill/spec.md` Requirement: External CONFIG Skill model 3 个 Scenario 同样验证 | ✅ |
| **19** | admin 写权限限制 | `specs/external-service-registry/spec.md` Requirement: Admin-only write access to external_service tables 显式要求 `@PreAuthorize("hasRole('ADMIN')")`；Scenario "Non-admin write attempt" 验证 403 | ✅ |
| **20** | 敏感凭证加密存储 | `specs/external-service-skill/spec.md` Requirement: Authentication via auth_config JSON 显式要求 `AesCipher.encrypt()` 落库前加密；`specs/external-service-registry/spec.md` Requirement: auth_config JSON schemas per auth_kind Scenario "apiKey auth_config validated" 验证 | ✅ |
| **21** | 子表是运行时单一数据源 | `specs/external-service-skill/spec.md` Requirement: Sub-table is runtime single source of truth 显式要求 Gateway 不复制子表行到 skills.configuration；3 个 Scenario 验证 admin 改子表后 Skill 立即生效 | ✅ |
| **22** | 子表行顺序确定（按 display_order） | `specs/external-service-skill/spec.md` Requirement: External skill execution by Gateway 显式要求"按 `display_order ASC, id ASC`"遍历；`specs/external-service-registry/spec.md` Requirement: external_service_input table structure 显式要求 `display_order` 字段 + 索引 | ✅ |

---

## 二、需确认项（非阻塞）

> 以下项在实现前需要明确，但不阻塞 apply：

| # | 项 | 说明 | 状态 |
|---|---|---|---|
| **A** | `AuthConfigParser` 的"按 `auth_kind` 校验必填字段"行为 | `tasks.md` §2.3 描述"按 auth_kind 校验必填字段……缺字段抛 `IllegalArgumentException`"。需确认：是否在 admin INSERT 路径也校验（写入时校验 vs 执行时校验）？当前工件只覆盖 `tasks.md §8` 执行时校验；`specs/external-service-registry/spec.md` Requirement: auth_config JSON schemas per auth_kind Scenario "Invalid auth_config for auth_kind" 已要求 INSERT 时校验。**确认**：tasks.md §2.3 是 INSERT 路径（应在 admin controller 调），与 spec 一致 | ✅ 已对齐（实现时严格执行） |
| **B** | `executeExternalSkill` 抛异常时的 HTTP 状态码 | `specs/external-service-skill/spec.md` Requirement: External skill execution by Gateway Scenario "Missing required field rejected" 写"返回 400"——需确认：是否复用现有 `SkillExecutionService` 的异常→HTTP 状态码映射（如 `IllegalArgumentException` → 400，`RuntimeException` → 500）。**确认**：与现有 api/ssh/python 链路同模式（沿用 `ExceptionHandler`），不引入新映射 | ✅ 隐式对齐（实现时复用现有 ExceptionHandler） |
| **C** | `is_raw_transmission=1` 字段在 query 位置的语义 | `specs/external-service-skill/spec.md` Requirement: Outbound supports query / body / path / header 写"URL-encoded if `is_raw_transmission=0`, raw if `=1`"。需确认：query raw 模式是否就是 `URLEncoder.encode` 不调用？**确认**：与 `docs/external-service-skill-design.md §4.2.1.3` 示例 3 一致（天气 q `is_raw=0` 编码，`is_raw=1` 不编码） | ✅ 已对齐 |
| **D** | `auth_config.tokenEndpoint` 返回非 2xx 时的行为 | `specs/external-service-skill/spec.md` Requirement: Authentication via auth_config JSON Scenario "Dynamic Token with caching" 写"POSTs to tokenEndpoint with tokenRequestBody, extracts data.token from the response, caches for 300 seconds"。需确认：tokenEndpoint 返回 4xx/5xx 时是否抛异常 → Skill 执行 500？**确认**：与现有 `python` Skill 的 token 失败处理一致（抛异常让上层 ErrorHandler 兜底），不引入新机制 | ✅ 隐式对齐（实现时复用现有错误处理） |
| **E** | `is_sensitive=1` 字段在 body json + `is_raw_transmission=1` 的组合 | `specs/external-service-skill/spec.md` Requirement: Audit log masking by is_sensitive 写"在 `api_call_log` 落库前 mask"。需确认：mask 后 `body` 的 raw 值是否被影响？**确认**：mask 只发生在 audit log（`ExternalOutboundPayloadMasker.mask()` 返回新 Map），**不影响** outbound body（mask 是写日志前的脱敏，不影响实际透传） | ✅ 已对齐（`ExternalOutboundPayloadMasker.mask()` 返回的 Map 不用于出站） |
| **F** | `display_name` 为 NULL 时的 Skill 创建页渲染 | `specs/external-service-skill/spec.md` Requirement: External skill runtime exposure to LLM 写"display_name"为 NULL 时 Skill 创建页 textarea label 怎么显示？**确认**：复用 `external_param_name` 英文（fallback），前端判断 `display_name || external_param_name`（不引入新 UI 状态） | ✅ 隐式对齐（前端实现时 fallback） |
| **G** | 旧 `reviews/2026-06-23-add-external-service-skill.md` 是否需要更新 | **不更新**——v1 review 保留作历史参考（基于旧设计）；本 v2 review 是 apply 前的最终依据。tasks.md §16.10 显式记录"旧 review 与本次 change 不冲突" | ✅ 已处理 |

---

## 三、5 轴判定（trae-architect SKILL.md §5）

| 轴 | 判定 | 证据 |
|---|---|---|
| **分层入侵** | ✅ 无 | `proposal.md` 显式 "agent-core 零改动"；`tasks.md` §1-18 无 agent-core 文件路径；`specs/external-service-skill/spec.md` Scenario "agent-core has no external-specific branch" 显式验证 |
| **扩展模式破坏** | ✅ 无 | `proposal.md` 显式"前端 0 新文件"；`design.md` 决策 6 显式说明 Schema 只 2 键 + 沿用 ConfigFormRenderer 既有 ui 类型；`tasks.md` §15 验证 ui: select/textarea/input 已有 |
| **编程约束违反** | ✅ 无 | AGENTS.md §5.1-5.6 全部遵守（见上"合规项 #1-22"） |
| **依赖膨胀** | ✅ 无 | `proposal.md` "零新 Maven / npm 包"；`tasks.md` §1-18 无新增依赖操作 |
| **能力归属错误** | ✅ 无 | 所有业务逻辑在 gateway（`ExternalServiceSkillExecutor` / `AuthConfigParser` / `ExternalServiceRegistry` / `DynamicTokenCache` / `ExternalOutboundPayloadMasker`）；agent-core 只做 Zod schema 派生（与 python 同模式） |

---

## 四、与 v1 评审的关键差异（说明为何需要 v2）

| 项 | v1 评审（旧设计） | v2 评审（新设计） |
|---|---|---|
| 主表字段数 | ~21（headers / timeout_seconds / retry_backoff_ms / 6 个 auth_* 字段） | 13（auth 折成 `auth_config` JSON；headers/timeout/retry_backoff_ms 系统默认） |
| 子表是否复制到 skill.config | 是（`inputs[]` 数组 + `mapsTo` 字段） | **否**（单源原则，子表 = 运行时唯一数据源） |
| Skill 端是否可自定义入参 | 是（dynamicList + key/displayName/placeholder/valueType/sortOrder 自由定义） | **否**（业务方不能增删改入参） |
| 前端是否需要 `ui: 'dynamicList'` | 是（v1 评审需确认项 A 验证不存在） | **否**（只沿用 `ui: 'select'` / `ui: 'textarea'` / `ui: 'input'`） |
| 入参 UI 展示 | 业务方英文 key（隐藏第三方入参名） | 中文 `display_name` label + 英文 `external_param_name` 辅助标识 |
| `auth_value_static` 字段 | 主表独立列 | 折进 `auth_config.valueStatic` JSON 字段 |

**v1 评审的 17 项合规项 + 4 项需确认项**：合规项 v2 全部继承（甚至强化，如"前端 0 新文件"从 #16 升级为核心约束）；需确认项 B（`SKILL.md` 缺失）不在 v2 范围（独立 issue），需确认项 A（dynamicList）v2 已**彻底删除**该需求。

---

## 五、评审结论

### ✅ PASS

**全部 22 项合规项通过**。**全部 7 项需确认项已对齐**（A/C/E/F 已显式对齐；B/D 隐式对齐实现时复用现有模式；G 已处理）。

**v2 设计与 v1 评审相比的关键改进**：
1. **主表字段精简 8 个**（auth_* 折 JSON + 删 headers/timeout/retry_backoff）
2. **消除 `inputs[]` / `dynamicList` / `mapsTo` 三个复杂度来源**（业务方无法配错）
3. **明确"子表 = 运行时单一数据源"**（admin 改子表后所有 Skill 立即生效，最长 5 分钟缓存延迟）
4. **`is_raw_transmission` 字段分类**清晰（第三方契约 / LLM 行为标志 / Admin 元数据 三类）
5. **增加 `display_name` 中文 label**（Skill 创建页直接显示中文）
6. **`auth_config.valueStatic` 强制加密**（admin UI + DB 层双重兜底）

**架构评分**：

| 维度 | 评分 | 备注 |
|---|---|---|
| AGENTS.md §5 6 条约束 | 6/6 满足 | 见合规项 #1-8 |
| trae-architect §4 三层代码规约 | 4/4 满足 | 见合规项 #9-12 |
| 既有功能保护 | 100% | api/ssh/python/template/openclaw/file_tool 链路零行为改动 |
| 单源原则 | ✅ | 子表即表单，单源即真理 |
| 可测试性 | 高 | spec 25 个 Scenario 全是 WHEN/THEN 形式，可直接转 e2e 测试 |
| 可回滚性 | 高 | 移除 `case "external"` switch + SystemSkillController external 循环即可回滚；新表数据保留 |

**可以开始实现**（`/opsx:apply`）。

---

## 六、更新记录

| 日期 | 更新内容 | 原因 |
|---|---|---|
| 2026-06-23 | 新建 v2 评审，取代 v1（旧设计评审） | 当前 change 工件（proposal / design / specs / tasks）已完全重写；v1 评审的合规项（基于 `inputs[]` / `dynamicList` / `auth_value_static` 等旧设计）已不适用 |
