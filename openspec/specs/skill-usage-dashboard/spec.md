# skill-usage-dashboard Specification

## Purpose

TBD - 运营看板（Skill Usage Dashboard）能力的本规范当前仅覆盖 `optimize-skill-usage-dashboard` 变更新增的行为（用户昵称展示、统计表列排序）。看板的基础能力（聚合统计 API、调用详情 API、看板页面、导航入口）由 `add-skill-usage-dashboard` 变更定义，待其归档/同步后并入本规范。

## Requirements

### Requirement: 看板用户标识以昵称展示

运营看板 SHALL 将用户标识解析为用户昵称（`users.nickname`）后展示，而非展示原始 6 位用户 ID。涉及：统计表「创建者」列、调用详情弹窗「调用用户」列。

Gateway SHALL 在 `GET /api/skill-usage/overview` 响应中为每条记录额外返回创建者昵称字段（如 `createdByName`），在 `GET /api/skill-usage/details` 响应的每条调用记录中额外返回调用用户昵称字段（如 `userName`），昵称来源为 `users` 表按用户 ID LEFT JOIN。

当某用户 ID 在 `users` 表无对应记录或昵称为空时，前端 SHALL 回退展示该原始用户 ID，不得展示空白。

#### Scenario: 创建者列展示昵称
- **WHEN** 用户访问运营看板，某 Skill 的创建者 ID 在 `users` 表存在昵称
- **THEN** 统计表「创建者」列展示该用户昵称而非 6 位 ID

#### Scenario: 调用详情用户列展示昵称
- **WHEN** 用户打开某 Skill 的「调用详情」弹窗，某条调用记录的用户 ID 在 `users` 表存在昵称
- **THEN** 详情表「调用用户」列展示该用户昵称而非 6 位 ID

#### Scenario: 昵称缺失时回退展示 ID
- **WHEN** 某用户 ID 在 `users` 表无记录或昵称为空
- **THEN** 对应列回退展示该原始用户 ID，而非空白

### Requirement: 看板统计表支持列排序

运营看板统计表 SHALL 支持对数值与时间型列进行升序/降序排序，可排序列至少包括：调用次数、成功率、调用用户数、平均耗时、首次调用时间、最近调用时间。

排序 SHALL 在前端基于已加载的全量统计数据进行，排序结果 SHALL 与分页协同（先排序再分页）。成功率排序 SHALL 按 `successCalls / totalCalls` 比值排序，与展示数值一致。

#### Scenario: 按调用次数降序排序
- **WHEN** 用户点击「调用次数」列头切换为降序
- **THEN** 统计表按调用次数从大到小重新排列，分页基于排序后的顺序

#### Scenario: 按成功率升序排序
- **WHEN** 用户点击「成功率」列头切换为升序
- **THEN** 统计表按成功率比值从低到高排列，便于定位失败率高的 Skill

#### Scenario: 取消排序恢复默认顺序
- **WHEN** 用户取消某列的排序状态
- **THEN** 统计表恢复为接口返回的默认顺序（调用次数降序）
