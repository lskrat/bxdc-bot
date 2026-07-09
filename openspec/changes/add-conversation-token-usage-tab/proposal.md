# Proposal: 按用户维度的 LLM Token 用量 + 技能调用统计 Tab

## Why

当前运营看板（[SkillUsageDashboard.vue](file:///Users/dccb/botproject/fishtank/frontend/src/views/SkillUsageDashboard.vue) + `/api/skill-usage/*`）只做**全局 Skill 调用次数概览**（admin 视角、跨用户聚合），不解决三个实际需求：

1. **每次对话发了多少 token 给大模型** —— 内网大模型算力有限，业务方需要按用户/按会话粒度看到实际 prompt token、completion token、轮次、耗时、**每一天的用量趋势**。用途：
   - 用户自己了解"我的这次提问为什么慢 / 贵"
   - 排查"是不是某个 session 异常把上下文撑爆"
   - 优化 prompt 长度、减少不必要 skill 注入
   - 按日期回看"哪天用量突增" —— 内网大模型性能监控
   - **只统计真的调用过大模型的会话** —— "创建了但从来没发过消息"的会话不显示（conversation_logs 无行）
   - **调用失败 / 报错的会话必须展示** —— 即 total_tokens = 0 的失败 round 也要出现在列表和详情中（用于排查模型故障）
2. **每一次 LLM 调用的完整记录（含失败）** —— 用户要求"调用失败或者报错的记录也得展示到前端记录"。即成功 + 失败的每条 round 都得能看到
3. **每次对话到底调了哪些 skill** —— 现有 `tool_call_logs` 表里都有 `user_id / session_id / skill_name / llm_input_tokens / llm_output_tokens`，前端需要视图回放
4. **按用户隔离** —— 只能看自己 (`X-User-Id == 当前用户`) 的数据，**绝对不能跨用户泄漏**（合规要求）

数据层面已经具备：
- `conversation_logs` ([ConversationLog.java](file:///Users/dccb/botproject/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/entity/ConversationLog.java)) 含 `total_tokens / prompt_tokens / completion_tokens / llm_rounds / tool_call_rounds / llm_model / skill_name / user_id / session_id / created_at / is_success / status / finish_reason / error_message`
- `tool_call_logs` ([ToolCallLog.java](file:///Users/dccb/botproject/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/entity/ToolCallLog.java)) 含 `user_id / session_id / skill_name / tool_name / llm_input_tokens / llm_output_tokens / duration_ms / status / start_time`

**核心未实现的是"前端可读视图 + per-user 聚合 API + 按天图表 + 完整明细倒序（含失败）+ Y 轴单位切换 + 列表导出 + 失败/错误记录展示"**。本次只补这些块，不动 agent-core 的采集逻辑（采集已经齐了）。

## What Changes

- 新增 REST API（仅 gateway，agent-core 零改动）：
  - `GET /api/token-usage/conversations?userId=X&startDate=&endDate=&page=1&size=20&keyword=` —— 当前用户的会话列表（按 endedAt DESC，**过滤规则：仅排除 conversation_logs 完全无行的会话**；total_tokens = 0 的失败会话**保留**）+ 概览数字（同时支持按日期范围过滤）
  - `GET /api/token-usage/conversations/{sessionId}?userId=X` —— 单次会话的**每轮 LLM 调用完整明细（含成功+失败）**，按 called_at DESC（最新在最前）
  - `GET /api/token-usage/daily?userId=X&startDate=&endDate=` —— 按天聚合的 token 用量序列（含失败 round 的 0 计数），返回 `[{date: "2026-07-08", totalTokens: 19134, promptTokens: 12345, completionTokens: 6789, callCount: 42, failedCount: 2}]`
  - 全部强制 `X-User-Id == query/path 的 userId`，否则 403（防水平越权）
- 新增前端组件 [TokenUsagePanel.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/TokenUsagePanel.vue)（对齐 SkillHub 弹窗模式，880px 宽）：
  - **概览 Tab（默认）**：4 个总览卡片 + 日期范围选择器（默认近 30 天）+ token 用量日趋势图（堆叠柱状：prompt vs completion）+ **Y 轴单位切换器**（token / 千token / 万token）+ 概览卡片显示**失败调用次数**
  - **会话列表 Tab**：t-table 列：`会话标题 / 起止时间 / 轮次 / 总 token / prompt / completion / 调用的 skill 数 / 状态 / 失败次数`（按 endedAt DESC，**失败会话显式标红**）+ **「导出 CSV」按钮**
  - **会话详情 Tab**（点列表行进入）：t-table 列：`时间 / 模型 / prompt_tokens / completion_tokens / 轮次内 rank / 关联 skill 名 / 耗时 / 状态 / 错误信息`；失败行**标红 + 显示 error_message**；按 called_at DESC 排序，最新在最前
- 顶栏 Layout.vue 新增按钮「Token 用量」（v-if=currentUser），点击 toggle 显示 TokenUsagePanel
- 新增 composable `useTokenUsage.ts`（对齐 useServerLedger / useSkillHub 单例模式）

**BREAKING**：无。新增端点 + 新增组件 + 新增表查询，无现有 spec / 行为变更。

## Capabilities

### New Capabilities

- `conversation-token-usage`: per-user per-conversation LLM token + skill 用量查看能力 —— 含 3 个 REST 端点、TokenUsagePanel 弹窗 + 3 Tab、useTokenUsage composable、按 X-User-Id 强校验的越权防护、按天聚合 + 每轮明细倒序（含成功+失败）、d3 自绘图表 + Y 轴单位切换、列表 CSV 导出、失败/错误记录显式展示（标红 + error_message）

### Modified Capabilities

- 无（不动任何已有 spec）

## Impact

### 后端（skill-gateway，Spring Boot）

- 新增 DTO：`TokenUsageOverviewDTO`（含 failedCalls）/ `TokenUsageConversationSummaryDTO`（含 failedCalls + status）/ `TokenUsageCallDetailDTO`（含 status + errorMessage）/ `TokenUsageSessionDetailDTO` / `TokenUsageConversationPageDTO` / `TokenUsageDailyPointDTO`（含 failedCount + callCount）/ `TokenUsageDailyResponseDTO`
- 新增 mapper 扩展：`ConversationLogMapper.findSummariesByUserId` 用 `@Select` 注解，**过滤规则：仅排除 conversation_logs 完全无行的会话**（GROUP BY session_id 自然保证）/ `getOverviewByUserId` 含 `failed_calls` 计数 / `findCallDetailsBySessionIdDesc` 不按 is_success 过滤 / `findDailyByUserId` 返回 failedCount
- 新增 service：`TokenUsageService`（拼装 DTO + 校验 X-User-Id == userId）
- 新增 controller：`TokenUsageController`（3 个 GET 端点 + 强鉴权）
- **零 DB schema 变更**（复用 `conversation_logs` + `tool_call_logs`，不加列不加表）

### 前端

- 新增组件：`TokenUsagePanel.vue`（880px 弹窗 + 3 t-tab-panel + 概览卡片（含失败次数）+ 日期选择 + 表格（失败标红）+ Y 轴单位切换器 + CSV 导出按钮）
- 新增组件：`TokenUsageDailyChart.vue`（d3 堆叠柱状图，**接受 `unit: 'token' | 'kilo' | 'mega'` prop** 渲染不同 Y 轴；hover 显示 tooltip 含失败次数）
- 新增 composable：`useTokenUsage.ts`
- 修改 [Layout.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/Layout.vue)：顶栏新增 t-button + 挂载 `<TokenUsagePanel />`
- 复用现有 TDesign `t-tabs / t-table / t-button / t-dialog / t-date-range-picker / t-card / t-segmented`

### 不影响

- agent-core 零改动（采集已经在 conversation_logs / tool_call_logs 落库）
- 不动现有 skill-usage-dashboard
- 不影响其他 LLM 调用的代码路径
- 不引入新 npm 依赖
- 不引入新环境变量