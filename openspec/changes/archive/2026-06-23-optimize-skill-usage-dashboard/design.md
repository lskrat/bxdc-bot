## Context

运营看板由 `add-skill-usage-dashboard` 引入，包含：
- Gateway：`SkillUsageController` / `SkillUsageService` / `SkillUsageMapper`，`getOverview` 对 `tool_call_logs` 做聚合（LEFT JOIN `skills` 取 `created_by`），`getDetails` 返回 `tool_call_logs` 明细（`SELECT *` → `List<ToolCallLog>`）。
- Frontend：`SkillUsageDashboard.vue`，overview 接口返回**全量** list（前端 `t-table` client-side 分页，`total: overviewData.length`），详情接口走服务端分页。

现状问题：
1. overview「创建者」列显示 `createdBy`（6 位 ID）、详情弹窗「调用用户」列显示 `userId`（6 位 ID），不可读。用户昵称存于 `users.nickname`（`User.id` 为 6 位字符串 PK）。
2. overview `t-table` 未配置任何列排序，后端固定 `ORDER BY totalCalls DESC`。

该 capability 尚未同步进 `openspec/specs/`，故本次以 **ADDED Requirements** 落地新行为，归档安全（AGENTS.md §3）。

## Goals / Non-Goals

**Goals:**
- 看板「创建者」、详情「调用用户」展示昵称，昵称缺失时回退展示原 ID。
- overview 统计表对数值/时间列支持列头点击排序。

**Non-Goals:**
- 不改 `tool_call_logs` / `skills` / `users` 表结构。
- 不改详情接口的服务端分页机制；不为 overview 引入服务端排序。
- 不修改 agent-core。

## Decisions

### 决策 1：昵称解析在 Gateway 侧 JOIN `users` 表，而非前端二次请求

- **方案 A（选用）**：在 `SkillUsageMapper` 的 SQL 中 LEFT JOIN `users`，随聚合/明细结果一次性带回昵称。
  - overview：`LEFT JOIN users u ON u.id = s.created_by`，新增 `createdByName`（`SELECT u.nickname AS createdByName`），加入 `SkillUsageOverviewDTO`。
  - details：`getDetails` 的 SQL `LEFT JOIN users u ON u.id = t.user_id`，新增 `u.nickname AS userName`；为最小改动，给 `ToolCallLog` 增加一个**非持久化**字段 `userName`（`@TableField(exist = false)`），不改表、不影响其他用到 `ToolCallLog` 的查询。
- **方案 B（否决）**：前端拿到 ID 列表后再调用户昵称接口批量解析。需新增前端请求与缓存逻辑，且看板 `api.ts` 与 `useSkillHub` 的 `nicknameByUserId` 是两套来源，会引入重复机制。
- **回退策略**：昵称为空（用户已删或脏数据）时，前端展示 `createdByName || createdBy`、`userName || userId`，不丢信息。
- 符合 AGENTS.md 5.5（能力在 gateway 落地，不碰 agent-core）。

### 决策 2：overview 列表排序走前端 client-side，而非服务端

- overview 接口返回**全量**数据且前端已是 client-side 分页，因此排序在前端做最自然：`t-table` 配置可排序列 + 受控 `sort`，对 `overviewData` 做本地排序，再分页。
- **否决服务端排序**：会改 `getOverview` 接口签名（加 `sortBy`/`sortOrder`），且与现有 client-side 分页割裂，收益低。
- 可排序列：调用次数、成功率、调用用户数、平均耗时、首次调用、最近调用。成功率排序按 `successCalls/totalCalls` 比值（与展示一致）。

## Risks / Trade-offs

- [JOIN `users` 影响聚合性能] → `users` 为 6 位 ID 小表，overview 已按 skill 维度聚合，JOIN 行数与原先一致；可忽略。
- [昵称重名导致歧义] → 展示用途可接受；如需精确仍可悬浮/扩展显示 ID（本次不做）。
- [前端排序 + client-side 分页交互] → TDesign `t-table` 原生支持二者组合（先排序后分页）；统一受控状态即可。
- [前端 TS6133] → 新增 sort 状态/类型字段需自查未使用声明（AGENTS.md 5.6），build 前跑 `vue-tsc -b`。
