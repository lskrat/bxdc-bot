## Context

- 除磁盘 `SKILL.md` 外，产品侧还存在**非文件系统来源**的 Skill（例如数据库持久化、经 API/BFF 下发），这些 Skill 同样会进入 Agent tools 与（兼容模式下）系统 prompt 的技能相关段落。
- 用户设置已有「用户级 LLM 参数」等持久化模式可参考（鉴权、按 `userId` 隔离）。
- 需求：**已登录**用户在 UI 列表中切换「可配置 Skill」的可用状态后，运行时对**该子集**的 tools 与兼容模式下的技能相关系统文案必须同步收缩。磁盘 `SKILL.md` Skill **不在**本功能范围内。

## Goals / Non-Goals

**Goals:**

- **仅登录用户**可查看当前**可配置（非文件系统）** Skill 列表，并逐项切换可用状态；状态持久化，跨会话生效。
- 对带有 `userId` 的 Agent 任务，针对可配置 Skill 子集：绑定到模型的对应工具集合与系统消息中的技能摘要 / 兼容模式「可用工具」中与**该子集**相关的条目一致，且**仅包含**可用 Skill。
- 默认可配置 Skill：未配置过可用性时，等价于「该子集内全部可用」。
- 匿名用户：**不支持**调用 Skill 可用性读写 API，也不提供匿名侧持久化或 localStorage 同步。

**Non-Goals:**

- **不**将仓库磁盘 `SKILL.md` 扫描得到的 Skill 纳入用户可配置列表，也**不**通过 `disabled_skill_ids` 对其进行过滤；其行为保持现有实现。
- 不改变记忆、通用网关工具等非「可配置 Skill」工具的既有绑定策略，除非实现上天然共用同一过滤入口（若共用，规范在 spec 中单独说明）。
- 不在本变更中重新定义 `SKILL.md` 的扫描与解析规则。

## Decisions

1. **持久化模型：按用户存储「禁用列表」**  
   - **内容**：使用 `disabled_skill_ids: string[]`（或等价），与 `RegisteredSkill.id` 对齐；空数组表示无禁用即全部可用。  
   - **理由**：与新 Skill 默认「可用」一致，避免每增一个 Skill 都要回写用户 allowlist。  
   - **备选**：仅存 `enabled_skill_ids` allowlist——新 Skill 默认不可用，需额外规则才能符合「默认全部可用」。

2. **过滤作用点：可配置 Skill 的注册/组装路径统一过滤**  
   - **内容**：在生成可配置 Skill 对应的 LangChain tools、以及写入系统消息的技能摘要（或等价方法）的路径上，当且仅当任务带有效 `userId` 时，加载该用户的禁用集合并过滤；兼容模式序列化 tools 文本时使用同一集合。文件系统 Skill 走原路径，不参与本过滤。  
   - **理由**：单一事实来源，避免 tools 与 prompt 不一致，且与「仅非文件系统 Skill」范围对齐。  
   - **备选**：仅在网关层删工具——易与 `agent-core` 内部拼接的系统消息脱节。

3. **API 形态：REST 与用户设置并列**  
   - **内容**：`GET/PATCH` 当前用户的 Skill 可用性（body 为禁用 id 列表或增量更新）；**必须**要求已登录身份；匿名请求 MUST 被拒绝。  
   - **理由**：设置页可独立拉取与保存，任务创建无需重复传大 payload，且与「不支持匿名」一致。  
   - **备选**：每次 `POST /api/tasks` 携带 `enabledSkillIds`——减少存储但增加客户端负担与一致性问题。

4. **标识符**：禁用集合中的 id MUST 与运行时**可配置（非文件系统）** Skill 的稳定标识一致（例如数据库主键或业务 id，以实现为准并在 API 文档中说明）；MUST NOT 依赖磁盘路径或 `SKILL.md` 目录名作为本功能的唯一 id（除非实现证明二者重合且稳定）。

## Risks / Trade-offs

- **[Risk] 用户禁用某 Skill 后，历史对话记录仍可能提及该 Skill** → 仅影响新任务绑定，不在此变更中回溯修改历史消息。  
- **[Risk] Skill 重命名导致禁用项失效** → Mitigation：文档说明 id 稳定性；可选后续增加迁移或 UI 提示「未知 id 可清理」。  
- **[Trade-off] 多来源非文件系统 Skill** → 若存在多种注册通道（例如不同 executionMode），需在同一「可配置列表」中统一 id 空间或分栏展示；本变更**明确排除**文件系统 `SKILL.md` Skill。

## Migration Plan

1. 数据库：新增用户级字段或侧表，默认 NULL/空表示「无禁用」。  
2. 部署：先迁移再发版前后端；旧客户端未带新 UI 时行为仍为全部可用。  
3. 回滚：保留列兼容读；回滚代码后忽略该字段即可恢复全量绑定。

## Open Questions

- 可配置 Skill 的精确枚举（例如是否包含某一类 DB Skill、是否含只读系统 Skill）由实现阶段对照代码库划定，并写入正式 `openspec/specs` 的 Purpose/Requirements。
