# 架构评审记录

- **评审日期**: 2026-06-29
- **变更名称**: add-external-service-skill
- **评审依据**: .trae/skills/trae-architect/SKILL.md v1.0.0
- **评审工件**:
  - `openspec/changes/add-external-service-skill/proposal.md`（88 行）
  - `openspec/changes/add-external-service-skill/design.md`（151 行，10 个 Decision）
  - `openspec/changes/add-external-service-skill/specs/external-service-registry/spec.md`（398 行）
  - `openspec/changes/add-external-service-skill/specs/external-service-skill/spec.md`（406 行）
  - `openspec/changes/add-external-service-skill/tasks.md`（296 行，20 节 200+ 子任务）
- **参考约束**: `AGENTS.md`（§5.1~§5.6 六条编程约束）、`backend/doc/technical-design.md`（Thin Agent / Thick Tools 双层架构）

---

## 合规项（✅ PASS）

### proposal.md（10/10 通过）

| # | 检查项 | 结果 | 依据 |
|---|--------|------|------|
| 1 | 变更是否涉及 agent-core 代码修改 | ✅ | proposal.md「不动」段明确：`backend/agent-core/`：**零改动** |
| 2 | agent-core 改动时是否附「为什么不能走 Tool 接入」说明 | N/A | 无 agent-core 改动，无需说明 |
| 3 | 是否新增 npm/Maven 包 | ✅ | proposal.md「依赖」段明确「零新 Maven / npm 包」 |
| 4 | 新增包时是否附评审理由 | N/A | 无新增 |
| 5 | 是否新增环境变量 | ✅ | proposal.md「依赖」段明确「零新环境变量」 |
| 6 | 变更类型是否与现有 Skill kind 冲突 | ✅ | `external` 是新类型，与 `api` / `ssh` / `python` / `template` / `openclaw` / `file_tool` 并列无重叠 |
| 7 | Capabilities 是否分类清晰 | ✅ | 新增 2 个 Capability：`external-service-skill`（Skill 侧）/ `external-service-registry`（Admin 侧）|
| 8 | Impact 是否列出后端/前端/数据库/部署/依赖全维度 | ✅ | 13 新增文件 + 5 修改文件 + 0 前端新增 + 0 agent-core 改动 + DB 迁移 + 部署步骤 + 回滚策略全列 |
| 9 | Migration Plan 是否包含 DDL 自动化 | ✅ | proposal.md「部署步骤」+ design.md Migration Plan 都强调 `SchemaMigrationRunner` 启动自检（AGENTS.md §5.3 模式）|
| 10 | Open Questions 是否已清理 | ✅ | design.md 末尾写「无——所有关键决策已固化」 |

### design.md（10/10 通过）

| # | 检查项 | 结果 | 依据 |
|---|--------|------|------|
| 1 | 技术方案是否遵循「新增 Skill kind → Gateway 执行」 | ✅ | Decision 1 + ExternalServiceSkillExecutor 独立 `@Service` 在 Gateway，agent-core 仅透传 |
| 2 | 前端方案是否走 ConfigFormRenderer Schema 驱动 | ✅ | Decision 6 明确「不实现 `ui: 'dynamicList'`」「**不**新增 Vue 组件」「沿用 ConfigFormRenderer 既有 `ui: 'select'` / `ui: 'textarea'` / `ui: 'input'`」|
| 3 | 是否违反 JDK 1.8 约束 | ✅ | tasks.md §16.3 明确 `mvn -DskipTests compile` JDK 1.8 编译验证；代码示例用 `Arrays.asList` / `LinkedHashMap` 等 1.8 兼容 API |
| 4 | 是否违反零 TS6133 约束 | ✅ | tasks.md §13.9 自查项 + §16.1 vue-tsc -b 验证 + §19.8.7 二次验证 |
| 5 | 是否有跨层调用或职责错位 | ✅ | 「Thin Agent, Thick Tools」清晰分层；agent-core 0 改动；Gateway 持有凭证 + 执行；frontend 走 Schema 驱动 |
| 6 | Decision 数量是否与决策复杂度匹配 | ✅ | 10 个 Decision（数据源 / is_raw_transmission / 精简主表 / 子表分三类 / 创建页映射 / Schema 简化 / 审计脱敏 / 重试超时 / 缓存 / 空数据兜底），每个决策都有「理由 + 备选 + trade-off」三段式说明 |
| 7 | 是否覆盖所有关键架构风险 | ✅ | Risks 表 12 项，每项标注「严重度 + 缓解」|
| 8 | 缓存策略是否有失效兜底 | ✅ | Decision 9: 启动加载 + 5 分钟 TTL + `invalidateAll()` / `invalidateService()` API |
| 9 | 空数据场景是否有兜底 | ✅ | Decision 10 完整列出 8 条兜底原则 + 6 个关键代码路径；tasks.md §19 30+ 子任务；specs 双 spec 各新增 3-4 个 Requirement |
| 10 | 回滚策略是否清晰 | ✅ | Migration Plan「回滚策略」段：移除 2 处代码 + 保留新表 + 不影响现有链路 |

### specs/（6/6 通过）

| # | 检查项 | 结果 | 依据 |
|---|--------|------|------|
| 1 | external-service-registry spec 是否覆盖全 schema/CRUD/缓存/迁移/权限 | ✅ | 14 个 Requirement 覆盖：表结构 + auth_config JSON schema + 子表结构 + Admin CRUD + 公开读接口 + List 过滤 + SchemaMigrationRunner + FK 校验 + Schema 拒绝旧字段 + Admin-only 写 + 迁移加性 + 空表不影响 + 空 null 防御 + 404 处理 + 参数名一致性 |
| 2 | external-service-skill spec 是否覆盖全 Skill/执行/认证/重试/响应 | ✅ | 13 个 Requirement 覆盖：CONFIG 模型 + 子表单一数据源 + agent-core LLM 暴露 + Gateway 执行 + 4 种 param_location + auth 4 种 + 重试 + 响应格式 + 审计脱敏 + 链路追踪 + 缓存 + 空子表 + null 防御 + 空 audit + 参数名透传 |
| 3 | 新增 requirements 是否与现有 Skill 类型冲突 | ✅ | 明确「不强制改造 python Skill」「保留兼容性，二者可并存」（design.md Non-Goals）|
| 4 | 是否将应由 Gateway 承担的能力放入 agent-core | ✅ | spec/external-service-skill Requirement: External skill runtime exposure to LLM 明确「MUST NOT contain any `if (config.kind === 'external')` branch」— 与 AGENTS.md §5.5 一致 |
| 5 | requirements 格式合规（### Requirement + #### Scenario + WHEN/THEN）| ✅ | 27 个 Requirement 全部符合格式；Scenario 全部 WHEN/THEN/AND 结构 |
| 6 | 空数据场景 + 参数名一致性是否有独立 Requirement | ✅ | external-service-registry spec: 3 个空数据 Requirement + 1 个参数名一致性 Requirement；external-service-skill spec: 4 个空数据 Requirement + 1 个参数名透传 Requirement（每个 5-7 Scenario）|

### tasks.md（6/6 通过）

| # | 检查项 | 结果 | 依据 |
|---|--------|------|------|
| 1 | 实现路径是否匹配各层代码规约 | ✅ | §1 数据库 / §2-8 服务层 / §9-12 Controller / §13-15 前端 — 完全对应 backend/frontend 三层结构 |
| 2 | 是否有遗漏的迁移步骤 | ✅ | §1.1 schema-mysql.sql DDL + §1.2 SchemaMigrationRunner 启动自检 — 双保险（AGENTS.md §5.3）|
| 3 | 是否新增了不必要的文件 | ✅ | 13 个新增文件全部职责清晰（2 entity + 2 mapper + 2 xml + 3 dto + 5 service + 1 masker + 2 controller）；前端 0 新增 |
| 4 | 是否有 JDK 1.8 / TS6133 自查 | ✅ | §16.1-16.3 三道编译验证关 + §19.8.7 / §20 二次验证 |
| 5 | §19 空数据兜底 + §20 参数名一致性是否覆盖全 | ✅ | §19 共 9 个子节 50+ 子任务；§20 共 6 个子节 25+ 子任务；两个强约束各自独立成节 |
| 6 | 部署与冒烟测试是否完整 | ✅ | §18 部署 10 个冒烟步骤 + §16 自查 10 项 |

### AGENTS.md 6 条约束（6/6 通过）

| # | 约束 | 结果 | 证据 |
|---|------|------|------|
| 5.1 | 不新增第三方包 | ✅ | proposal.md「依赖」段、tasks.md 全文件未引入任何 Maven/npm 包 |
| 5.2 | 不新增环境变量 | ✅ | 同上 |
| 5.3 | Schema 变更走代码 | ✅ | tasks.md §1.1-1.2 用 `SchemaMigrationRunner.ensureColumn` 模式 |
| 5.4 | JDK 1.8 锁定 | ✅ | tasks.md §16.3 强制 `mvn -DskipTests compile` JDK 1.8 验证；代码示例均用 1.8 API |
| 5.5 | 不改 agent-core | ✅ | proposal.md「不动」段明确；spec Requirement: External skill runtime exposure to LLM 明确禁止 agent-core 加 kind 分支 |
| 5.6 | 零 TS6133 | ✅ | tasks.md §13.9 / §16.1 / §19.8.7 三道验证关 |

### 「不合理设计」5 轴判定模型（5/5 通过）

| 轴 | 结果 | 判定 |
|---|------|------|
| 分层入侵 | ✅ | agent-core 0 改动；新能力完全在 gateway |
| 扩展模式破坏 | ✅ | 走 ConfigFormRenderer Schema 驱动；不硬编码 |
| 编程约束违反 | ✅ | AGENTS.md 6 条全过 |
| 依赖膨胀 | ✅ | 零新包 |
| 能力归属错误 | ✅ | 执行能力在 Gateway；凭证在 Gateway；agent-core 仅透传 |

---

## 违规项

**无。**

---

## 关注项（非阻塞，需在归档前确认）

### ⚠️ 关注项 1：两个 spec.md 的 Purpose 段是 OpenSpec 模板占位符

- **位置**: `openspec/changes/add-external-service-skill/specs/external-service-registry/spec.md` 第 1-3 行、`specs/external-service-skill/spec.md` 第 1-3 行
- **当前**: `## Purpose\nTBD - created by archiving change add-external-service-skill. Update Purpose after archive.`
- **建议**: 归档前/中替换为正式 Purpose 描述（一句说明 spec 能力 + 引用 OpenSpec change）
- **严重度**: 低（OpenSpec 模板自带占位符，归档流程会自动处理）

### ⚠️ 关注项 2：agent-core 动态生成 Zod schema 的机制说明不充分

- **位置**: `specs/external-service-skill/spec.md` Requirement: External skill runtime exposure to LLM
- **原文**: "agent-core's Zod schema for this tool's inner payload is `z.object({ q: z.string(), units: z.string().optional(), lang: z.string().optional() })`"
- **疑问**: proposal.md 明确「agent-core 0 改动」，但 spec 又要求「agent-core 动态生成 Zod schema（按子表行）」—— 这两个说法是否冲突？
- **可能解释**:
  - 选项 A: agent-core 已有通用的「CONFIG-mode Extension 动态 schema 派生机制」（agent-core 既有能力），只是 skill 类型从 4 种扩到 5 种，零代码改动
  - 选项 B: 需要在 agent-core 加一个小的「external-service 子表行 → Zod schema」派生 helper（轻微代码改动）
- **建议**: 在 proposal.md 或 design.md 中明确说明 agent-core 的具体复用机制（与 `api` / `ssh` / `python` 现有 CONFIG-mode 派生的对比），避免实施时误判
- **严重度**: 中（影响实施期对 agent-core 是否需要改动的判断）

### ✅ 关注项 2 已解决（2026-06-29 用户确认后追加）

**解决方案**：

经用户确认 + 源码核查（[`Skill.java::computeSchemaPropertiesInternal()`](file:///d:/IdeaProjects/bxdc-bot/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/entity/Skill.java) + [`java-skills.ts::buildSkillZodSchema()`](file:///d:/IdeaProjects/bxdc-bot/backend/agent-core/src/tools/java-skills.ts)），机制已澄清：

1. **Gateway 端派生**：`Skill.computeSchemaPropertiesInternal()` 已支持从 `parameterContract`（api/python）派生 schemaProperties。本次新增 `kind=external` 分支：从 `external_service_input` 子表派生 `properties` + `required`（字符级一致的 `external_param_name` 作为 property key）。
2. **agent-core 端消费**：`buildSkillZodSchema(config, schemaProperties)` 直接读 schemaProperties Map，**不**关心 `kind`，走通用 CONFIG-mode 路径。
3. **入口零代码改动**：agent-core 的 `loadGatewayExtendedTools()` → `GET /api/skills` → 拿到 `skill.schemaProperties` → 派生 Zod → 注册为 `DynamicStructuredTool`，**全程无 external 特定代码**。
4. **写入零代码改动**：LLM 调用工具时，agent-core 走既有 `POST /api/skills/execute`，**不**做 kind 分支；Gateway `SkillExecutionService.execute()` switch 才有 `case "external"`。

**实施路径**（已落入 design.md Decision 11 + tasks.md §11.5）：

- 在 `Skill.java::computeSchemaPropertiesInternal()` 末尾新增 `else if ("external".equals(kind))` 分支（**推荐方案**：返回 null 哨兵，由 `SkillService.createOrUpdate()` 检测后调 `externalServiceSkillExecutor.deriveSchemaProperties(skill)` 补全，避免 entity 静态方法依赖 Spring bean）
- `ExternalServiceSkillExecutor` 新增 `deriveSchemaProperties(Skill skill)` 方法：从 `skill.configuration.serviceName` → registry → 子表行 → 派生 `{properties, required}`
- 现有 case（api/python）的 `parameterContract` 派生逻辑**完全不变**
- agent-core 实施后 `git diff backend/agent-core/` 应为空

**已更新到 4 个工件**：

- `proposal.md`「不动」段后追加「agent-core 0 改动实现机制」段（机制 + 与 api/python 对比）
- `design.md` 决策 10 后追加「决策 11：agent-core 0 改动机制 — Gateway `Skill.computeSchemaPropertiesInternal()` 派生 schemaProperties」（含与 api/python 对等性证据表）
- `specs/external-service-skill/spec.md` Requirement: External skill runtime exposure to LLM 重写为 Gateway 派生语义，6 个 Scenario（含 agent-core files unchanged 验证）
- `tasks.md` 在 §11 后新增「§11.5 Skill.computeSchemaPropertiesInternal() 派生 external schemaProperties」4 个子节 17 个子任务（含 `git diff` 验证 + 端到端测试 + 4 种 kind 对等性回归）

**关注项 2 现状态：✅ 已解决，无残留风险**

### ⚠️ 关注项 3：ConfigFormRenderer 与子表只读预览区的边界需明确

- **位置**: `tasks.md §14` 与 `§15`
- **现状**: `serviceName` select + `interfaceDescription` textarea 走 ConfigFormRenderer；子表行（多个 textarea）走「只读预览区」，**不**走 ConfigFormRenderer
- **疑问**: 子表只读预览区的代码位置在哪？是 `SkillManagementModal.vue` 内联渲染，还是复用某个已有组件？
- **建议**: tasks.md §14.x 明确「子表预览区在 SkillManagementModal.vue 内联渲染（v-for + display_name + textarea disabled）」，并标注**不**抽出新组件（与「前端 0 新增 Vue 组件」一致）
- **严重度**: 低（实施细节，不影响架构合规）

### ⚠️ 关注项 4：AesCipher 加密工具的封装与轮换策略未文档化

- **位置**: `proposal.md` 提到 `auth_config.valueStatic` 用 `AesCipher.encrypt()` 加密，但未在 design 或 spec 中说明加密密钥的来源、轮换策略、灾难恢复路径
- **建议**: 在 `docs/external-service-skill-design.md` 或 spec 中加一段「密钥管理」说明（即使沿用现有 `AesCipher`，也需标注密钥配置位置 + 轮换 SOP + 数据不可恢复风险）
- **严重度**: 低（沿用现有工具，但密钥管理是高敏感度，应有专门章节）

### ⚠️ 关注项 5：`api_call_log` 与 `gateway_outbound_audit_log` 的分工未明确

- **位置**: `specs/external-service-skill/spec.md` 多个 Scenario 提到「audit log records」或「`api_call_log`」
- **现状**: `docs/external-service-skill-design.md` §4.7 引用了 `GatewayOutboundAuditLog` 实体（已在平台功能全貌 §11 列出）
- **建议**: 在 spec Requirement: Audit log masking 中明确「`api_call_log` = 现有工具调用日志（已存）」vs「`gateway_outbound_audit_log` = 本次出站审计新表」，避免实施时审计落表混乱
- **严重度**: 低（实施细节，文档应说明但不影响架构）

---

## 总体评价

### 架构合规性：**优秀**

本次 change 完整遵守 bxdc-bot 平台的「Thin Agent, Thick Tools」双层架构原则：

1. **新能力完全在 Gateway 落地**：ExternalServiceRegistry + ExternalServiceSkillExecutor + DynamicTokenCache + RetryableHttpClient + AuthConfigParser + ExternalResponseFormatter + ExternalOutboundPayloadMasker 7 个新 `@Service` 全部在 `backend/skill-gateway/`，agent-core 0 改动 — 完美符合「升级 SSH 库不动 Agent 代码；优化 Prompt 不重启 Java 服务」的解耦目标

2. **走 Schema 驱动表单**：serviceName select + interfaceDescription textarea 完全沿用 ConfigFormRenderer.vue 既有 `ui: 'select'` / `ui: 'textarea'`；前端 0 新增 .vue 文件 — 完美符合「禁止在 SkillManagementModal.vue 中为新型 Skill 硬编码模板」的扩展模式约束

3. **严格遵守 AGENTS.md 6 条约束**：零新包 / 零新环境变量 / SchemaMigrationRunner 模式 / JDK 1.8 锁定 / 零 agent-core 改动 / 零 TS6133 — 6 项全过

4. **需求强约束已纳入设计**：
   - **空数据兜底**（用户上一轮追加）：design.md Decision 10 + tasks.md §19 + specs 双 spec 各 3-4 个 Requirement + design.md §17 — 完整覆盖 12 条自检 checklist
   - **参数名一致性**（用户上上轮追加）：design.md Risks + tasks.md §20 + specs 双 spec 各 1 个 Requirement（共 14 个 Scenario）— 完整覆盖字符级一致 / 大小写 / snake_case / 不存在 mapsTo / 配错责任划分

5. **可追溯审计链**：评审结果记录到 `openspec/reviews/2026-06-29-add-external-service-skill.md`（本文），与旧 `2026-06-23` review（基于旧设计）分离，形成审计链

### 关键风险

唯一的「中严重度」关注项 2（agent-core 动态 Zod schema 机制说明）需要在 apply 前澄清。其他 4 个关注项都是「低严重度」的实施细节，可在归档阶段补充。

### 后续动作建议

- **可立即 apply**（**关注项 2 已解决**）：所有合规项 + 设计决策已完整记录，可执行 `openspec-apply-change add-external-service-skill`
- **apply 阶段自查清单**：
  - tasks.md §11.5.3.1 `git diff backend/agent-core/` 应为空（**最关键**：agent-core 0 改动验证）
  - tasks.md §16.1 vue-tsc -b 通过
  - tasks.md §16.2 npm run build 退出码 0
  - tasks.md §16.3 mvn compile JDK 1.8 通过
  - tasks.md §19.9.6-19.9.9 空数据自检 4 项（创建 api Skill 不变 / 创建 external Skill 拒绝 / 子表空创建成功 / 子表空 LLM 调用出站成功）
  - tasks.md §20.6.5-20.6.11 参数名一致性自检 7 项（schema key 一致 / 出站 key 一致 / 大小写 / snake_case / 特殊字符）
- **归档前补充**：
  - spec 两个 Purpose 段（关注项 1）
  - AesCipher 密钥管理章节（关注项 4）
  - api_call_log vs gateway_outbound_audit_log 分工说明（关注项 5）

---

## 结论

**PASS** ✅

理由：
1. 所有合规项通过（proposal 10/10 + design 10/10 + specs 6/6 + tasks 6/6 + AGENTS.md 6/6 + 5 轴 5/5 = 43/43）
2. 无违规项
3. 5 个关注项中**唯一中严重度**的关注项 2（agent-core 0 改动机制）已通过用户确认 + 源码核查解决
4. 剩余 4 个关注项（关注项 1 / 3 / 4 / 5）均为「低严重度」的实施细节，可在归档前补充
5. 用户两轮追加的强约束（空数据兜底 + 参数名一致性）已在 design / specs / tasks 三处完整覆盖
6. 用户第三轮追加的强约束（**agent-core 0 改动**）已通过「Gateway `Skill.computeSchemaPropertiesInternal()` 单点派生 schemaProperties」机制完整闭环

**可执行 `openspec-apply-change add-external-service-skill`**（apply 阶段最关键的自查项：`git diff backend/agent-core/` 应为空）。