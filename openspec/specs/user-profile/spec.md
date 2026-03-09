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

系统 MUST 在注册时使用 LLM 根据用户的昵称生成一个 emoji 头像。

#### Scenario: 创建头像

- **当** 用户使用昵称（例如 "SpeedyRabbit"）注册
- **那么** 系统调用 LLM 选择匹配的 emoji（例如 "🐇"）
- **并且** 将此 emoji 保存为用户的头像

### Requirement: 资料记忆注入

系统 MUST 在注册时自动将用户的昵称注入其记忆流。

#### Scenario: 初始记忆

- **当** 用户注册
- **那么** 系统创建一条高置信度的记忆条目：「用户的昵称是 {nickname}」
- **并且** 此记忆限定在该用户范围内
