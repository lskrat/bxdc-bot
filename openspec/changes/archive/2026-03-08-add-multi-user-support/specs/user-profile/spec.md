## ADDED Requirements

### Requirement: Profile Management
系统应存储和检索用户个人资料信息，包括 ID、昵称和头像。

#### Scenario: Fetch Profile
- **WHEN** 系统需要显示当前用户
- **THEN** 它从数据库中检索 ID、昵称和头像

### Requirement: Avatar Generation
系统应在注册时使用 LLM 根据用户的昵称生成一个 emoji 头像。

#### Scenario: Avatar Creation
- **WHEN** 用户使用昵称（例如 "SpeedyRabbit"）注册
- **THEN** 系统调用 LLM 选择匹配的 emoji（例如 "🐇"）
- **AND** 将此 emoji 保存为用户的头像

### Requirement: Profile Memory Injection
系统应在注册时自动将用户的昵称注入其记忆流。

#### Scenario: Initial Memory
- **WHEN** 用户注册
- **THEN** 系统创建一条高置信度的记忆条目：“用户的昵称是 <nickname>”
- **AND** 此记忆限定在该用户范围内
