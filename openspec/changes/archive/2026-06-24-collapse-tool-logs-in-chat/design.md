## Context

当前聊天页 `MessageList.vue` 中，每条 assistant 消息的结构为：

```
LLM 文本回复 (TChatContent)
     ↓
确认卡片 (confirmation-card)      ← 独立渲染
     ↓
工具调用列表 (tool-status-list)   ← 独立渲染，逐条展开
     ↓
操作按钮 (actions slot)
```

单轮 LLM 调用 5-10 个 tool 时，工具调用列表占用大量垂直空间，把 LLM 回复推离视口。确认卡片与工具调用列表语义关联但分散放置，缺少统一控制。

本设计纯前端 UI 变更，不涉及数据模型、SSE 协议、API 或持久化。

## Goals / Non-Goals

**Goals:**
- 确认卡片与工具调用列表合并到同一个折叠块内
- 运行时（tool `running` 或确认 `pending`）自动展开，完成时自动收起
- pending 确认存在时**禁止**手动收起
- 非 pending 状态下允许用户手动点击展开/收起，仅影响当前消息

**Non-Goals:**
- 不改 `BxdcbotRunResultMessage` 组件（已有独立折叠逻辑）
- 不改 agent-core / gateway / 后台
- 不记忆折叠状态跨消息

## Decisions

### 决策 1：折叠状态由 computed 驱动，不引入额外 `ref`

`Message` 已有 `toolInvocations`（含 `status`）和 `confirmations`（含 `status`），直接派生：

```ts
// 每个消息对象内新增 computed：
const hasRunningTool = toolInvocations.some(t => t.status === 'running')
const hasPendingConfirmation = confirmations.some(c => c.status === 'pending')
// 展开条件：运行中 或 待确认
// 收起条件：全部终态 且 无待确认（用户可手动覆盖）
```

**替代方案（弃用）**：引入 per-message `ref<boolean>` 手动管理 → 需同步 SSE 事件更新 ref，增加状态同步负担，且与现有 `toolInvocations` 状态重复。

### 决策 2：折叠块标题显示摘要信息

```
📋 调用详情（3 次工具 + 1 项待确认）▾    ← 运行中展开
📋 调用详情（3 次工具）▸                  ← 完成时收起
```

- 含 pending 确认：`N 次工具 + M 项待确认`
- 无 pending：`N 次工具`
- 仅确认无工具调用：`M 项待确认`
- 既无确认也无工具：不渲染折叠块

### 决策 3：pending 期间禁止收起

`@click` handler 检查：若 `hasPendingConfirmation` 为 `true`，忽略点击事件。视觉上箭头仍可点击但无效果（或改为不可点击样式）。

### 决策 4：仅影响 `MessageList.vue` 的标准 assistant 路径

当前消息渲染有三条分支：

| 条件 | 组件 | 影响 |
|------|------|------|
| `source === 'ASYNC_TASK_RESULT'` | `AsyncTaskResultMessage` | 不改 |
| `source === 'BXDCBOT_RUN_RESULT'` | `BxdcbotRunResultMessage` | 不改（已有 `toolLogExpanded`） |
| 其他 | 标准 `TChatContent` + 本设计 | **本变更目标** |

### 决策 5：手动手动覆盖仅当前生命周期有效

当用户手动展开（非 pending 时），SSE 仍在推送、后续 tool 状态变化时仍走自动规则（有新 tool 进入 running → 展开）。不做「用户手动打开就 lock 住」的 sticky 逻辑——简单优先。

## Risks / Trade-offs

- [Risk] 用户想回头看已折叠的 tool 结果，需要手动点开 → 一行标题即可，无额外性能开销
- [Risk] 确认卡片折叠时 pending 确认被隐藏 → **已规避**：pending 时强制展开且禁止收起
- [Trade-off] 统一折叠块意味着确认卡片不再独立于 tool 列表渲染 → 权衡：确认卡片与 tool 调用在流程上是同一个"执行阶段"，合入一块 UI 语义更清晰
