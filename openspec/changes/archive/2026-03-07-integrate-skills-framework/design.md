## Context

当前 Agent 具备固定的 capabilities 或 tools 集合。我们有一份来自「有道龙虾」项目的 skills 代码（位于 `src/skills`），希望将其接入。该代码应包含 skill 定义及运行机制。我们需要改造当前 Agent，使其能加载这些 skills 并暴露给 LLM。目标是简单接入：支持注册多个 skill，并允许 Agent 调用。暂不实现 marketplace 或复杂分发体系。

## Goals / Non-Goals

**Goals:**
- **标准化 Skill 接口**：定义 skill 的结构（metadata、handler）。
- **Skill Registry**：加载并维护可用 skills 的系统。
- **LLM 集成**：将 skill metadata 转换为 LLM 可理解的格式（如 OpenAI function calling）。
- **动态调用**：当 LLM 请求时执行 skill 代码。
- **效率**：用 metadata 填充 context 以节省 token，仅在需要时加载执行逻辑。

**Non-Goals:**
- **Skill Store / Marketplace**：不做远程浏览/安装 skill 的 UI 或 backend。
- **Sandboxing**：当前 skills 在主进程运行（除非 imported 代码已处理）。
- **复杂依赖管理**：假设 skill 依赖已就绪或可简单管理。

## Decisions

### 1. Skill 结构与接口
**Decision**：采用 imported `src/skills` 代码中的结构（如 `index.ts` 等导出）。
**Rationale**：复用现有代码减少工作量。定义 `Skill` 接口，包含：
- `name`：唯一标识。
- `description`：供 LLM 理解的自然语言描述。
- `schema`：参数 JSON schema。
- `handler`：执行函数。
**Alternatives**：重新定义结构。因希望复用现有代码而放弃。

### 2. Registry 实现
**Decision**：实现 `SkillManager` 类（Singleton 或 Service）。
**Rationale**：集中提供 `register()`、`get()`、`list()`，并负责将 skill 对象转换为 LLM tool 定义。

### 3. Agent 集成方式
**Decision**：将 `SkillManager` 注入 Agent 上下文。每轮开始时 Agent 向 `SkillManager` 获取 tool 定义；当模型输出 tool call 时，Agent 委托 `SkillManager` 执行。
**Rationale**：解耦 Agent 核心与具体 skill 实现，Agent 只感知「Tools」。

### 4. Metadata-First 加载
**Decision**：Skill 通过静态定义或轻量 manifest 提供 metadata，Agent 读取后填充 system prompt / tool 定义。
**Rationale**：满足「渐进理解」和节省 token 的要求，LLM 只看到 description 和 schema，不看到代码。

## Risks / Trade-offs

- **[Risk]**：Imported skills 可能依赖 `package.json` 中未声明的包。
  - **Mitigation**：审计 `src/skills` 的 import，在 `backend/agent-core/package.json` 中补充依赖。
- **[Risk]**：Skill 名称可能冲突。
  - **Mitigation**：在 `SkillManager` 注册时强制 name 唯一。
- **[Risk]**：Security —— skills 在主进程运行，可执行任意操作。
  - **Mitigation**：当前阶段接受（本地/可信 skill）。后续可考虑 Sandboxing。

## Migration Plan
1. 将 `src/skills` 迁移/重构到 `backend/agent-core/src/skills`。
2. 实现 `SkillManager`。
3. 更新 `Agent` 以使用 `SkillManager`。
4. 用测试 skill 验证。
