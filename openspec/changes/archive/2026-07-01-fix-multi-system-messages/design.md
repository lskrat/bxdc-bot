## Design

### 消息结构变更

**变更前**（可能产生多条 system 消息）：
```
[0] system  ← profileDetails（独立 SystemMessage）
[1] user    ← "System:\n{staticSystemPrompt}\n\nUser Instruction:\n{instruction}"（提示词藏在 user 文本里）
preModelHook 后续 → unshift system  ← 任务状态摘要（又一条 SystemMessage）
```

**变更后**（始终仅一条 system 且首位）：
```
[0] system  ← profileDetails | 兜底话术
[1] user    ← "System:\n{staticSystemPrompt}\n\n{skillContext}\n\n{memoryContext}\n\nUser Instruction:\n{instruction}"
preModelHook 后续 → 不新增，合并到 [0] system 的 content
```

### preModelHook 改造

从"新增 system 消息"改为"修改已有 system 消息 content"：
- `findIndex` 找第一条 system 消息
- 找到 → 追加任务摘要到 content，重复调用时先切掉旧摘要
- 未找到 → `unshift(new SystemMessage(...))` 兜底

### 兜底话术

profileDetails 为空时用中文兜底：`"你是与本平台 Skill Gateway 集成的智能助手，请根据用户的指令和可用工具完成任务。"`

### 影响范围

| 文件 | 变更 |
|---|---|
| `agent.controller.ts` | 消息构造逻辑：单 system + user 含提示词/记忆 |
| `tasks-state.ts` | preModelHook 合并而非新增 system |
