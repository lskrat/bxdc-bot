# skill-availability

## Purpose

定义**非文件系统来源**、且**仅面向已登录用户**的 Skill「可用」状态：持久化、隔离，以及在 Agent 运行时对**该 Skill 子集**的 tools 与兼容模式系统 prompt / 工具目录的一致过滤。从磁盘 `SKILL.md` 扫描得到的 Skill 不在本能力范围内。

**实现摘要**：`skill-gateway` 在 `users` 表持久化 `disabled_extended_skill_ids`（JSON 数组字符串，元素为网关 `skills` 表中 EXTENSION 行的数字 id 的字符串形式）。对外 `GET` / `PUT` `/api/user/{id}/skill-availability` 使用 JSON 字段 `disabledSkillIds` 与 `skills`（可配置项清单）。已登录用户发起任务时，网关在转发 `agent-core` 的执行上下文中注入 `disabledExtendedSkillIds`（与上同）；`agent-core` 仅在存在 `userId` 时应用，并在 `loadGatewayExtendedTools` 中按 id 过滤 EXTENSION 工具；`SKILL.md` 对应工具不经过该列表。

## Requirements

### Requirement: 范围限于非文件系统 Skill

本能力所指的「可配置 Skill」MUST 仅包含非文件系统来源的 Skill（例如数据库持久化、经 skill-gateway 暴露给 Agent 的 EXTENSION Skill）。通过仓库磁盘 `SKILL.md` 扫描注册的工具 MUST NOT 出现在本能力的配置列表中，也 MUST NOT 受用户禁用列表影响；其绑定与系统消息表现保持未实现本能力时的行为。

#### Scenario: 文件系统 Skill 不受禁用列表影响

- **WHEN** 某 Skill 仅由磁盘 `SKILL.md` 扫描得到
- **THEN** 即使用户在禁用列表中写入了与该 Skill 名称相似的字符串，系统也不得据此移除该工具或将其从系统消息的技能相关段落中删除（除非其它独立规范另有规定）

### Requirement: 仅登录场景下暴露读写能力

Skill 可用性的读写接口 MUST 仅对有效用户 id 开放；未知用户 MUST 返回 404。前端 MUST 仅在已登录时调用；未登录客户端 MUST NOT 发起上述请求。实现可与现有 LLM 设置接口采用相同信任模型（路径中的 `userId` 即会话标识）。

#### Scenario: 未知用户

- **WHEN** 客户端请求不存在的 `userId` 的 Skill 可用性
- **THEN** 服务器返回 404 且不返回其它用户的配置

### Requirement: 用户级 Skill 可用性持久化

系统 MUST 为每个登录用户持久化其选择禁用的可配置 Skill 标识集合；空集合表示未禁用任何可配置 Skill，即该子集内全部可用。

#### Scenario: 首次保存禁用项

- **WHEN** 已登录用户在设置中关闭若干 Skill 并提交保存
- **THEN** 系统将该用户的禁用 id 列表写入持久化存储
- **AND** 后续该用户发起的 Agent 任务在绑定可配置 Skill 对应工具时排除这些 id

#### Scenario: 清空禁用

- **WHEN** 用户将列表恢复为全部开启并保存
- **THEN** 持久化集合为空（或等价表示「无禁用」）
- **AND** 该用户任务再次绑定全部可配置 Skill 对应的工具

### Requirement: 读取接口与隔离

读取接口 MUST 仅返回路径所指用户的配置；系统 MUST NOT 泄露其它用户的禁用列表。

#### Scenario: 越权路径

- **WHEN** 请求使用某一 `userId` 路径
- **THEN** 响应仅反映该 id 对应用户的数据（若存在）

### Requirement: 未配置时的默认行为

当用户从未保存过 Skill 可用性，或存储中表示「无禁用」时，系统 MUST 在可配置 Skill 子集上行为等价于「该子集内全部可用」。

#### Scenario: 新用户首次任务

- **WHEN** 新注册用户尚未打开过 Skill 可用性设置
- **THEN** 其 Agent 任务绑定的可配置 Skill 工具集合与未实现本能力时相同

### Requirement: Agent 绑定 tools 时过滤禁用 Skill

对关联了 `userId` 的任务，系统在组装 ReAct 工具列表时，对可配置 Skill 子集 MUST NOT 包含已被该用户禁用的项。无 `userId` 的任务 MUST NOT 应用用户级禁用过滤。

#### Scenario: 部分 Skill 被禁用

- **WHEN** 某用户的禁用列表包含 Skill A 的 id
- **THEN** 该用户任务的工具列表中不存在 Skill A 对应的工具名称
- **AND** 其它未被禁用的可配置 Skill 工具仍存在

### Requirement: 系统消息与兼容模式工具目录一致

兼容模式开启时，系统消息中的「可用工具」目录 MUST 基于与实际绑定到模型的工具同一列表生成，故被禁用的可配置 Skill MUST 不出现在该目录中。磁盘 `SKILL.md` 工具条目不受用户禁用列表约束。

#### Scenario: 兼容模式下禁用可配置 Skill

- **WHEN** 兼容模式开启、任务带 `userId`，且用户禁用了某一可配置 Skill
- **THEN** 系统消息中的工具目录不包含该 Skill 对应项
- **AND** native tools 列表中同样不包含该工具定义

### Requirement: 无效或过期的 id 不得破坏任务

系统在应用禁用集合时 MUST 忽略未知 id（例如已删除 Skill 的残留 id），且 MUST NOT 因此导致任务创建或 Agent 初始化失败。

#### Scenario: 禁用列表含未知 id

- **WHEN** 禁用列表包含当前网关中已不存在的 EXTENSION id
- **THEN** 系统照常构建工具列表与系统消息
