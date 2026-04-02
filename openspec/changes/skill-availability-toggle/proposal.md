## Why

当前非文件系统来源的 Skill（例如数据库中维护、经网关/BFF 暴露的 Skill）会与其它工具一并绑定进 Agent，并在兼容模式下进入系统消息中的「可用工具 / 技能摘要」。当 Skill 数量增多或部分 Skill 仅适用于特定场景时，模型容易被无关工具分散注意力，也会增加 prompt 与 tools 体积。需要由**已登录**用户在可理解的列表中显式选择「当前可用」的 Skill，使运行时只暴露被选中的子集。

**范围说明（已定）**：本变更**不**覆盖从仓库磁盘 `SKILL.md` 扫描得到的文件系统 Skill；**不**支持匿名用户参与本能力（无配置入口、无匿名 API 调用语义）。

## What Changes

- 提供 Skill 可用性管理：在 UI 中以列表形式展示当前用户可配置的 Skill，并支持开启/关闭（或等效多选「可用」集合）。
- Agent 运行时（`agent-core` 及与 Skill 来源衔接的层）在组装 LangChain tools、生成兼容模式系统 prompt 中的工具目录、以及技能发现层（含 `skill-compat-progressive-disclosure` 相关的摘要与 compact hint）时，对**纳入本功能的 Skill 子集**，**仅包含**标记为可用的项；被关闭的 Skill 既不出现在 native tools 中，也不出现在兼容模式追加的系统文本中。文件系统 `SKILL.md` Skill 不在此子集内，行为与变更前一致。
- 持久化用户选择（**仅**登录用户，行为类似 `user-llm-settings`），并在发起任务时加载；若尚无用户配置，需有明确的默认策略（例如默认全部可用）。匿名用户不得调用读写接口。
- 后端 API：读取/更新当前用户的 Skill 可用性集合（需认证）；任务执行路径在绑定 tools 前对可配置 Skill 应用该过滤。

## Capabilities

### New Capabilities

- `skill-availability`：定义 Skill 可用状态的语义、默认值、持久化与隔离、以及 Agent 在 tools 与兼容模式系统 prompt / 发现层中的一致过滤行为。

### Modified Capabilities

- `agent-client`：增加 Skill 可用性列表的设置入口与交互；在发起任务或加载设置时与后端同步可用 Skill 集合（具体交互以 design 为准）。
- `agent-tool-prompt-compat`：兼容模式下系统 prompt 中列出的工具集合 MUST 与实际绑定到模型的 tools 子集一致（仅包含可用 Skill 对应项及非 Skill 类工具不变部分）。
- `skill-compat-progressive-disclosure`：技能摘要段与 per-skill 紧凑要点仅针对**可用**状态的 Skill；被关闭的 Skill MUST 不出现在发现路径中。

## Impact

- **后端**：Agent 组装 tools、系统消息片段，以及与「非文件系统 Skill」注册路径衔接的模块；API 服务层与用户存储（与现有用户设置模式对齐）。文件系统 Skill 路径可保持不变。
- **前端**：设置页或 Skill 管理相关界面、调用新/扩展 API。
- **数据**：新增或扩展现有用户设置存储（字段或关联表），需迁移策略与默认值。
- **规范**：新建 `skill-availability` spec；上述三个既有 spec 增加 delta 需求。
