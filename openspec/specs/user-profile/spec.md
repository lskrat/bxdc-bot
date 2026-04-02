# user-profile

## Purpose

定义用户个人资料的存储、头像生成及记忆注入。
## Requirements
### Requirement: 个人资料管理

系统 MUST 存储和检索用户个人资料信息，包括 ID、昵称和头像。

#### Scenario: 获取资料

- **当** 系统需要显示当前用户
- **那么** 它从数据库中检索 ID、昵称和头像

### Requirement: 头像生成

系统 MUST 在注册或资料编辑时允许用户通过 emoji 选择器设定头像，或显式触发可选的 LLM 辅助生成；系统 MUST NOT 将「仅由 LLM 在注册时静默生成」作为唯一头像来源。

#### Scenario: 创建头像

- **WHEN** 用户使用昵称（例如 "SpeedyRabbit"）注册并选择 emoji 头像
- **THEN** 系统将所选 emoji 保存为用户的头像
- **AND** 不强制调用 LLM

#### Scenario: 显式 LLM 生成头像

- **WHEN** 用户在注册或资料流程中点击「自动生成」
- **THEN** 系统 MAY 调用 LLM 以匹配昵称的 emoji
- **AND** 成功时保存该 emoji 为头像

#### Scenario: 无 LLM 或失败

- **WHEN** 用户未使用自动生成功能或 LLM 失败
- **THEN** 系统使用用户已选 emoji 或默认占位 emoji

### Requirement: 资料记忆注入

系统 MUST 在注册时自动将用户的昵称注入其记忆流。

#### Scenario: 初始记忆

- **当** 用户注册
- **那么** 系统创建一条高置信度的记忆条目：「用户的昵称是 {nickname}」
- **并且** 此记忆限定在该用户范围内

