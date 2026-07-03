## Why

内网 LLM 流式响应在 `agent-core` 的 LangChain ChatOpenAI 解析层崩溃：

- `glm-4.7-flash`：流末尾发空 `choices: []` / 缺 `delta.role` / 缺 `message` / `stop_reason` 是数字 → 报 `Cannot read properties of undefined (reading 'message')`
- `qwen3.6`（CoT 模型）：`delta.reasoning` 字段携带推理内容，但 LangChain 只看 `delta.content`，推理内容被丢弃
- `qwen3`：格式未知，待用户提供样本

`llm-request-role-normalize.ts`（`554f7c8` + `a28f945`）已经写了 `normalizeChunk()` 做字段清洗，但**清洗只改了内存里的 chunk 对象，没把改动写回 SSE 流**，所以下游 LangChain 收到的还是原始非标准字段。**该 bug 是非流式能跑、流式不能跑的根本原因。**

按用户当前配置（`AGENT_STREAMING=false`）本应关闭流式，但实际仍存在流式调用路径（用户截图含 SSE 输出）。

## What Changes

1. **修复 SSE 流式 normalize 写回 bug**（核心）
   - 在 `filterEmptyChoicesFromSSE()` 内，把 `normalizeChunk(chunk)` 修改后的对象 `JSON.stringify` 重新生成 `data: <json>` 行写回 SSE 流，而不是输出原始 line 字符串。

2. **qwen3.6 CoT 推理合并**
   - 在 `normalizeChunk()` 末尾，若 `choice.delta.reasoning` 存在，将其内容拼接到 `choice.delta.content`（reasoning 优先于 content，便于调试时观察），让 LangChain 累积内容时带上推理。

3. **单元 / 集成测试**
   - 用 GLM-4.7-Flash / qwen3.6 真实 chunk 字符串验证流式 normalize 写回。
   - 加 `llm-request-role-normalize.spec.ts` 覆盖 normalizeChunk 单元测试 + filterEmptyChoicesFromSSE 流式集成测试。

## Capabilities

### New Capabilities
- `llm-streaming-normalize`: 流式响应字段清洗与写回（SSE 转码器内部行为）

### Modified Capabilities
（无现有 capability 修改；新建能力描述）

## Impact

- `backend/agent-core/src/utils/llm-request-role-normalize.ts`: 修复 SSE 写回 + 新增 reasoning 合并
- 新增 `backend/agent-core/src/utils/llm-request-role-normalize.spec.ts`: 单元测试
- 不影响 `agent-core` 之外模块（`skill-gateway`、`frontend`、`agent-core` 其余 controller/service）
- 不引入第三方包（AGENTS.md 5.1）
- 不新增 env 变量（AGENTS.md 5.2）

## AGENTS.md 5.5 架构侵入说明

按 5.5 规约，回答以下问题：

- **为什么不能走 Tool 接入？**
  SSE 转码器是 `composeOpenAiCompatibleFetch()` 这一 fetch wrapper 的一部分，包裹 LangChain 内部的 OpenAI 客户端调用，不在 Gateway Tool 接口层。把修复放到 gateway 会让 agent-core 调用 gateway 时仍要走一层非标准协议适配，徒增复杂度。LLM 协议适配是 agent-core 的本职。

- **对 agent-core 哪些模块有影响？**
  仅 `src/utils/llm-request-role-normalize.ts` 一个文件 + 新增 spec 文件。其他 controller / service / feature 模块零侵入。

- **对现有 Skill 类型兼容性？**
  api / ssh / template / openclaw / ExternalService 全部走 LangChain ChatOpenAI 调用，**所有 Skill 类型都受益**（不再因内网模型崩）。无破坏性改动。

- **agent-core 回归测试范围？**
  - 单元：`normalizeChunk` 各字段注入、删除、合并；`filterEmptyChoicesFromSSE` 写回路径
  - 集成：GLM-4.7-Flash 真实 SSE / qwen3.6 CoT SSE / 标准 OpenAI 流式（deepseek-v4-pro）三条对照
  - 回归：现有 Skill（api / ssh）发起对话流式仍正常