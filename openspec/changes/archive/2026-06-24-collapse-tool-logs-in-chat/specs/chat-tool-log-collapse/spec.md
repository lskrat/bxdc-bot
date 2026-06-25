## ADDED Requirements

### Requirement: 工具调用与确认卡片合并为折叠块

系统 SHALL 将 assistant 消息的工具调用列表与确认卡片合并到同一个可折叠区块中，折叠块标题显示工具数量与待确认数量。

#### Scenario: 运行中自动展开
- **WHEN** 消息的 toolInvocations 中至少一个 tool 状态为 `running`
- **THEN** 折叠块 MUST 保持展开状态
- **AND** 用户 SHALL 看到所有 tool 的实时状态更新

#### Scenario: 全部完成后自动收起
- **WHEN** 消息的所有 toolInvocations 状态均为 `completed` 或 `failed`，且无 `pending` 状态的确认卡片
- **THEN** 折叠块 MUST 自动收起

#### Scenario: 纯文本消息无折叠块
- **WHEN** 消息既无 toolInvocations 也无 confirmations
- **THEN** 系统 MUST NOT 渲染折叠块

### Requirement: Pending 确认期间禁止收起

系统 MUST 在有 `pending` 状态确认卡片时强制展开折叠块，禁止用户手动收起。

#### Scenario: Pending 确认存在时禁止收起
- **WHEN** 消息的 confirmations 中至少一项状态为 `pending`
- **THEN** 折叠块 MUST 保持展开
- **AND** 用户点击折叠标题 SHALL NOT 收起该区块

#### Scenario: 确认完成后允许收起
- **WHEN** 消息的所有 confirmations 状态均为 `confirmed`、`cancelled` 或 `expired`
- **THEN** 用户点击折叠标题 SHALL 切换展开/收起状态

### Requirement: 折叠块标题显示摘要

系统 SHALL 在折叠块标题中显示工具调用次数与待确认项数。

#### Scenario: 有工具调用与待确认
- **WHEN** 消息有 3 个 tool 和 1 项 pending 确认
- **THEN** 标题 MUST 显示类似"调用详情（3 次工具 + 1 项待确认）"

#### Scenario: 仅工具调用无待确认
- **WHEN** 消息有 5 个 tool 且无 pending 确认
- **THEN** 标题 MUST 显示类似"调用详情（5 次工具）"

#### Scenario: 仅待确认无工具调用
- **WHEN** 消息有 2 项 pending 确认且无 toolInvocations
- **THEN** 标题 MUST 显示类似"调用详情（2 项待确认）"

### Requirement: 手动展开/收起仅影响当前消息

系统 SHALL NOT 跨消息共享折叠状态，每条消息的折叠行为独立。

#### Scenario: 手动展开仅影响当前消息
- **WHEN** 用户手动展开第 N 条消息的折叠块
- **THEN** 第 N-1 条、第 N+1 条消息的折叠块 MUST NOT 受影响
