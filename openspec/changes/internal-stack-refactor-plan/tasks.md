## 1. 契约

- [x] 1.1 在 `doc/internal-stack-api-draft.yaml` 中补充「浏览器仅经网关」的 Skill 写路径与问候代理路径，并与实现 diff 一致

## 2. skill-gateway（BFF，消除浏览器直连 agent）

- [x] 2.1 **Skill 写**：使浏览器可通过网关完成 Skill 创建/更新/删除（不经过 agent-core 代理）；调整 `SecurityConfig`，避免要求浏览器发送 `X-Agent-Token`（由服务端注入或走 `SkillService` 直连 DB）
- [x] 2.2 **问候语**：新增转发至 agent-core `POST /features/avatar/greeting` 的 API，请求/响应与现 `useChat` 消费方式兼容
- [x] 2.3 集成测试或手动脚本：验证上述路径在仅启动 gateway + agent-core 时可用（`SkillControllerCrudTest#createSkill_withoutAgentToken_succeedsForBrowserGatewayPath` + `scripts/verify-gateway-browser-bff.sh`）

## 3. frontend

- [x] 3.1 `useSkillHub`：将所有 `agentUrl('/features/skills'...)` 改为调用网关 Skill 写接口（`apiUrl`）
- [x] 3.2 `useChat`：将 `agentUrl('/features/avatar/greeting')` 改为 `apiUrl` 调用网关问候接口
- [x] 3.3 移除生产环境对 `VITE_AGENT_URL` 的依赖；更新 `vite.config`、`.env.example` 与部署说明
- [x] 3.4 回归：Skill Hub CRUD、登录后问候、对话任务（仍为 `apiUrl` + SSE）与 LLM 日志展示（`npm run test`、`npm run build`、网关 CRUD 测试）

## 4. 文档与清理

- [x] 4.1 更新 `docs/ARCHITECTURE.md` 或 `doc/internal-stack-refactor-dev-plan.md` 中与「本变更范围」相关的拓扑描述（浏览器仅 → gateway → agent）
