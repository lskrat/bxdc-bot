# skill-availability

## Purpose

定义**非文件系统来源**、且**仅面向已登录用户**的 Skill「可用」状态：持久化、鉴权隔离，以及在 Agent 运行时对**该 Skill 子集**的 tools 与兼容模式系统 prompt / 技能发现文案的一致过滤。从磁盘 `SKILL.md` 扫描得到的 Skill 不在本能力范围内；匿名用户不得使用本能力的 API 与持久化语义。

## ADDED Requirements

### Requirement: 范围限于非文件系统 Skill

本能力所指的「可配置 Skill」MUST 仅包含非文件系统来源的 Skill（例如数据库或其它服务持久化、经后端暴露给 Agent 的 Skill）。通过仓库磁盘 `SKILL.md` 扫描注册的工具 MUST NOT 出现在本能力的配置列表中，也 MUST NOT 受 `disabled_skill_ids` 影响；其绑定与系统消息表现保持实现本能力之前的行为。

#### Scenario: 文件系统 Skill 不受禁用列表影响

- **WHEN** 某 Skill 仅由磁盘 `SKILL.md` 扫描得到
- **THEN** 即使用户在 `disabled_skill_ids` 中写入了与该 Skill 名称相似的字符串，系统也不得据此移除该工具或将其从系统消息的技能相关段落中删除（除非其它独立规范另有规定）

### Requirement: 仅登录用户可使用持久化与 API

Skill 可用性的读取与更新接口 MUST 要求已认证用户身份；匿名请求 MUST 被拒绝（例如 401/403）。系统 MUST NOT 为匿名用户创建或返回 per-user 的 `disabled_skill_ids` 存储行。

#### Scenario: 匿名调用 API

- **WHEN** 未携带有效登录凭证的客户端调用 Skill 可用性读写接口
- **THEN** 服务器拒绝请求且不返回任何用户的禁用列表

### Requirement: 用户级 Skill 可用性持久化

系统 MUST 为每个登录用户持久化其选择禁用的**可配置 Skill** 标识集合（`disabled_skill_ids`，元素为与运行时该子集稳定 id 一致的字符串）；空集合表示未禁用任何可配置 Skill，即该子集内全部可用。

#### Scenario: 首次保存禁用项

- **WHEN** 已登录用户在设置中关闭若干 Skill 并提交保存
- **THEN** 系统将该用户的 `disabled_skill_ids` 写入持久化存储
- **AND** 后续该用户发起的 Agent 任务在绑定**可配置 Skill** 对应工具时排除这些 id

#### Scenario: 清空禁用

- **WHEN** 用户将列表恢复为全部开启并保存
- **THEN** 持久化集合为空（或等价表示「无禁用」）
- **AND** 该用户任务再次绑定全部可配置 Skill 对应的工具

### Requirement: 读取接口与鉴权隔离

暴露给前端的读取接口 MUST 仅返回当前登录用户的 `disabled_skill_ids`；系统 MUST NOT 泄露其他用户的配置。

#### Scenario: 越权访问被拒绝

- **WHEN** 请求尝试读取或修改不属于当前会话用户的 Skill 可用性
- **THEN** 服务器拒绝请求并返回适当错误码

### Requirement: 未配置时的默认行为

当用户从未保存过 Skill 可用性，或存储中表示「无禁用」时，系统 MUST 在**可配置 Skill 子集**上行为等价于「该子集内全部可用」。文件系统 Skill 的绑定不受本句约束，始终按既有逻辑。

#### Scenario: 新用户首次任务

- **WHEN** 新注册用户尚未打开过 Skill 可用性设置
- **THEN** 其 Agent 任务绑定的可配置 Skill 工具集合与未实现本能力时相同

### Requirement: Agent 绑定 tools 时过滤禁用 Skill

对关联了 `userId` 的任务，系统在组装并绑定 LangChain / ReAct 工具列表时，对**可配置 Skill** 子集 MUST NOT 包含已被该用户禁用的项所对应的工具。无 `userId` 的任务 MUST NOT 应用用户级 `disabled_skill_ids`（可配置 Skill 子集保持与未实现本能力时一致；文件系统 Skill 仍按既有逻辑）。

#### Scenario: 部分 Skill 被禁用

- **WHEN** 某用户的 `disabled_skill_ids` 包含 Skill A 的 id
- **THEN** 该用户任务的工具列表中不存在 Skill A 对应的工具名称
- **AND** 其它未被禁用的可配置 Skill 工具仍存在

### Requirement: 系统消息技能发现段与禁用状态一致

写入系统消息、且**仅针对可配置 Skill 子集**的技能发现摘要（或等价段落）MUST 仅包含对该用户可用的项；被禁用的可配置 Skill MUST NOT 出现在该摘要中。文件系统 Skill 的发现文案若不属本摘要范围，则保持既有行为。

**说明**：若实现将文件系统 Skill 与可配置 Skill 混排在同一段落，实现 MUST 仍保证：被禁用的可配置项不出现在该段中；文件系统项不受 `disabled_skill_ids` 移除。

#### Scenario: 禁用 Skill 不出现在摘要中

- **WHEN** 用户禁用了 Skill B
- **THEN** 该用户任务构建的系统消息中技能摘要列表不含 Skill B 的名称与描述行

### Requirement: 兼容模式 prompt 与 tools 子集一致

当 `AGENT_TOOL_PROMPT_COMPAT`（或等价配置）为开启时，系统追加到系统消息中的「可用工具」结构化目录中，与**可配置 Skill** 对应的条目 MUST 与实际绑定到模型 API 的同名工具子集一致，且均尊重同一套用户禁用规则（在带 `userId` 的任务上）。文件系统 Skill 对应条目不受 `disabled_skill_ids` 约束。

#### Scenario: 兼容模式下禁用 Skill 不出现在工具目录文本中

- **WHEN** 兼容模式开启且用户禁用了 Skill C
- **THEN** 系统消息中的工具目录不包含 Skill C 对应项
- **AND** 模型请求的 native tools 列表中同样不包含 Skill C

### Requirement: 无效或过期的 id 不得破坏任务

持久化中可能出现已删除 Skill 或重命名后残留的 id。系统在应用禁用集合时 MUST 忽略未知 id，且 MUST NOT 因未知 id 导致任务创建或 Agent 初始化失败。

#### Scenario: 禁用列表含未知 id

- **WHEN** `disabled_skill_ids` 包含当前**可配置 Skill** 枚举中不存在的 id
- **THEN** 系统照常构建工具列表与系统消息
- **AND** 不向用户暴露内部错误栈；可选地向客户端返回清理后的规范化列表
