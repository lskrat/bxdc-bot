## Why

当前消息构造逻辑存在多条 `role: "system"` 消息的问题：`profileDetails`（长期记忆）、`preModelHook` 注入的任务状态摘要分别产生独立的 system 消息。部分模型（Llama 系列）要求 system 消息必须是第一条且唯一，多 system 会导致接口报错；即使 OpenAI/DeepSeek 容忍多 system，也在语义上不清晰。同时 memoryContext（对话记忆）与 system prompt 混在一起不利于模型区分"长期画像"与"当前对话上下文"。

## What Changes

- 消息列表保证只有一条 system 消息，且位于 `messages[0]`
- system 消息只放长期记忆/个人特征（profileDetails），含兜底话术
- 静态提示词（staticSystemPrompt）、技能上下文（skillContext）、对话记忆（memoryContext）移至 user 消息中
- preModelHook 不再新增 system 消息，改为合并到已有 system 消息的 content 末尾
- 无 profileDetails 时 system 消息使用兜底话术

## Capabilities

### New Capabilities
- `single-system-message`: 确保消息列表仅有一条 system 消息且在首位，统一记忆与提示词的注入位置

### Modified Capabilities
<!-- 无现有 spec 级行为变更 -->

## Impact

- `backend/agent-core/src/controller/agent.controller.ts` — 消息构造逻辑重构
- `backend/agent-core/src/agent/tasks-state.ts` — preModelHook 不再新增 system 消息
