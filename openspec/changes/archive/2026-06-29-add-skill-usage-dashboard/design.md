## Context

`tool_call_logs` 表已记录每次 skill 调用的完整信息（`tool_name`, `skill_name`, `user_id`, `status`, `start_time`, `duration_ms` 等），`skills` 表记录 Skill 元数据（`created_by`, `name`, `type` 等）。当前无任何运营视角的统计页面或 API。

## Goals / Non-Goals

**Goals:**
- 提供 Skill 维度的聚合统计 API（调用次数、成功率、调用用户数、首次/最近调用时间）
- 前端新增运营看板页面，表格展示统计结果
- 支持按时间范围筛选、按 Skill 名称搜索
- 支持点击单条记录查看调用历史明细

**Non-Goals:**
- 不修改现有 `tool_call_logs` 或 `skills` 表结构
- 不提供实时流式统计（使用数据库聚合查询）
- 不提供图表可视化（V1 仅表格，图表后续迭代）
- 不新增第三方依赖
- 不涉及 agent-core

## Decisions

### Decision 1: API 设计 — 聚合查询接口

**选择：** 新增一个聚合查询端点 `GET /api/skill-usage/overview`，直接对 `tool_call_logs` 表做 SQL GROUP BY。

**请求参数：**
- `startDate` (可选): 开始日期
- `endDate` (可选): 结束日期
- `keyword` (可选): Skill 名称模糊搜索

**响应结构：**
```json
[
  {
    "skillName": "xxx",
    "toolName": "xxx",
    "totalCalls": 120,
    "successCalls": 110,
    "failCalls": 10,
    "uniqueUsers": 15,
    "createdBy": "lskrat",
    "firstCallTime": "2026-01-01T00:00:00",
    "lastCallTime": "2026-06-17T12:00:00",
    "avgDurationMs": 350
  }
]
```

**SQL 思路：** 用 MyBatis-Plus `@Select` 写原生 SQL，`LEFT JOIN skills` 获取 `created_by`。

**备选：** 新建统计表 + 定时任务预聚合 → 不采用，数据量尚可（tool_call_logs 日均数千条），直接聚合性能足够。

### Decision 2: 前端路由与导航

**选择：** 新增路由 `/operations/skill-usage`，在 Layout 顶栏新增"运营看板"入口（使用 `ChartIcon`），仅对登录用户可见。

**页面布局：**
- 顶部筛选栏：日期范围选择器 + Skill 名称搜索框
- 中间统计表格：TDesign `t-table`，列 = Skill名称、类型、调用次数、成功率、调用用户数、创建者、首次调用、最近调用、操作
- 点击"查看详情"弹窗显示该 Skill 的调用历史明细（t-dialog + 分页表格）

**备选：** 放在 `/settings` 路由下 → 不采用，运营看板与个人设置语义不同，独立路由更清晰。

### Decision 3: 调用详情 API

**选择：** `GET /api/skill-usage/details?skillName=xxx&page=1&size=20`，直接分页查询 `tool_call_logs`。

**理由：** 不需要新建数据模型，复用现有表结构。

### Decision 4: 权限控制

**选择：** 不做额外权限控制，登录用户均可查看。

**理由：** 当前平台无角色/权限系统，运营数据对登录用户透明。后续可扩展。

## Risks / Trade-offs

- **[风险] 聚合查询大数据量时性能下降** → 缓解：tool_call_logs 日均量级小（< 10k 条），直接聚合可接受。后续可加索引 `(tool_name, status, start_time)` 和分页。
- **[权衡] 无图表可视化** → V1 只用表格，运营人员可导出数据自行分析。后续迭代加 echarts/recharts。不在此变更范围内。
- **[权衡] 详情弹窗而非独立页面** → 减少路由复杂度，表格 + 弹窗交互更直接。
