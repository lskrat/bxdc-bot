# skill-compat-progressive-disclosure Specification

## Purpose

定义在 `AGENT_TOOL_PROMPT_COMPAT` 开启时，技能发现层如何通过渐进披露在**不提高默认系统提示词总长度预算**的前提下，提高模型对 `skill_*` 与相关工具的首轮调用准确率。

## ADDED Requirements

### Requirement: 兼容模式下发现层 MUST 暴露有上限的调用要点

当兼容模式开启时，系统 MUST 在模型首次调用 `skill_*` 之前，为每个已注册 Skill 暴露一段**有最大字符长度限制**的「紧凑调用要点」（例如关键参数形态、是否要求嵌套 JSON 字符串、`extended_*` 协作提示等），内容 MUST 来自 Skill 作者显式提供的元数据（例如 SKILL.md frontmatter 中的约定字段），或由实现文档明确定义的等价来源；系统 MUST NOT 依赖未受约束的全文解析作为唯一来源。

#### Scenario: 兼容模式开启且 Skill 提供了 compact hint

- **WHEN** 兼容模式为开启状态且某 Skill 在元数据中提供了非空的紧凑调用要点
- **THEN** 该要点 MUST 出现在技能发现路径中至少一处（系统消息中的技能摘要段和/或与该 Skill 对应的 `skill_*` 工具在【可用工具】中的说明）
- **AND** 注入长度 MUST 受实现规定的上限约束，超出部分 MUST 被截断且不导致请求构建失败

#### Scenario: 兼容模式关闭

- **WHEN** 兼容模式为关闭状态
- **THEN** 系统 MUST NOT 仅为本 Requirement 追加额外的紧凑调用要点块（与开关关闭时的既有行为一致）

### Requirement: 完整 SKILL 正文仍以 skill_* 返回为主路径

渐进披露 MUST NOT 将完整 SKILL.md 正文默认注入系统消息。完整指令 MUST 仍在模型成功调用对应 `skill_*` 工具后由工具结果返回（与当前架构一致）。

#### Scenario: 模型加载 Skill

- **WHEN** 模型调用某一 `skill_*` 工具且调用被服务端接受并执行
- **THEN** 工具结果中 MUST 包含该 Skill 的完整可用指令正文（与实现当前 `buildToolResult` 语义一致）
- **AND** 系统消息中的发现层内容仅保留紧凑要点与摘要，不依赖其替代完整正文

### Requirement: 默认总长度预算不得因本能力而提高

实现 MUST 在既有「工具块 / 系统消息」长度上限与截断策略下完成紧凑要点的编排；若需为要点腾出空间，MUST 通过缩短冗余说明、调整各段截断优先级或在同上限内再分配等方式完成，而不得单方面提高默认的 `maxTotalBlockChars` / 单工具 schema 上限等配置的默认值。

#### Scenario: 工具块接近总长度上限

- **WHEN** 当前轮次工具序列化后接近或达到实现规定的总长度上限
- **THEN** 系统 MUST 仍按既定策略截断或省略部分条目并生成可发送的请求
- **AND** 紧凑要点的存在 MUST NOT 绕过该上限导致不可恢复错误

### Requirement: 元数据字段缺失时的降级行为

当某 Skill 未提供紧凑调用要点元数据时，系统 MUST 降级为与变更前等价的发现层信息（仅名称、描述、metadata 摘要及【可用工具】中既有 schema 说明），且 MUST NOT 因缺失该字段而拒绝加载 Skill 或拒绝构建 Agent。

#### Scenario: 无 frontmatter hint 的 Skill

- **WHEN** 兼容模式开启且某 Skill 未配置紧凑调用要点
- **THEN** 该 Skill 的发现层表现 MUST 与未实现本能力时一致（除实现为满足其它 Requirement 所做的通用文案微调外）
- **AND** Agent MUST 仍能正常绑定并调用该 `skill_*` 工具
