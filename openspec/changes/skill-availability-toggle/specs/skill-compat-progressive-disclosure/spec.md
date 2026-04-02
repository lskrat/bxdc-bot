# skill-compat-progressive-disclosure

## ADDED Requirements

### Requirement: 渐进披露发现层仅覆盖可用 Skill

当兼容模式开启且任务带有有效 `userId` 时，技能发现路径（系统消息中的技能摘要列表段、以及各相关工具在【可用工具】中的说明里与渐进披露相关的紧凑要点）对**可配置（非文件系统）** Skill MUST 仅针对对该用户可用的项；被用户禁用的可配置 Skill MUST 不出现在上述发现层内容中。磁盘 `SKILL.md` Skill 的发现层行为不受 `disabled_skill_ids` 移除。无 `userId` 时不应用用户级禁用过滤。

#### Scenario: 禁用可配置 Skill 无紧凑要点暴露

- **WHEN** 兼容模式开启、任务带 `userId`，且某可配置 Skill 被用户禁用
- **THEN** 系统消息中与该子集相关的技能摘要中不包含该 Skill 条目
- **AND** 【可用工具】目录中不存在该 Skill 对应工具项（与 `agent-tool-prompt-compat` 一致）

#### Scenario: 兼容模式关闭

- **WHEN** 兼容模式关闭
- **THEN** 本变更不引入额外的发现层行为；在带 `userId` 的任务上，被禁用的可配置 Skill 仍通过 native tools 过滤被排除（由 `skill-availability` 核心 Requirement 约束）
