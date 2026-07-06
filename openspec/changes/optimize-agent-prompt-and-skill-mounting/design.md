## Context

### 当前状态

每次 `POST /agent/run` 请求，agent-core 在 [controller/agent.controller.ts:763-786](file:///Users/dccb/botproject/fishtank/backend/agent-core/src/controller/agent.controller.ts#L763-L786) 构造的 LLM 输入包含：

```
┌─ system (systemContent)        ─ 100-500 tokens   profileDetails (mem0)
├─ userContent (拼接)             ─ 2300-5300 tokens
│   ├ staticSystemPrompt        ─ 1500-2000 tokens  7 策略全文（zh.ts 7885 字符）
│   ├ skillContext              ─ 500-2000 tokens   filesystem skills 全展开
│   ├ memoryContext             ─ 200-800 tokens    top 10 memories
│   └ instruction               ─ 50-500 tokens
├─ LangChain tool descriptions   ─ 600-2000 tokens   6 baseTools + N extended
└─ sanitizedHistory              ─ 500-3000 tokens
                   总计:        3500-10000+ tokens
```

### 已有架构

- **主 Agent** (`createMainAgent`): 挂 6 baseTools + 全部 extended gateway tools（按 ownerType=1 + conversation）
- **子 Agent** (`createSubAgent`): 只挂指定 skillIds 对应的 extended tools，**但实际很少被调用**（主 Agent 已经直接挂载了）
- **`search_tools` 工具**: 主 Agent 主动调用，按 query 模糊匹配 gateway 系统技能（owner_type=2）
- **`buildSkillPromptContext`**: filesystem skills（`./SKILLs/` 下的 SKILL.md）描述全展开注入 userContent

### 问题

内网模型（GLM-4-Flash / qwen3 / qwen3.6）实测：
- 长 prompt 下首字延迟 30s+，容易超时（流式断流）
- 模型分不清该调哪个 tool（description 过多导致决策混乱）
- 用户技能直接挂载主 Agent 反而**绕过**了 search → execute 路径的设计意图（架构冗余）

### 约束

- **不破坏现有主 Agent 规划 + 子 Agent 执行的架构**
- **对外 API 不变**（`POST /agent/run` 响应格式不变）
- **现有 .env 配置不强制迁移**
- 内网模型可能不擅长长指令 → 静态提示词需保留核心约束（不能丢安全性相关策略）

## Goals / Non-Goals

**Goals:**
- 主 Agent 每次请求的 prompt 体积减少 50-70%（从 3500-10000 降到 2000-4000 tokens）
- 主 Agent 工具列表从「6 baseTools + N extended」精简到「7 baseTools 固定」，减少 LLM 决策复杂度
- 所有技能（filesystem + gateway）通过统一的 search → execute_skill_with_context 路径触发
- 保留 emergency rollback 入口（`AGENT_LEGACY_DIRECT_TOOLS=true`）

**Non-Goals:**
- 不做语义检索 / embedding 升级（保持模糊匹配）
- 不改 skill-gateway 的 API（gateway 端不动）
- 不动 LLM 模型选择 / 流式开关（已在前一个 change 修过）
- 不重写 LangChain Agent 创建逻辑（保持 `createReactAgent` + `MemorySaver`）

## Decisions

### Decision 1: 静态提示词分层 + 短版默认

**做法**：在 `prompts/index.ts` 加 `buildStaticSystemPrompt(level: 'short' | 'full' = 'short')`：
- **short**（默认）：只拼 `agentRolePrompt + skillDiscoveryPolicy + extendedSkillRoutingPolicy + skillGeneratorPolicy`，目标 ≤ 3000 字符
- **full**（旧行为）：原 7 段全拼
- **env 控制**：`AGENT_PROMPT_LEVEL=full` 走老路径

**被降级到 tool description 的 3 段**：
- `taskTrackingPolicy` → 合并进 `manage_tasks` 工具 description
- `confirmationUIPolicy` → 合并进 `execute_skill_with_context` 工具 description
- `downloadUrlPolicy` → 后端输出守卫强制（不靠 prompt 兜底），prompt 里只保留 1 行 hint

**为什么**：保留可后置的策略避免主 Agent 决策混乱，安全性靠后端守卫兜底。

**备选考虑**：
- ❌ 用 LLM 压缩每条策略（GPT-4 压缩）：增加 +500ms 延迟，违背"减少内网负载"目标
- ❌ 全部扔进 tool description：tool description 也进 prompt，没省 token
- ✅ 分层 + env 控制：保留灵活性 + 最小改动

### Decision 2: 主 Agent 不挂 extended tools

**做法**：修改 [agent/agent.ts:183](file:///Users/dccb/botproject/fishtank/backend/agent-core/src/agent/agent.ts#L183) `createMainAgent`：
- 移除 `loadGatewayExtendedTools(...)` 调用
- `tools` 数组固定为：`[search_tools, search_filesystem_skills, execute_skill_with_context, skill_generator, compute, server_lookup, manage_tasks]`
- 子 Agent (`createSubAgent`) **完全不变**

**env 回退**：`AGENT_LEGACY_DIRECT_TOOLS=true` 时保留旧行为（gateway extended tools 直接挂主 Agent）。

**为什么**：
- 现状是双轨制（extended 直接挂 + search_tools 检索系统技能），架构冗余
- 统一为 search → execute 路径符合 "AGENTS.md 5.5" 里描述的两级 Agent 设计意图
- 主 Agent 工具从「6+N」变成「7」，LLM 不会在 50 个 tool 里瞎选

**备选考虑**：
- ❌ 限制 extended tools 数量到 top 5：仍然是 LLM 决策难题，没解决根因
- ❌ 只挂高频工具，动态加低频工具：实现复杂（需要 LLM 主动触发加挂），收益不确定
- ✅ 全部走 search → execute：架构清晰，prompt 减少

### Decision 3: filesystem skills 通过专用工具检索

**做法**：
- 新增 [tools/search-filesystem-skills.ts](file:///Users/dccb/botproject/fishtank/backend/agent-core/src/tools/)：模仿 `search_tools`，但调用 `SkillManager.searchSkills(query)` 而不是 gateway
- `SkillManager.searchSkills(query)`：复用 `getRoutableSkills()` 数据，按 name + description + metadata 模糊匹配
- `buildSkillPromptContext()` 改成 5 行占位符（提示用 `search_filesystem_skills` 工具）

**为什么**：
- 主 Agent 工具从 6 变 7，但**单个工具 description** 远比"30 个 skill 全展开"小
- filesystem skills 仍能被检索到（通过 `search_filesystem_skills` + `execute_skill_with_context` 组合）
- 与 gateway skills 走相同路径，架构一致

**备选考虑**：
- ❌ 在主 Agent 加 filesystem skills 的 dynamic tool（按需加载）：LangChain 不支持 tool 动态加挂
- ❌ 把 filesystem skill descriptions 移到 system prompt 而不是 userContent：进 prompt 的字符数一样
- ✅ 专用检索工具 + lazy skill loading：标准 LangChain 模式

### Decision 4: 保留 AGENT_LEGACY_DIRECT_TOOLS 回退

**做法**：保留旧行为作为 env 回退。新行为默认开启；设 `AGENT_LEGACY_DIRECT_TOOLS=true` 时完全保留旧实现。

**为什么**：
- agent-core 是基础设施层（AGENTS.md 5.5），改动需要 emergency rollback 入口
- 用户 / 同事正在内网模型上调试，需要能快速回退到旧 prompt 模式验证
- env 控制而非 feature flag：避免代码复杂度（不需要持久化 / 数据库标记）

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| **R1: 主 Agent 行为变化**（不再直接调 extended tools）| 监控 `/agent/run` 的 trace 日志，对比新旧行为；保留 `AGENT_LEGACY_DIRECT_TOOLS=true` 回退 |
| **R2: skill retrieval round-trip 增加延迟**（多 1 次 LLM 调用 ≈ 1-3s）| prompt 减少 50-70% 抵消延迟；内网模型 TTFT 减少更明显 |
| **R3: filesystem skills 检索后子 Agent prompt 仍可能长** | 子 Agent (`createSubAgent`) 不变，仍按需加载指定 skills；后续可单独优化子 Agent prompt |
| **R4: 同事 / 用户对"主 Agent 工具减少"不适应** | 文档化在 `.env.example` 加注释；OpenSpec proposal review 阶段征询同事意见 |
| **R5: 测试覆盖不足**（agent behavior 难单测） | 加 e2e 脚本：调用 `/agent/run` → 比对 skill 调用次数和 prompt 体积；保留 manual smoke test 清单 |
| **R6: AGENT_LEGACY_DIRECT_TOOLS 路径变成"永久双轨"** | 60 天后过期移除（写入 tasks.md）|

## Migration Plan

### 阶段 1：实施 + 单测（本地，1-2 天）
1. 改 `prompts/zh.ts` + `prompts/en.ts`：7 段精简为 4 段
2. 改 `prompts/index.ts`：加 `buildStaticSystemPrompt(level)`
3. 改 `agent/agent.ts`：`createMainAgent` 移除 `loadGatewayExtendedTools`
4. 新增 `tools/search-filesystem-skills.ts`
5. 改 `skills/skill.manager.ts`：`buildSkillPromptContext()` 改占位符 + 新增 `searchSkills(query)`
6. 改 `controller/agent.controller.ts`：注册新工具 + 默认 short prompt
7. 单测：prompt 字符数断言、search_filesystem_skills 行为、createMainAgent tools 长度

### 阶段 2：内网部署 + 监控（用户环境，1-2 天）
1. 部署到内网环境（与已有 `optimize-llm-streaming-normalize` change 一起）
2. 监控 trace 日志：tool 调用频次、prompt 体积、首字延迟
3. 对比新旧数据：内网 GLM 模型 TTFT、流式断流频率

### 阶段 3：清理（30-60 天后）
- 如果新行为稳定，移除 `AGENT_LEGACY_DIRECT_TOOLS` 分支
- 归档此 change 到 `archive/`
- 更新 `.env.example`：移除 `AGENT_LEGACY_DIRECT_TOOLS` 文档

### Rollback 流程

任一阶段发现 regression：
1. 设 `AGENT_LEGACY_DIRECT_TOOLS=true` + `AGENT_PROMPT_LEVEL=full` + 重启 agent-core
2. 行为完全恢复为 change 前的状态（旧的 7 段 prompt + 主 Agent 挂 extended tools）
3. 在 OpenSpec `proposal.md` 标注 rollback reason