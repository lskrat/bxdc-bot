## Context

子 Agent（通过 `execute_skill_with_context` 工具创建）依赖 `autoSearchSkills` 函数通过向量检索（embedding API）从 Gateway 匹配技能。当前存在以下问题：

1. **基础工具未默认注入**：file_list/file_read/file_write 三个基础文件工具需通过向量检索匹配，但子 Agent 的 query 不总能匹配上（尤其是查询不包含文件操作关键词时），导致子 Agent 无法读写文件
2. **file_write 不能创建新文件**：传入的 fileRef 不存在时直接报错，需要先 file_list → 确认文件存在 → 再 file_write，体验差
3. **取消确认后子 Agent 反复重试**：`confirmed: false` 被当作普通 Error 抛给子 Agent，子 Agent 以为操作失败而重试
4. **流式输出失效**：`normalizeJsonResponse` 对 SSE 流式响应也调用 `await cloned.text()`，阻塞到完整 LLM 流接收完毕

## Goals / Non-Goals

**Goals:**
- 子 Agent 100% 获得 file_list/file_read/file_write 基础工具
- file_write 可以创建新文件（fileRef 不存在时）
- 用户取消确认后子 Agent 立即停止，不重试
- 恢复 token 级流式输出（DeepSeek 模型）

**Non-Goals:**
- 不修改 Gateway 的技能匹配算法
- 不改变 file_write 对已有文件的行为
- 不修改前端 think block 渲染逻辑
- 不涉及流式输出以外的模型配置变更

## Decisions

### Decision 1: 启动时预缓存 utility skills，绕过每请求的 embedding API 调用

**选择**：在 agent-core 启动时调用 Gateway `/api/skills/match?query=file_list+file_read+file_write&limit=6`，将结果缓存在模块级变量中。每个子 Agent 执行时直接合并缓存结果到 `matchedSkills` 数组。

**理由**：
- 避免每次创建子 Agent 时等待 embedding API（1-3s 延迟）
- utility skills 列表固定（file_list/file_read/file_write），不需要每次重新匹配
- 对齐 AGENTS.md 5.5 架构约束（不改 agent-core 调度层，gateway 侧不新增接口）

**替代方案**：在 execute-skill.ts 中硬编码 utility skill 的 skillId → 不可行，需要 Gateway 管理的 skillId 和 tool 映射关系

### Decision 2: file_write 在 FileToolService.resolve() 失败时不终止路由

**选择**：将 file_write 工具标记为 `isOptionalFileIdTool`，resolve() 抛异常时 `userFile = null`，继续执行到 `routeByExtension`，由其通过 `inferExtensionFromParams` 推断文件类型后创建新文件。

**理由**：
- 最小化改动，复用现有的 `routeByExtension` 创建新文件逻辑
- 不影响其他工具（file_read 对不存在的文件仍需报错）

**替代方案**：在 FileToolService 中新增专门的 "创建文件" handler → 增加代码路径，且 routeByExtension 已有创建文件的 handler

### Decision 3: execute-skill.ts catch 块优先检测 confirmed:false

**选择**：在 catch 块中检测 `error.confirmed === false`，直接返回 `{ status: "CANCELLED" }` 而非重新抛出错误。

**理由**：
- `confirmed: false` 是正常的用户交互结果，不是执行错误
- 子 Agent（LLM）收到 `CANCELLED` 结果后不会当作失败重试
- thinkId key 改回固定值 `'execute_skill_with_context'` 确保取消时能正确匹配到 think block 结束

### Decision 4: controller 取消流程改为 iterator 替换

**选择**：从 `drain + break` 改为 `iterator = newStream[Symbol.asyncIterator](); continue outer;`

**理由**：
- drain + break 导致主 Agent 不能产出取消总结消息
- iterator 替换让主 Agent 在收到 `confirmed: false` 后自然生成取消总结文本
- 与确认流程（confirmed: true）使用相同的 stream 恢复机制，代码一致

### Decision 5: normalizeJsonResponse content-type 早期返回

**选择**：对 `content-type: text/event-stream` 的响应直接 `return response`，不调用 `cloned.text()`。

**理由**：
- `await cloned.text()` 会读取整个 SSE 流到内存，阻塞到 LLM 完成
- 虽然 `response.clone()` 使用 tee，但克隆侧完成读取后原始侧数据已全部缓冲
- `filterEmptyChoicesFromSSE`（下游）已经通过 content-type 判断是否需要处理
- 非 SSE content-type 的响应仍走原逻辑（兼容智谱等不规范 content-type）

## Risks / Trade-offs

- **[Risk] Gateway 不可用时 utility skills 缓存失败** → 降级到每次按 query 走向量搜索（原有路径）
- **[Risk] file_write 创建文件类型推断可能不准确** → `inferExtensionFromParams` 已有多种启发式，边缘 case 会 fallback 到默认类型
- **[Risk] content-type 早期返回可能漏掉某些非标准 SSE 响应** → 非 `text/event-stream` 的响应仍走 `cloned.text()` 读取 body 做格式检测
