# 架构评审记录 (v1, **已被 v2 取代**)

> ⚠️ **本评审 (v1) 基于旧设计稿（`docs/external-service-skill-design.md` 早期版本，含 `inputs[]` 数组 / `dynamicList` / `auth_value_static` 等字段）**。
>
> 当前 OpenSpec change `openspec/changes/add-external-service-skill/` 的工件（proposal / design / specs / tasks）已**完全重写**为新设计（`auth_config` JSON / 无 `inputs[]` / 单源原则 / `display_name` 中文 label / `is_raw_transmission` 三类字段分类）。
>
> **v1 评审的合规项和需确认项已不适用**——v1 仅作历史参考。
>
> **当前 apply 前的最终评审依据是 [`openspec/reviews/2026-06-23-add-external-service-skill-v2.md`](file:///d:/IdeaProjects/bxdc-bot/openspec/reviews/2026-06-23-add-external-service-skill-v2.md)**（v2 基于 trae-architect SKILL.md v1.0.0 强指令独立评审，22 项合规项全通过）。

---

**评审日期**：2026-06-23
**变更名称**：add-external-service-skill
**结论**：✅ **PASS**（基于旧设计；新设计 v2 评审见上）

---

## 合规项

| # | 检查项 | 来源 | 状态 |
|---|---|---|---|
| 1 | agent-core **零改动** | proposal.md「不改动 agent-core」；design.md 决策 4「agent-core 和前端不变」 | ✅ |
| 2 | 新增 Skill kind → Gateway 执行 | design.md 决策 4；tasks.md §5（ExternalServiceSkillExecutor）；§8（SkillExecutionService switch） | ✅ |
| 3 | 前端走 Schema 驱动，不在 SkillManagementModal.vue 硬编码模板 | tasks.md §10-11（skillEditor.ts + SkillManagementModal.vue 扩展）；design.md 决策 4「前端只渲染表单」 | ✅ |
| 4 | tasks.md **不新增 npm/Maven 包** | tasks §6.1 明确「复用现有 ApiProxyService.callApi() 内部实现，无新依赖」 | ✅ |
| 5 | tasks.md **前端不新增 .vue 文件** | tasks.md §9「在 ConfigFormRenderer.vue 中新增 ui 分支，不新建 .vue 文件」 | ✅ |
| 6 | design.md **不提及新增环境变量** | 全文无 env 相关内容 | ✅ |
| 7 | proposal.md 明确 agent-core 无修改 | proposal.md「agent-core 零改动」 | ✅ |
| 8 | tasks.md 遵循 JDK 1.8 | design.md 风险「不使用 List.of()、var、Records」 | ✅ |
| 9 | 表结构通过 SchemaMigrationRunner 启动自检 | tasks.md §1.2；design.md 迁移计划；遵循 AGENTS.md §5.3 | ✅ |
| 10 | 两张表 FK 约束与唯一键 | spec.md external-service-registry「唯一键 (service_id, external_param_name)」 | ✅ |
| 11 | admin 写权限限制 | spec.md「写权限仅限管理员」；tasks §3.3 验证 403 | ✅ |
| 12 | `auth_value_static` 加密存储 | design.md 决策 5；spec.md 场景「读取时解密 auth_value」 | ✅ |
| 13 | 迁移计划包含回滚方案 | design.md「移除 external Schema 注册，无需删除数据」 | ✅ |
| 14 | 前端 TS6133 自查清单 | tasks.md §12.2-12.3；AGENTS.md §5.6 | ✅ |
| 15 | Skill 出站审计走 SKILL_OUTBOUND 模式 | spec.md「HttpClientAuditMode.SKILL_OUTBOUND」；tasks §6.3 | ✅ |
| 16 | ConfigFormRenderer 扩展 ui 类型不算"新增 Vue 组件" | design.md 决策 6；tasks §9；在现有 `ConfigFormRenderer.vue` 内新增 `ui: 'dynamicList'` 模板分支和脚本方法，**不新建 .vue 文件** | ✅ |
| 17 | `auth_token_endpoint` 调用走 `HttpClientAuditMode.NONE` | design.md 决策 7；tasks §6.4；避免污染 `api_call_log` 审计日志，与 `python` 链路同模式 | ✅ |

---

## 需确认项（非阻塞）

> 以下项在实现前需要明确，但不阻塞 apply：

| # | 项 | 说明 | 状态 |
|---|---|---|---|
| **A** | `ui: 'dynamicList'` 是否已在 ConfigFormRenderer.vue 中实现 | **已确认：不存在**。现有 ConfigFormRenderer.vue 支持：checkbox / radio / input / select / number / textarea / jsonEditor / keyValue，**没有** dynamicList。已更新 design.md（决策 6）、tasks.md（新增 §9），明确在 `ConfigFormRenderer.vue` 中新增 `ui: 'dynamicList'` 模板分支和脚本方法（**不新建 .vue 文件**，扩展现有组件）；proposal.md 影响范围已同步更新。**实现时严格按 tasks §9 落地** | ✅ 已处理 |
| **B** | `SKILL.md` 文件缺失 | `.trae/skills/trae-architect/SKILL.md` 不存在（不在本次 change 范围内），但 `openspec/specs/trae-architect-review/spec.md` 明确要求此文件存在。SKILL.md 需单独补充，包含完整功能清单和架构规则 | ⏳ 待处理（不在本次 apply 范围） |
| **C** | 设计稿路径引用 | design.md §1 引用 `docs/external-service-skill-design.md`，tasks.md §13.1 要求「将最终设计稿复制到 docs/」。确保该 md 文档存在且内容最新（目前存在） | ✅ 已确认 |
| **D** | `inputs[].sortOrder` 字段在 spec 中未定义默认值 | spec.md external-service-skill 的 inputs 数组定义中 `sortOrder` 有但未说默认值；external-service-registry 表结构 spec 中 `sort_order` 默认 0。确认两侧默认值一致（均为 0） | ✅ 已处理 |

---

## 更新记录

| 日期 | 更新内容 | 原因 |
|---|---|---|
| 2026-06-23 | 新增合规项 #16「ConfigFormRenderer 扩展 ui 类型不算新增 .vue 文件」+ #17 auth audit NONE；需确认项 A/D/E 标记为 ✅ 已处理，B 为 ⏳ 待处理（不在本次 apply 范围） | 用户确认 ConfigFormRenderer.vue 不存在 dynamicList，需实现；auth_token_endpoint 审计模式已明确为 NONE；sortOrder 默认值统一为 0 |

---

## 评审结论

全部 17 项架构合规检查通过。应确认项 A/E 已处理，B 待单独处理（不在本次 change 范围）。可以直接运行 `/opsx:apply` 开始实现。
