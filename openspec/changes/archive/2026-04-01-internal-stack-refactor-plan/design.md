## Context

- **直连现状**：`useSkillHub` 对 `agentUrl('/features/skills')` 等发起请求，由 agent-core 的 `SkillProxyController` 再转网关；`useChat` 对 `agentUrl('/features/avatar/greeting')` 直连 agent-core。
- **目标拓扑**：浏览器只访问 `skill-gateway`；由网关调用 `agent.core.url` 上对应路径（或与现 agent 行为等价的适配层）。

## Goals / Non-Goals

**Goals:**

- 消除 **任意** 生产路径上 frontend → agent-core 的 HTTP 调用。
- 网关对 agent 的调用与现有 `TaskController` / `UserService` 代理模式一致（WebClient + SSE 或同步 HTTP）。
- 前端改造可独立联调：先网关接口就绪，再切换 `fetch` 基址。

**Non-Goals:**

- 不迁移网关数据库到 MySQL、不重构任务内存存储（除非多实例已阻塞联调，另议）。
- 不强制替换 Vue/Vite 或 Spring Boot 为公司另一套脚手架。
- 不在本变更实现完整 OIDC/SSO（与「跨系统鉴权」规划可并行另开变更）。

## Decisions

1. **Skill 写**：浏览器调用 **`/api/skills` 族网关接口**，由网关服务端使用 `JAVA_GATEWAY_TOKEN`（或等价）调用自身受保护写接口 / 或直接走 `SkillService` 持久化，**不**把 agent 当作浏览器写 Skill 的中转。  
   - *备选*：网关新增 `POST /api/agent/features/skills` 纯转发 — 可行但多一层与 agent 的耦合；优先与现 REST 模型统一。

2. **问候语**：网关新增 **`POST /api/.../greeting`**（路径以 OpenAPI 草稿为准），body 与现 `features/avatar/greeting` 对齐，网关转发至 agent-core，响应若含 LangChain 形态 JSON，网关可选 **透传**（前端已解析）或 **归一化**。

3. **契约**：变更网关路径时同步更新 `doc/internal-stack-api-draft.yaml`。

## Risks / Trade-offs

- **[Risk] SecurityConfig 当前对 `/api/skills` POST 要求 ROLE_AGENT** → 浏览器无法自带该 Token；必须在网关为「用户会话 + 服务端写库」单独放行或新控制器。  
- **[Risk] SSE 与短请求混在同一网关** → 仅问候为同步 JSON，风险低。  
- **[Trade-off] agent-core `/features/skills` 仅保留给 agent 自用** → 前端完全不再调用，文档注明。

## Migration Plan

1. 实现网关 BFF（Skill 用户写、问候代理）并在预发验证。  
2. 前端切换 `apiUrl`，移除 `agentUrl` 生产使用。  
3. 回滚：前端环境变量临时指回 `VITE_AGENT_URL`（不推荐长期保留）。

## Open Questions

- Skill 写接口是否复用现有 `SkillController` 的 URL 与 DTO，还是新增 `/api/user/.../skills` 以示「用户操作」边界。
