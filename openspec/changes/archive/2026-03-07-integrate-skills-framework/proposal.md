## Why

当前 Agent 缺乏标准化的动态扩展能力。接入 skills 框架后，Agent 可以通过「插件式」加载不同 skill 来执行专项任务（如 web search、coding、文件操作等），提升模块化、便于扩展，并能在不修改核心逻辑的前提下处理更多用户请求。

## What Changes

- **添加 Skill Manager**：实现用于注册、发现和调用 skill 的管理器。
- **定义 Skill 接口**：为所有 skill 建立标准契约（metadata + 执行逻辑）。
- **实现 Skill 注册**：支持从目录或列表批量注册多个 skill。
- **与 Agent 集成**：更新 Agent 的认知循环（或 tool 选择机制），将已注册 skill 作为可用 tools。
- **优化 Token 使用**：通过 skill 的 metadata（name、description、schema）让 Agent 理解 skill，无需将完整实现加载到 context。

## Capabilities

### New Capabilities
- `skills-framework`：加载、管理、执行 skill 的核心框架。
- `skill-discovery`：通过 metadata 让 Agent 理解可用 skill 的机制（token 高效）。

### Modified Capabilities
- `agent-core`：更新 Agent 执行循环以支持动态 skill 调用。

## Impact

- **代码库**：新增或整合 `src/skills` 目录到 backend 结构，修改 Agent 相关 class/service。
- **依赖**：可能需要校验或补充 imported skills 代码所需的依赖。
- **系统**：Agent 运行时行为变更，支持动态 tools。
