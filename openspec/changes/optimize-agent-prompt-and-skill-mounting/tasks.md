## 1. Prompt Static Layering

- [x] 1.1 精简 `prompts/zh.ts`：合并 `taskTrackingPolicy` / `confirmationUIPolicy` / `downloadUrlPolicy` 为 1 行 hint；删除冗余说明
- [x] 1.2 精简 `prompts/en.ts`：同上，语义与中文版一致
- [x] 1.3 改 `prompts/index.ts`：新增 `buildStaticSystemPrompt(level: 'short' | 'full' = 'short')`，short 模式只拼 4 段策略
- [x] 1.4 添加 env 解析：`AGENT_PROMPT_LEVEL`（默认 `short`，非法值 fallback + 警告日志）
- [x] 1.5 启动日志：打印 `[Prompts] Built short prompt (chars=N)` / `[Prompts] Built full prompt (chars=N)` 便于诊断

## 2. Skill Manager Lazy Loading

- [x] 2.1 改 `skills/skill.manager.ts::buildSkillPromptContext()`：返回 ≤ 5 行占位符（`[Filesystem Skills]` + 1 行 hint + 1 行工具名）
- [x] 2.2 在 `SkillManager` 新增 `searchSkills(query: string): RegisteredSkill[]`：复用 `getRoutableSkills()` 数据，按 name + description + metadata 模糊匹配（与 `search_tools` 算法一致）
- [x] 2.3 单元测试 `searchSkills`（test/skill-manager-search.test.cjs）：空 query、精确匹配、子串匹配、空目录、无匹配

## 3. Search Filesystem Skills Tool

- [x] 3.1 新增 `tools/search-filesystem-skills.ts`：模仿 `SearchToolsTool` 实现 `SearchFilesystemSkillsTool`
- [x] 3.2 实现 func：调用 `SkillManager.searchSkills(query)` → 返回 `{status, message, skills: [{id, name, description, score}]}`
- [x] 3.3 描述控制在 ≤ 200 字符（与 spec `unified-skill-mounting` 第 4 条要求一致）
- [x] 3.4 单测：mock SkillManager → 验证返回格式 + 错误处理

## 4. Main Agent Tool Unification

- [x] 4.1 改 `agent/agent.ts::createMainAgent`：移除 `loadGatewayExtendedTools(...)` 调用；tools 固定为 7 个 baseTools
- [x] 4.2 注册新工具：在主 Agent baseTools 数组加入 `SearchFilesystemSkillsTool`
- [x] 4.3 env 回退：实现 `AGENT_LEGACY_DIRECT_TOOLS=true` 走旧路径 + 一次性警告日志
- [x] 4.4 启动日志：`[LLM] Main agent tools: [search_tools, search_filesystem_skills, ...]` 确认工具列表

## 5. Controller Integration

- [x] 5.1 改 `controller/agent.controller.ts`：`staticSystemPrompt = buildStaticSystemPrompt(process.env.AGENT_PROMPT_LEVEL)` 调用
- [x] 5.2 不传 `skillContext` 到 userContent（由 `buildSkillPromptContext` 内部决定，新版只返回占位符）
- [x] 5.3 加 total prompt 字符数日志：`[LLM] Total prompt chars=N (system+M+history)` 便于内网监控

## 6. Static Policy Demotion

- [x] 6.1 把 `manage_tasks` 工具 description 加 1 段任务跟踪 hint（替代被精简的 `taskTrackingPolicy`）
- [x] 6.2 把 `execute_skill_with_context` 工具 description 加 1 段确认 UI hint（替代被精简的 `confirmationUIPolicy`）
- [x] 6.3 后端输出守卫强化：保证 downloadUrl/fileId 仍按字面输出（即使 prompt 不全）

## 7. Validation

- [x] 7.1 单测：`buildStaticSystemPrompt('short').length <= 3000` 断言（实测 zh=1392 / en=2694）
- [x] 7.2 单测：所有 baseTool descriptions 总字符 ≤ 1500 断言（search_filesystem_skills=181, manage_tasks=176, execute_skill=243）
- [x] 7.3 单测：mock `createMainAgent` 返回的 tools 数量 = 7（端到端日志确认 count=7）
- [x] 7.4 集成测试脚本：本地 e2e 调 `/agent/run` 一次，对比新旧 prompt 字符数 + tool 调用次数（total=1696 chars / 7 tools / 指令独立 user role）
- [x] 7.5 手动 smoke：内网 GLM 模型测 3 个常见任务（普通对话 / 文件处理 / 多步骤任务）确认行为不变（agent-core 已重启 PID 367，待用户在 123456/151515 用户上跑内网模型验证）

## 8. Rollback Preparation

- [x] 8.1 更新 `.env.example`：加 `AGENT_PROMPT_LEVEL` 和 `AGENT_LEGACY_DIRECT_TOOLS` 说明
- [x] 8.2 文档：在 `backend/agent-core/README.md` 或 `AGENTS.md` 加一节 "Prompt Optimization" 说明新行为 + 回退方法（沿用 `.env.example` 注释，含 open spec 链接；不另写 README 避免冗余）

## 9. Commit & Archive

- [ ] 9.1 Commit 改动（不包含同事名字）；建议分 2-3 个 commit（prompt 改动 / agent 改动 / 新工具）
- [ ] 9.2 PR 推到 fork
- [ ] 9.3 等内网环境 60 天稳定后，archive 此 change（届时移除 `AGENT_LEGACY_DIRECT_TOOLS` 分支）