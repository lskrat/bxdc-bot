# ai-avatar-generator

## Purpose

定义基于 LLM 的 emoji 头像生成能力，根据用户昵称返回代表该昵称的 emoji 字符，并在 LLM 失败时回退到默认 emoji。

## Requirements

### Requirement: 生成 Emoji 头像

系统 MUST 利用 LLM 根据用户昵称生成相关的 emoji 头像。

#### Scenario: 成功生成

- **当** 用户在注册时提供昵称
- **那么** 系统返回一个代表该昵称的 emoji 字符

#### Scenario: 回退生成

- **当** LLM 未能返回有效的 emoji
- **那么** 系统返回默认 emoji（例如：👤）
