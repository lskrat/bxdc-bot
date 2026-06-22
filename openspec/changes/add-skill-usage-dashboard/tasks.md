## 1. Gateway — Skill 使用统计 API

- [x] 1.1 新增 `SkillUsageController`，提供 `GET /api/skill-usage/overview` 和 `GET /api/skill-usage/details` 两个端点
- [x] 1.2 新增 `SkillUsageService`，实现聚合查询逻辑：对 `tool_call_logs` 做 GROUP BY `tool_name` + `skill_name`，LEFT JOIN `skills` 获取 `created_by`
- [x] 1.3 新增 `SkillUsageMapper`，写原生 SQL 聚合查询（支持 `startDate`/`endDate`/`keyword` 过滤）
- [x] 1.4 新增 `SkillUsageDTO` 响应 DTO，包含 `skillName`、`totalCalls`、`successCalls`、`uniqueUsers`、`createdBy` 等字段
- [x] 1.5 详情查询接口支持分页参数（`page`、`size`），返回 `tool_call_logs` 明细

## 2. Frontend — 路由与导航

- [x] 2.1 新增路由 `/operations/skill-usage`，懒加载 `SkillUsageDashboard.vue`
- [x] 2.2 在 `Layout.vue` 顶栏新增"运营看板"按钮（`ChartIcon`），仅登录可见

## 3. Frontend — Skill 使用看板页面

- [x] 3.1 创建 `SkillUsageDashboard.vue` 视图，包含筛选栏（日期范围 + 搜索框 + 查询按钮）
- [x] 3.2 实现统计表格：`t-table` 展示聚合数据，列 = Skill名称、类型、调用次数、成功率%、用户数、创建者、首次调用、最近调用、操作
- [x] 3.3 成功率列数值着色（`> 90%` 绿色、`< 50%` 红色）
- [x] 3.4 表格分页支持（默认 20 条/页）

## 4. Frontend — 调用详情弹窗

- [x] 4.1 点击"调用详情"按钮弹出 `t-dialog`，内嵌分页表格展示调用历史
- [x] 4.2 详情表格列：调用用户、状态、开始时间、耗时、错误信息
- [x] 4.3 详情弹窗内分页支持

## 5. API 调用层

- [x] 5.1 在 `frontend/src/services/api.ts` 新增 `fetchSkillUsageOverview` 和 `fetchSkillUsageDetails` 方法

## 6. 验证

- [x] 6.1 验证看板页面聚合数据与数据库 `tool_call_logs` 一致
- [x] 6.2 验证日期筛选、关键词搜索功能正常
- [x] 6.3 验证调用详情弹窗分页正常
- [x] 6.4 验证 `vue-tsc -b` 零 TS6133（新增文件零 TS 错误）
