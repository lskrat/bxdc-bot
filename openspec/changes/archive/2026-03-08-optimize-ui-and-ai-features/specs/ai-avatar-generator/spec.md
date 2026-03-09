## ADDED Requirements

### Requirement: Generate Emoji Avatar
系统应利用 LLM 根据用户昵称生成相关的 emoji 头像。

#### Scenario: Successful Generation
- **WHEN** 用户在注册时提供昵称
- **THEN** 系统返回一个代表该昵称的 emoji 字符

#### Scenario: Fallback Generation
- **WHEN** LLM 未能返回有效的 emoji
- **THEN** 系统返回默认 emoji（例如：👤）
