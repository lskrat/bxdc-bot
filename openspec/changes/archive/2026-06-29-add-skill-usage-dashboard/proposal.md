## Why

平台缺少 Skill 调用数据的运营视角。目前 `tool_call_logs` 表已记录每次 skill 调用的用户、状态、耗时等数据，但没有任何页面或 API 可以查看各 Skill 的调用次数、成功率、创建者等运营指标。运营人员无法回答"哪个 Skill 用的人最多"、"哪些 Skill 经常失败"、"每天有多少 Skill 调用"等基本问题。

## What Changes

- **新增 Skill 使用统计 API**：在 gateway 侧提供聚合查询接口，按 Skill 维度统计调用次数、成功率、调用用户数、首次/最近调用时间
- **新增 Skill 使用看板页面**：前端新增运营看板视图，表格展示各 Skill 的调用统计，支持按时间范围筛选
- **支持按 Skill 查看调用详情**：点击某个 Skill 可查看其调用历史明细（谁在什么时候调了、成功还是失败）

## Capabilities

### New Capabilities
- `skill-usage-dashboard`: Skill 使用统计看板 — 包含聚合统计 API、看板页面、调用详情功能

### Modified Capabilities
<!-- None - purely new capability -->

## Impact

- **Gateway**: 新增 `SkillUsageController` + `SkillUsageService`，基于 `tool_call_logs` 表做 GROUP BY 聚合查询，不修改现有表结构
- **Frontend**: 新增 `SkillUsageDashboard.vue` 视图 + 路由，需要新增导航入口（Layout 顶栏或侧栏）
- **不修改 agent-core**
- **不新增第三方包**（聚合查询用 MyBatis-Plus 直接 SQL）
- **不新增环境变量**
