## Why

当前 agent-core 每次发送给 LLM 的 prompt 包含 7 段静态策略全文（≈ 2000 tokens 中文）+ 全量 filesystem skills 列表 + 全量 extended tool descriptions，总计 3500–10000+ tokens。内网 GLM / qwen3 / qwen3.6 等中小模型在长 prompt 下出现：首字延迟高（30s+）、超时（流式断流）、模型分不清该调哪个 tool（description 过多）。需要减少 prompt 体积而不破坏现有的"主 Agent 规划 + 子 Agent 执行"双层架构。

## What Changes

- **精简静态提示词**（[prompts/zh.ts](file:///Users/dccb/botproject/fishtank/backend/agent-core/src/prompts/zh.ts) + [prompts/en.ts](file:///Users/dccb/botproject/fishtank/backend/agent-core/src/prompts/en.ts)）：合并 / 删减 7 段策略，把可后置的规则改为 tool description 的一部分或单行 hint。目标：从 7885 字符降到 ≤ 3000 字符（节省 ≈ 1000 tokens / 60%）
- **主 Agent 不挂 extended tools**（[agent/agent.ts](file:///Users/dccb/botproject/fishtank/backend/agent-core/src/agent/agent.ts) `createMainAgent`）：移除 `loadGatewayExtendedTools(...)` 调用。用户技能（owner_type=1）也走 search_tools → execute_skill_with_context 路径，与系统技能（owner_type=2）统一
- **filesystem skills 改 lazy**（[skills/skill.manager.ts](file:///Users/dccb/botproject/fishtank/backend/agent-core/src/skills/skill.manager.ts) `buildSkillPromptContext`）：不再把全部 skill descriptions 拼到 userContent；改为 5 行占位符（提示 LLM 用 `search_filesystem_skills` 工具主动检索）
- **新增 `search_filesystem_skills` 工具**：[tools/search-filesystem-skills.ts](file:///Users/dccb/botproject/fishtank/backend/agent-core/src/tools/) - 类似 `search_tools`（gateway 系统技能版），按 query 关键词模糊匹配 `./SKILLs/` 下的 SKILL.md
- **静态策略文件保留全部内容**作为 full reference，但默认只发送 short version。完整版通过 fallback 机制（如 LLM 显式请求"查看完整策略"时通过 tool 返回）

## Capabilities

### New Capabilities
- `prompt-strategy-layering`：静态策略分层（短版默认发 + 长版按需取），agent-core 必须支持按 env / model name 选择发送哪一层
- `filesystem-skill-search`：filesystem skills 通过专用 tool 检索，不在静态 prompt 里展开
- `unified-skill-mounting`：主 Agent 不直接挂 extended tools，用户技能和系统技能统一通过 search → execute_skill_with_context 路径

### Modified Capabilities

（无现有 capability 涉及 REQUIREMENTS 变更，纯实现细节优化）

## Impact

### 受影响代码

| 文件 | 改动 |
|---|---|
| `backend/agent-core/src/prompts/zh.ts` | 7 段策略精简 / 合并 |
| `backend/agent-core/src/prompts/en.ts` | 同上 |
| `backend/agent-core/src/prompts/index.ts` | `buildStaticSystemPrompt()` 支持分层输出（`short` / `full`） |
| `backend/agent-core/src/agent/agent.ts` | `createMainAgent` 移除 `loadGatewayExtendedTools` 调用；保留 `createSubAgent` 不变 |
| `backend/agent-core/src/skills/skill.manager.ts` | `buildSkillPromptContext()` 改成 5 行占位符；新增 `searchFilesystemSkills(query)` 方法 |
| `backend/agent-core/src/tools/search-filesystem-skills.ts` | **新增**：filesystem skills 搜索工具 |
| `backend/agent-core/src/controller/agent.controller.ts` | 注册新工具到主 Agent baseTools；按 env 决定发短版 / 长版 static prompt |

### 受影响 API

- `POST /agent/run`：内部行为变化（主 Agent 工具列表减少、prompt 体积减少）；**对外响应格式不变**
- `search_tools` 工具：语义不变（继续检索 gateway 系统技能）；但 agent 行为会更频繁地调用它
- 新增工具：`search_filesystem_skills`（主 Agent 注册到 baseTools）

### 依赖

- **无新增依赖**
- 内部依赖：skill.manager.ts 暴露搜索接口 → search-filesystem-skills.ts 消费
- 风险：filesystem skill 检索工具注册到主 Agent，**主 Agent 工具数量从 6 → 7**（baseTools +1）

### Skill 兼容性（AGENTS.md 5.5）

| Skill 类型 | 影响 |
|---|---|
| api / ssh / openclaw / template | 用户技能不再直接挂主 Agent，必须走 search → execute_skill 路径。多一跳延迟（+1 LLM round-trip ≈ 1-3s），但 prompt 减少 50% 抵消这个延迟 |
| Extension Skill (filesystem SKILL.md) | 必须通过 `search_filesystem_skills` 主动检索（不再自动注入）|

### 回归测试范围

1. **静态策略**：主 Agent 在常见任务下行为不变（角色使命 / 技能发现 / 扩展技能路由 / 下载链接策略仍生效）
2. **skill 检索**：filesystem skills 通过新工具检索后能正常执行
3. **子 Agent 路径**：`execute_skill_with_context` 创建的子 Agent 行为不变
4. **向后兼容**：现有 .env 配置不变；前端无感