## MODIFIED Requirements

### Requirement: User Registration
系统应提供新用户注册机制，包括生成头像的步骤。

#### Scenario: Successful Registration
- **WHEN** 用户提交有效的 ID 和昵称
- **THEN** 系统创建一个新用户记录
- **AND** 显示“正在生成头像...”状态
- **AND** 调用 AI 生成头像
- **AND** 生成完成后显示“进入对话”按钮
- **AND** 用户点击后登录并进入对话界面

#### Scenario: Duplicate ID Registration
- **WHEN** 用户提交一个已存在的 ID
- **THEN** 系统拒绝注册
- **AND** 显示错误消息“ID 已存在”

#### Scenario: Invalid Input
- **WHEN** 用户提交无效的 ID（非 6 位数字）或昵称（为空或超过 10 个字符）
- **THEN** 系统拒绝注册并显示验证错误
