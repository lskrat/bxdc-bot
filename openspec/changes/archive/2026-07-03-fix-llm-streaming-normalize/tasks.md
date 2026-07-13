## 1. 修复 SSE 写回 bug

- [x] 1.1 在 `backend/agent-core/src/utils/llm-request-role-normalize.ts` 的 `filterEmptyChoicesFromSSE()` 内，重构 `for (const line of lines)` 循环：
  - data 行 parse 失败 → 透传原行
  - data 行 parse 成功但 `choices: []` / 缺 choices → continue 不写回
  - data 行 parse 成功且 choices 有效 → 调用 `normalizeChunk()` → `JSON.stringify(parsed)` → `controller.enqueue('data: ' + newPayload + '\n')`
  - [DONE] → 透传
  - 非 data: 行 → 透传
- [x] 1.2 确认 `normalizeChunk()` 现有字段清洗逻辑（删 stop_reason / 注入 delta.role / 注入 message / 注入 finish_reason）不动

## 2. qwen3.6 reasoning 合并

- [x] 2.1 在 `normalizeChunk()` 的 for-of 循环末尾（finish_reason 注入之后）加：
  ```ts
  if (choice.delta.reasoning && typeof choice.delta.reasoning === 'string') {
    const existing = choice.delta.content || '';
    choice.delta.content = choice.delta.reasoning + existing;
  }
  ```
- [x] 2.2 确认 reasoning 字段不是字符串时（如 null）跳过合并

## 3. 单元测试

- [x] 3.1 新建 `backend/agent-core/test/llm-request-role-normalize.test.cjs`（项目用 cjs 而非 .spec.ts，按现有风格）
- [x] 3.2 `normalizeChunk` 单元测试覆盖：
  - 缺 `delta.role` → 注入 `assistant`
  - 缺 `message` → 注入 `{role, content: ''}`
  - 缺 `finish_reason` → 注入 `null`
  - 有 `stop_reason` 数字 → 删除
  - 有 `delta.reasoning` → 拼接到 `delta.content` 前
- [x] 3.3 `filterEmptyChoicesFromSSE` 集成测试（mock Response + ReadableStream）：
  - input 包含 `choices: []` → 输出流不包含该行
  - input 包含 `[DONE]` → 输出流包含
  - input 包含缺 message 的 chunk → 输出流中 message 字段被注入
  - input 包含 `delta.reasoning` 的 chunk → 输出流中 `delta.content` 拼上 reasoning
- [x] 3.4 测试结果：7/7 通过

## 4. 集成验证（手测）

- [ ] 4.1 重启 agent-core（`bash -c 'cd backend/agent-core && npm run start:dev'`）
- [ ] 4.2 `.env` 配 `OPENAI_MODEL_NAME=glm-4.7-flash`，前端发起对话
  - 期望：无 `Cannot read properties of undefined` 错误，看到完整回答
  - 后端日志无 normalize 相关异常
- [ ] 4.3 `.env` 配 `OPENAI_MODEL_NAME=qwen3.6-35b-a3b`，前端发起对话
  - 期望：看到完整输出（含推理过程拼接的内容）
- [ ] 4.4 `.env` 配 `OPENAI_MODEL_NAME=deepseek-v4-pro`，前端发起对话
  - 期望：行为与之前一致，回归通过

## 5. 提交

- [ ] 5.1 commit: `fix(agent-core): SSE 流式 normalize 写回 + qwen3.6 reasoning 合并`
  - 修改 `llm-request-role-normalize.ts`
  - 新增 `llm-request-role-normalize.spec.ts`
- [ ] 5.2 不动 `.env`（用户自行决定是否改 `AGENT_STREAMING=true`）
- [ ] 5.3 commit message 不出现同事名字（按用户过往规约）

## 6. PR（可选）

- [ ] 6.1 推到 fork（`git push origin temp`，因 rebase 后可能需 `--force-with-lease`）
- [ ] 6.2 在 gitee 上提 PR 给 `lskratXlskrat/fishtank:temp`
- [ ] 6.3 PR 描述引用 `openspec/changes/fix-llm-streaming-normalize/proposal.md` + 说明 `554f7c8` / `a28f945` 的流式 bug