## ADDED Requirements

### Requirement: User Registration
系统应提供新用户注册机制。

#### Scenario: Successful Registration
- **WHEN** 用户提交有效的 6 位数字 ID 和昵称（1-10 个字符）
- **THEN** 系统创建一个新用户记录
- **AND** 为用户生成头像
- **AND** 立即让用户登录

#### Scenario: Duplicate ID Registration
- **WHEN** 用户提交一个已存在的 ID
- **THEN** 系统拒绝注册
- **AND** 显示错误消息“ID 已存在”

#### Scenario: Invalid Input
- **WHEN** 用户提交无效的 ID（非 6 位数字）或昵称（为空或超过 10 个字符）
- **THEN** 系统拒绝注册并显示验证错误

### Requirement: User Login
系统应允许现有用户使用其 ID 登录。

#### Scenario: Successful Login
- **WHEN** 用户输入已注册的 6 位数字 ID
- **THEN** 系统验证用户身份
- **AND** 恢复其个人资料和头像
- **AND** 加载其特定的记忆上下文

#### Scenario: Login Failure
- **WHEN** 用户输入未注册的 ID
- **THEN** 系统显示错误“用户不存在”

### Requirement: Session Persistence
系统应在浏览器会话之间持久化用户的登录状态。

#### Scenario: Browser Refresh
- **WHEN** 已登录用户刷新页面
- **THEN** 他们保持登录状态
- **AND** 其上下文得到保留

### Requirement: User Switching
系统应允许在不同用户账户之间切换。

#### Scenario: Switch User
- **WHEN** 用户选择“切换用户”或“退出”
- **THEN** 清除当前会话
- **AND** 用户返回登录/注册屏幕
