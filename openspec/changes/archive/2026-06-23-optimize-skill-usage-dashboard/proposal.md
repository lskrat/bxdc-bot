## Why

运营看板（Skill Usage Dashboard）当前在「创建者」列和「调用详情」弹窗中直接展示 6 位用户 ID，运营人员看到一串数字无法辨认是谁；同时统计列表不支持按调用次数、成功率等指标排序，运营人员只能依赖后端固定的 `totalCalls DESC` 默认排序，无法快速定位"成功率最低""用户数最多"等关注项。

## What Changes

- **用户标识展示为昵称**：看板统计表「创建者」列、调用详情弹窗「调用用户」列将用户 ID 解析为用户昵称（`users.nickname`）展示；昵称缺失时回退展示原 ID，保证不丢信息。
- **统计列表支持排序**：看板统计表对数值与时间型列（调用次数、成功率、调用用户数、平均耗时、首次调用、最近调用）支持点击列头升/降序排序。

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `skill-usage-dashboard`: 看板统计表与调用详情新增"用户昵称展示"与"列表列排序"行为（作为 ADDED Requirements 落地，因该 capability 尚未同步进主 specs）。

## Impact

- **Gateway**：`SkillUsageMapper` 聚合/详情 SQL 增加对 `users` 表的 LEFT JOIN 取昵称；`SkillUsageOverviewDTO` 与详情记录新增昵称字段。不改表结构。
- **Frontend**：`SkillUsageDashboard.vue` 表格列展示昵称、`overviewColumns` 增加可排序配置并接入 `t-table` 排序；`api.ts` 类型补充昵称字段。
- **不修改 agent-core**（AGENTS.md 5.5）。
- **不新增第三方包**（AGENTS.md 5.1）；**不新增环境变量**（AGENTS.md 5.2）；Gateway 侧保持 JDK 1.8 语法（AGENTS.md 5.4）；前端保证零 TS6133（AGENTS.md 5.6）。
