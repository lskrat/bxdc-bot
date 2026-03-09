## ADDED Requirements

### Requirement: Scoped Memory Storage
系统应将所有用户记忆与关联的用户 ID 一起存储。

#### Scenario: Save Memory
- **WHEN** 系统提取新记忆（显式或隐式）
- **THEN** 它使用当前活动的用户 ID 保存记忆
- **AND** 不将其与其他用户关联

### Requirement: Scoped Memory Retrieval
系统应仅检索属于当前已验证用户的记忆。

#### Scenario: Search Memories
- **WHEN** Agent 搜索相关上下文
- **THEN** 它仅返回匹配当前用户 ID 的记忆
- **AND** 忽略来自其他用户的记忆

### Requirement: Scoped Memory Management
系统应允许用户仅删除自己的记忆。

#### Scenario: Delete Memory
- **WHEN** 用户请求遗忘某事
- **THEN** 系统仅从该用户的记忆存储中删除匹配条目
