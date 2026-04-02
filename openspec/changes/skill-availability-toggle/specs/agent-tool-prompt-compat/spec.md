# agent-tool-prompt-compat

## ADDED Requirements

### Requirement: 兼容模式工具目录必须反映 Skill 可用性过滤

在兼容模式开启且任务带有有效 `userId` 时，系统向系统消息追加的「可用工具」目录中，凡对应**可配置（非文件系统）** Skill 的工具条目，MUST 仅包含对该用户可用的项；该集合 MUST 与同一请求中提交给模型 API 的 native 工具列表中**同一子集**一致。磁盘 `SKILL.md` 对应的工具条目不受 `disabled_skill_ids` 约束（与 `skill-availability` 范围一致）。无 `userId` 的任务 MUST NOT 因本能力而应用用户级禁用过滤。

#### Scenario: 用户禁用某可配置 Skill 后的兼容模式请求

- **WHEN** 兼容模式为开启、任务带 `userId`，且当前用户已将某一可配置 Skill 标记为禁用
- **THEN** 系统消息中的工具目录不包含该 Skill 对应工具项
- **AND** 模型 API 的 tools 数组中也不包含该工具定义

#### Scenario: 非 Skill 工具不受影响

- **WHEN** 存在非「可配置 Skill」类工具仍被 Agent 绑定
- **THEN** 兼容模式工具目录继续包含这些工具（受既有长度截断策略约束）
- **AND** 本 Requirement 不缩小非可配置 Skill 工具的暴露，除非其它规范另有规定
