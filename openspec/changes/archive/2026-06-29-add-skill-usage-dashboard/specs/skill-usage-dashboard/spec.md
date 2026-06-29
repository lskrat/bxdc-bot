## ADDED Requirements

### Requirement: Skill 使用统计聚合查询 API

系统 SHALL 在 gateway 提供 `GET /api/skill-usage/overview` 端点，返回按 Skill 聚合的调用统计数据。

查询参数：
- `startDate`（可选，YYYY-MM-DD）：筛选开始日期
- `endDate`（可选，YYYY-MM-DD）：筛选结束日期
- `keyword`（可选）：按 Skill 名称模糊匹配

每条聚合记录 SHALL 包含以下字段：
- `skillName`：Skill 名称
- `toolName`：工具名称
- `totalCalls`：调用总次数
- `successCalls`：成功次数（status = 'SUCCESS'）
- `failCalls`：失败次数（status != 'SUCCESS'）
- `uniqueUsers`：去重调用用户数
- `createdBy`：Skill 创建者（来自 `skills.created_by`）
- `firstCallTime`：首次调用时间
- `lastCallTime`：最近调用时间
- `avgDurationMs`：平均耗时（毫秒）

聚合结果 SHALL 按 `totalCalls DESC` 降序排列。

#### Scenario: 查询全部 Skill 使用统计
- **WHEN** 用户请求 `GET /api/skill-usage/overview`（无查询参数）
- **THEN** 系统返回所有 Skill 的聚合统计，按调用次数降序

#### Scenario: 按时间范围筛选
- **WHEN** 用户请求 `GET /api/skill-usage/overview?startDate=2026-06-01&endDate=2026-06-17`
- **THEN** 系统仅统计在 2026-06-01 至 2026-06-17 期间发生的 skill 调用

#### Scenario: 按关键词搜索
- **WHEN** 用户请求 `GET /api/skill-usage/overview?keyword=ssh`
- **THEN** 系统仅返回 Skill 名称包含 "ssh" 的统计结果

### Requirement: Skill 调用详情查询 API

系统 SHALL 在 gateway 提供 `GET /api/skill-usage/details` 端点，返回指定 Skill 的调用历史明细。

查询参数：
- `skillName`（必填）：Skill 名称
- `page`（可选，默认 1）：页码
- `size`（可选，默认 20）：每页条数
- `startDate`（可选）：筛选开始日期
- `endDate`（可选）：筛选结束日期

每条调用记录 SHALL 包含：
- `id`：记录 ID
- `userId`：调用用户
- `status`：调用状态（SUCCESS / FAILURE）
- `startTime`：开始时间
- `endTime`：结束时间
- `durationMs`：耗时（毫秒）
- `errorMessage`：错误信息（失败时）

结果 SHALL 支持分页，返回 `total`、`page`、`size`、`records`。

#### Scenario: 查看某个 Skill 的调用历史
- **WHEN** 用户请求 `GET /api/skill-usage/details?skillName=SSH执行技能&page=1&size=20`
- **THEN** 系统返回该 Skill 的第 1 页调用记录（最多 20 条），按时间倒序

#### Scenario: 分页查询下一页
- **WHEN** 用户请求 `GET /api/skill-usage/details?skillName=SSH执行技能&page=2&size=20`
- **THEN** 系统返回第 2 页调用记录

### Requirement: Skill 使用看板页面

系统 SHALL 在前端提供 Skill 使用看板页面，路由为 `/operations/skill-usage`，需登录可见。

页面 SHALL 包含以下元素：
- **筛选栏**：日期范围选择器（开始日期、结束日期）+ Skill 名称搜索输入框 + 查询按钮
- **统计表格**：使用 TDesign `t-table` 展示聚合数据
  - 列：Skill 名称、类型（tool_name）、调用次数、成功率（百分比）、调用用户数、创建者、首次调用时间、最近调用时间、操作
  - 成功率列 SHALL 以绿色显示高成功率、红色显示低成功率
  - 表格 SHALL 支持分页（默认每页 20 条）
- **详情弹窗**：点击操作列的"调用详情"按钮，SHALL 弹出 `t-dialog` 展示该 Skill 的调用历史明细
  - 详情表格列：调用用户、状态（SUCCESS/FAILURE）、开始时间、耗时、错误信息
  - 详情表格 SHALL 支持分页

#### Scenario: 查看看板默认数据
- **WHEN** 登录用户访问 `/operations/skill-usage`
- **THEN** 页面加载所有 Skill 的使用统计，不应用日期筛选

#### Scenario: 按日期范围筛选
- **WHEN** 用户选择开始日期和结束日期后点击"查询"
- **THEN** 表格刷新为指定日期范围内的统计数据

#### Scenario: 按关键词搜索 Skill
- **WHEN** 用户在搜索框输入"SSH"后点击"查询"
- **THEN** 表格仅展示名称包含"SSH"的 Skill

#### Scenario: 点击查看调用详情
- **WHEN** 用户点击某个 Skill 行的"调用详情"按钮
- **THEN** 弹出弹窗显示该 Skill 的调用历史，默认第 1 页

### Requirement: 导航入口

系统 SHALL 在 Layout 顶栏右侧操作区新增"运营看板"按钮，图标使用 `ChartIcon`（来自 `tdesign-icons-vue-next`），点击导航到 `/operations/skill-usage`。

"运营看板"按钮 SHALL 仅对已登录用户可见，与"大模型设置"、"编辑资料"同级展示。

#### Scenario: 登录用户看到运营看板入口
- **WHEN** 用户已登录
- **THEN** Layout 顶栏显示"运营看板"按钮

#### Scenario: 未登录用户看不到入口
- **WHEN** 用户未登录
- **THEN** Layout 顶栏不显示"运营看板"按钮
