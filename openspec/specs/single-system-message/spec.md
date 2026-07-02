# Single System Message

**Purpose**: 确保 agent-core 在每次 LLM 调用时消息列表仅有一条 system 消息，且位于 messages[0]，兼容 Llama 等模型的严格约束。

## Requirements

### Requirement: 消息列表仅有一条 system 消息

消息列表（messages）构造时，`role: "system"` 的消息有且仅有一条，位于 `messages[0]`。任何模型调用的消息列表都必须满足此约束。

#### Scenario: 有长期记忆时

- **WHEN** `profileDetails` 从 mem0 `/dreamsearch` 返回非空
- **THEN** system 消息 content = `profileDetails`
- **AND** messages[0] 是该 system 消息

#### Scenario: 无长期记忆时

- **WHEN** `profileDetails` 为空（空字符串或 null）
- **THEN** system 消息 content = 兜底话术 `"你是与本平台 Skill Gateway 集成的智能助手，请根据用户的指令和可用工具完成任务。"`
- **AND** messages[0] 是该 system 消息

### Requirement: 提示词与对话记忆注入到 user 消息

静态系统提示词（staticSystemPrompt）、技能上下文（skillContext）、对话记忆（memoryContext）合并到当前轮 user 消息的 content 中，不再出现在 system 消息里。

#### Scenario: user 消息格式

- **WHEN** 构造当前轮 user 消息
- **THEN** content 格式为 `System:\n${staticSystemPrompt}\n\n${skillContext}\n\n${memoryContext}\n\nUser Instruction:\n${instruction}`
- **AND** 空段自动过滤（如 skillContext 为空则跳过该段）

### Requirement: preModelHook 不新增 system 消息

preModelHook 在 LLM 调用前需要注入任务状态摘要时，查找已有 system 消息并将其追加到 content 末尾；不再 `unshift(new SystemMessage(...))`。

#### Scenario: 存在 system 消息时合并

- **WHEN** llmInputMessages 中有 system 消息
- **THEN** 将任务摘要追加到该 system 消息的 content
- **AND** 重复调用时先移除旧摘要再追加新摘要

#### Scenario: 不存在 system 消息时插入

- **WHEN** llmInputMessages 中没有 system 消息（兜底）
- **THEN** 在 llmInputMessages 开头插入新 SystemMessage
