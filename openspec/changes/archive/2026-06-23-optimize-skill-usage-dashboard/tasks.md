## 1. Gateway — 昵称 JOIN

- [x] 1.1 `SkillUsageOverviewDTO` 新增 `createdByName` 字段（含 getter/setter，JDK 1.8 语法）
- [x] 1.2 `ToolCallLog` 新增非持久化字段 `userName`（`@TableField(exist = false)` + getter/setter）
- [x] 1.3 `SkillUsageMapper.getOverview` SQL 增加 `LEFT JOIN users u ON u.id = s.created_by`，SELECT 增加 `u.nickname AS createdByName`
- [x] 1.4 `SkillUsageMapper.getDetails` SQL 增加 `LEFT JOIN users u ON u.id = t.user_id`，SELECT 改为显式列并增加 `u.nickname AS userName`（保留原 `tool_call_logs` 字段映射）
- [ ] 1.5 启动 gateway 验证 overview / details 接口返回新增昵称字段，且原字段不丢

## 2. Frontend — 类型与昵称展示

- [x] 2.1 `api.ts` 的 `SkillUsageOverviewItem` 增加 `createdByName?: string`，详情记录类型增加 `userName?: string`
- [x] 2.2 `SkillUsageDashboard.vue`「创建者」列改用单元格渲染：展示 `createdByName || createdBy`
- [x] 2.3 详情弹窗「调用用户」列改用单元格渲染：展示 `userName || userId`

## 3. Frontend — 统计表排序

- [x] 3.1 `overviewColumns` 为调用次数、成功率、调用用户数、平均耗时、首次调用、最近调用列增加 `sorter` 配置
- [x] 3.2 新增受控 `sort` 状态，`t-table` 绑定 `:sort` 与 `@sort-change`，对 `overviewData` 做本地排序（成功率按 `successCalls/totalCalls` 比值）
- [x] 3.3 排序与 client-side 分页协同：先排序后分页，取消排序恢复默认（调用次数降序）

## 4. 验证

- [x] 4.1 `cd frontend && npx vue-tsc -b` 静默通过（无 TS6133）
- [x] 4.2 `cd frontend && npm run build` exit 0
- [ ] 4.3 手测：创建者/调用用户展示昵称、昵称缺失回退 ID、各列排序正确
