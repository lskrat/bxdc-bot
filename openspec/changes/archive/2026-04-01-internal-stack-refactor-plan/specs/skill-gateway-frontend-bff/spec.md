## ADDED Requirements

### Requirement: 浏览器经网关访问原 agent-core 独占能力

对当前由 `frontend` 通过 `VITE_AGENT_URL` 访问的 `agent-core` 路径（包括但不限于 Skill 写操作、`/features/avatar/greeting`），系统 SHALL 改为：**浏览器仅请求 `skill-gateway`**，由 `skill-gateway` 再调用 `agent.core.url` 或等价业务逻辑；浏览器 SHALL NOT 在生产配置下直连 `agent-core` 完成上述能力。

#### Scenario: Skill 写操作不经 agent-core 浏览器面

- **WHEN** 用户在浏览器中创建、更新或删除 Skill
- **THEN** 请求发往 `skill-gateway` 的 REST 接口并成功持久化或返回错误，且网络路径中不出现浏览器到 `agent-core` 的 HTTP 调用

#### Scenario: 登录后问候经网关

- **WHEN** 前端在登录后请求问候语（原 `POST /features/avatar/greeting` 语义）
- **THEN** 请求发往 `skill-gateway`，网关调用 `agent-core` 对应接口并将响应返回浏览器，前端可继续解析现有 JSON 结构或按文档迁移

### Requirement: 与 agent 机器间调用区分

`skill-gateway` 对 `agent-core` 的调用（任务 SSE、记忆注入、头像生成代理等）与本 Requirement 并列存在；**用户浏览器**身份与 **`X-Agent-Token`（agent-core 调网关工具面）** SHALL 分轨，不得要求终端用户在浏览器中设置 `JAVA_GATEWAY_TOKEN`。

#### Scenario: 浏览器不写 Agent Token

- **WHEN** 已登录用户通过浏览器调用 Skill 写接口
- **THEN** 网关在校验用户身份（现有或过渡方案）后完成写操作，不依赖浏览器请求头携带 `X-Agent-Token`
