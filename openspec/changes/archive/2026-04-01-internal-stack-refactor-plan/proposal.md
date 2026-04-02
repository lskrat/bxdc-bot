## Why

当前 `frontend` 仍通过 `VITE_AGENT_URL` **直连** `agent-core`（Skill 写操作、登录后问候等），浏览器与 agent 之间形成第二条集成路径，违背「frontend 只认网关、agent-core 仅由服务端调用」的边界。本变更**仅聚焦**这一点：把存量「frontend → agent-core」改为 **frontend → skill-gateway → agent-core**。

## What Changes

- **frontend**：所有原 `agentUrl(...)` 调用改为 `apiUrl(...)` 调 skill-gateway；生产环境不再依赖 `VITE_AGENT_URL`（可删除或仅文档注明废弃）。
- **skill-gateway**：为上述能力补齐 **BFF 接口**——至少包括：
  - 浏览器侧 **Skill 创建/更新/删除**（服务端代持或校验身份后写库，避免要求浏览器携带 `X-Agent-Token`）；
  - **登录后问候**（代理至 `POST /features/avatar/greeting`，响应形态与现前端解析兼容或网关做适配）。
- **agent-core**：行为以「仅被 skill-gateway（及现有 agent→gateway 工具链）调用」为目标；**不要求**在本变更内改编排逻辑。
- **契约**：在 `doc/internal-stack-api-draft.yaml`（或等价）中明确新增/调整的网关路径与请求响应，供前后端联调。

**明确不在本变更范围（可另开变更）**：公司统一前端/Java 脚手架替换、MySQL 替换 H2、任务上下文 Redis/DB 化、跨系统 SSO、agent-core 入站 mTLS 等。

## Capabilities

### New Capabilities

- `agent-black-box-surface`：**不变**——仍描述 agent-core 供 **skill-gateway** 调用的 HTTP/SSE 契约（网关实现转发时所依赖）。
- `skill-gateway-frontend-bff`：**替代原 `skill-gateway-internal-stack` 在本变更中的范围**——仅要求网关作为浏览器访问 agent-core 相关能力的唯一入口（Skill 写、问候等），并保证与现 frontend 兼容。

### Modified Capabilities

- （无）不修改根目录 `openspec/specs/` 下既有业务 spec 条文；落地时如需可再开变更。

## Impact

- **frontend**：`useSkillHub.ts`、`useChat.ts`、`services/config.ts`、环境变量与代理配置。
- **backend/skill-gateway**：新增或调整 REST、Security 规则（浏览器写 Skill、问候代理）、对 `agent.core.url` 的调用。
- **backend/agent-core**：可无代码变更；若缩短暴露面可在后续变更中限制仅内网访问。
