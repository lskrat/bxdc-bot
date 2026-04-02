## Context

当前 ReAct Agent 通过 LangChain `createReactAgent` 将工具绑定到模型，工具定义走 Chat 模型 API 的 tools 字段。部分自建网关或旧版兼容层对该字段支持不完整，模型侧「看不到」工具说明。系统侧已有独立的 `SystemMessage`（技能摘要、确认流程、记忆等），适合在同一系统消息末尾追加工具目录文本。

## Goals / Non-Goals

**Goals:**

- 提供可配置的兼容模式：开启时将工具说明写入系统 prompt，与现有 native 工具绑定**并存**（双通道冗余），最大化兼容「只认文本」的后端。
- 默认关闭，零配置下行为与当前版本一致。
- 对过长工具列表做可控的序列化与截断策略，避免单次请求撑爆上下文。

**Non-Goals:**

- 不要求首版支持按用户/会话从前端传参切换（可预留扩展点）。
- 不改为「仅 prompt、完全不传 tools」的模式（避免破坏仍依赖标准 function calling 的链路）；若未来需要，应单独变更并评估风险。

## Decisions

1. **开关载体**：使用环境变量（例如 `AGENT_TOOL_PROMPT_COMPAT=true`），在进程启动时读取；与现有 `agent-core` 其它 `process.env` 配置风格一致。首版不新增 REST 字段。
2. **内容与格式**：系统 prompt 中增加独立小节（如 `【可用工具】`），每条工具包含：`name`、`description`，以及参数 schema 的 JSON 字符串或 LangChain 工具暴露的 `schema` 精简序列化；顺序与当前 Agent 注册工具顺序一致。
3. **与 native tools 关系**：兼容模式开启时**仍** `createReactAgent({ tools })`，不在首版移除 API 侧 tools；避免部分栈仅缺「模型读说明」而实际仍靠标准 tool_calls 执行的情况失效。
4. **长度与工具数量**：对单工具 schema 字符串设合理上限（如字符数），超限则截断并标注省略；总块长度可设上限，超出时优先保留名称+描述、弱化或省略深层 schema。
5. **OPENCLAW / 嵌套 planner**：主对话层工具列表以传入 `createAgent` 的完整 `tools` 数组为准；子 planner 的 `bindTools` 不在首版重复注入系统 prompt（范围限定在主 Agent 会话系统消息）。

## Risks / Trade-offs

- **[Risk] 系统 prompt 膨胀 → 成本与截断** → Mitigation：长度上限、结构化截断、默认关闭。
- **[Risk] 文本与 API tools 表述不一致** → Mitigation：同一 `tools` 数组派生文本与绑定，避免手写重复维护。
- **[Risk] 模型误读纯文本为「不要调用工具」** → Mitigation：文案明确「须按协议发起工具调用」；仍保留 native tools。

## Migration Plan

1. 部署新版本，`AGENT_TOOL_PROMPT_COMPAT` 未设置 → 行为不变。
2. 需兼容问题网关时，在 `agent-core` 环境设为 `true`，观察工具调用与日志。
3. 回滚：去掉环境变量或设为 false 并重启。

## Open Questions

- 是否在后续将同一开关暴露到用户级 LLM 设置（与 `user-llm-settings` 协同）由产品决定；本设计预留从 `createAgent` / controller 注入布尔标志的扩展即可。
