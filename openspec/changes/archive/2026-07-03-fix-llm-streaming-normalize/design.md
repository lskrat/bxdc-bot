## Context

`llm-request-role-normalize.ts` 在 `composeOpenAiCompatibleFetch()` 里包裹 LangChain ChatOpenAI 的 fetch 调用，作用：

1. **非流式**：`normalizeJsonResponse()` 把 `stop_reason` 数字 / 缺 `message` / 缺 `finish_reason` 注入占位字段，重新 `JSON.stringify` 返回。
2. **流式**：`filterEmptyChoicesFromSSE()` 拦截 SSE 流：
   - 丢弃 `choices: []` 的 usage 统计块（防 LangChain 解析崩）
   - 调用 `normalizeChunk()` 清洗非标准字段

**当前 bug**：`normalizeChunk()` 改的是内存对象，但 SSE 输出用的是**原始 line 字符串**：

```ts
try {
  const chunk = JSON.parse(payload);    // 解析
  if (条件) continue;                   // drop 块
  normalizeChunk(chunk);                // 改 chunk 对象
} catch { ... }
controller.enqueue(encoder.encode(line + '\n'));  // ❌ 输出原始 line
```

`line` 是字符串，`chunk = JSON.parse(line)` 修改 chunk 不影响 line。结果：**所有清洗白做**，LangChain 收到的还是原始 GLM 流（缺 message、缺 finish_reason、stop_reason 是数字）。

**为什么同事两次 commit 没发现**：非流式路径走 `normalizeJsonResponse`，那条路径**真的有重新 stringify**，所以测试时同事很可能跑的非流式请求，没暴露流式 bug。

## Goals / Non-Goals

**Goals:**
- 让 `normalizeChunk()` 在流式路径上真正生效（修 SSE 写回 bug）
- qwen3.6 的 `delta.reasoning` 推理内容合并到 `delta.content`，前端能看到完整 LLM 输出
- 保持现有非流式路径行为不变
- 不破坏任何标准 OpenAI 兼容模型（deepseek-v4-pro / qwen3.5 / GPT-4o 等）
- 单元 + 集成测试覆盖关键路径

**Non-Goals:**
- 不在 gateway 侧做 SSE 转码（agent-core 层是正确位置）
- 不改 LangChain 客户端配置
- 不动 `composeOpenAiCompatibleFetch()` 的对外签名
- 不引入 OpenAI SDK / SSE parser 等新包（AGENTS.md 5.1）
- 不修复 qwen3（非标准）模型，等用户提供样本后再单独评估
- 不动非流式 normalizeJsonResponse 的现有行为

## Decisions

### Decision 1：流式 SSE 写回修复（核心）

**方案：** 把 normalize 后的 chunk 重新 stringify 成 data 行写回，而不是输出原始 line。

```ts
for (const line of lines) {
  if (!line.startsWith('data: ')) {
    controller.enqueue(encoder.encode(line + '\n'));
    continue;
  }
  const payload = line.slice(6);
  if (payload === '[DONE]') {
    controller.enqueue(encoder.encode(line + '\n'));
    continue;
  }
  let parsed: any = null;
  try {
    parsed = JSON.parse(payload);
  } catch {
    controller.enqueue(encoder.encode(line + '\n'));
    continue;
  }
  // 1) drop choices:[]
  if (!parsed.choices || !Array.isArray(parsed.choices) || parsed.choices.length === 0) {
    continue;  // 不写回
  }
  // 2) 清洗 + reasoning 合并
  normalizeChunk(parsed);
  // 3) 重新写回
  const newPayload = JSON.stringify(parsed);
  controller.enqueue(encoder.encode('data: ' + newPayload + '\n'));
}
```

**理由：**
- 唯一能真正让清洗生效的写法
- 与现有 `normalizeJsonResponse()` 的"重新 stringify 返回"对称
- 控制流清晰：早返 + 一次写回

### Decision 2：reasoning 合并策略

**方案：** reasoning 优先拼接（reasoning 在前，content 在后）：

```ts
if (choice.delta.reasoning && typeof choice.delta.reasoning === 'string') {
  const existing = choice.delta.content || '';
  choice.delta.content = choice.delta.reasoning + existing;
}
```

**理由：**
- 用户要求"qwen3.6 可以成功模型的流式输出是这样的格式"——用户实际用 qwen3.6 看到了正常输出，意味着现有 reasoning 字段已经在流里，只是被 LangChain 当成非标准字段丢弃
- 拼接到 content 前端能看到完整推理过程（透明）
- 后续若发现不需要推理展示，再加 env var 控制（不在本次 scope）

### Decision 3：测试策略

**单元测试** (`llm-request-role-normalize.spec.ts`)：
- `normalizeChunk` 各 case：缺 role / 缺 message / 缺 finish_reason / 有 stop_reason / reasoning 合并
- `filterEmptyChoicesFromSSE` mock Response 测流式写回：drop choices:[], 写回清洗后行, [DONE] passthrough, 非 data: 行 passthrough

**集成验证（手测，非自动化）**：
- 切到 GLM-4.7-Flash → `/agent/run` 发流式请求，确认无 `Cannot read properties of undefined` 报错 + 看到完整输出
- 切到 qwen3.6 → 同上，确认能看到推理内容（**不是标准 OpenAI 字段，需用户在 UI 确认**）
- 切到 deepseek-v4-pro → 回归，确认行为无变化

### Decision 4：qwen3 暂不修

**方案：** qwen3 在本次 change 范围内不动，等用户拿到 qwen3 流式 chunk 样本再单独评估。

**理由：**
- 用户只给了 qwen3.6 的样本，qwen3 格式未知
- 在不知道格式的情况下加兼容性代码，可能引入新的 bug
- 后续 qwen3 可以是独立的 change

## Risks / Trade-offs

### 风险 1：SSE 重新 stringify 性能

**风险：** 每条 chunk 都要 JSON.parse + normalize + JSON.stringify，相比原来直接透传 line 字符串有性能损耗。
**量级：** 内网 LLM 流式典型 50-200 chunk / 请求，每次 stringify 几十微秒，整体 < 10ms 影响。
**缓解：** 可接受。LangChain 内部本来就要 JSON.parse；normalize 的清洗是几行 if 判断 + 一两个赋值，开销可忽略。

### 风险 2：reasoning 合并破坏非 qwen3.6 模型的格式

**风险：** 若其他模型也用 `delta.reasoning` 但语义不同（不是 CoT 推理），合并可能误导。
**缓解：** 检查 `reasoning` 必须是字符串且非空才合并（与现有 stop_reason / message / finish_reason 检查一致风格）。若其他模型也有 reasoning，语义通常也是推理内容（OpenAI 后续也会加 reasoning 字段），合并是兼容的。

### 风险 3：同事的非流式路径可能也隐含依赖"line 透传"

**风险：** 假如同事有调试代码依赖原始 line 字符串（不太可能）。
**缓解：** 非流式路径完全不动，只改 SSE 分支。`llm-raw-http-log.ts` 仍用原始 response body（独立路径，不受影响）。

### 风险 4：JSON.stringify 顺序可能与原始不一致

**风险：** JSON.stringify 字段顺序与原始不一致，下游若有顺序依赖会出问题。
**缓解：** 实践上 JSON 对象 key 顺序在 JavaScript 引擎实现中通常保持插入顺序；normalize 在原对象上 delete + add key，顺序天然保持。LangChain 不依赖 key 顺序。

## Open Questions

1. **qwen3 用户的具体场景？** 走 `/agent/run` 流式还是某个 Skill 流式？需要用户提供一份 qwen3 SSE 样本才能继续。
2. **AGENT_STREAMING 是否要默认改 true？** 当前 `.env` 设 false 是因为内网模型流式 bug，bug 修后可考虑改回 true 启用流式。本次 change 不动 .env，由用户自行决定。
3. **reasoning 合并是否要加 env var 控制？**（如 `LLM_MERGE_REASONING=true`）本次默认开，不加 env，符合"不新增 env 变量"（AGENTS.md 5.2）。后续若有问题再加。