## Why

子 Agent 在多轮对话中频繁出现以下问题：1) 向量检索未能匹配基础文件工具（file_list/file_read/file_write），导致子 Agent 无法读写文件；2) file_write 要求 fileRef 必须已存在，不能创建新文件，用户体验差；3) 用户取消确认后子 Agent 反复重试、取消消息不显示或进错位置；4) 切换到 DeepSeek 模型后流式输出完全失效，所有内容一次性出现。

## What Changes

- **子 Agent 基础工具默认注入**：file_list、file_read、file_write 三个工具在 agent-core 启动时从 Gateway 拉取并全局缓存，每个子 Agent 自动获得这些基础能力，不再依赖向量搜索匹配
- **file_write 支持创建新文件**：当传入 fileRef 对应的文件不存在时，FileToolService 不再直接报错，而是由 routeByExtension 推断文件类型后创建新文件
- **取消确认流程修复**：
  - execute_skill_with_context 的 catch 块优先检测 `confirmed: false`，直接返回 CANCELLED 状态，防止子 Agent 当作普通错误反复重试
  - controller 取消流程改为 iterator 替换 + continue outer，让主 Agent 自然产出取消总结消息
- **流式输出修复**：`normalizeJsonResponse` 对 `text/event-stream` 类型的 SSE 响应不再调用 `cloned.text()` 读取完整 body，避免阻塞到 LLM 流完全接收完毕后才返回，恢复 token 级流式输出

## Capabilities

### New Capabilities
- `sub-agent-utility-tools`: 子 Agent 自动注入 file_list/file_read/file_write 三个基础工具，全局缓存，不依赖向量检索

### Modified Capabilities
- `sub-agent-think-blocks`: 取消确认流程中 think_end 事件处理、取消后子 Agent 停止重试、取消总结消息正常显示

## Impact

- `backend/agent-core/src/tools/execute-skill.ts` — 新增 utility skills 缓存、CANCELLED 检测
- `backend/agent-core/src/controller/agent.controller.ts` — 取消流程改为 iterator 替换
- `backend/agent-core/src/utils/llm-request-role-normalize.ts` — SSE 流式响应早期返回
- `backend/skill-gateway/src/main/java/.../FileToolService.java` — file_write 创建新文件逻辑
- `frontend/src/composables/useChat.ts` — 移除 maybeYield 防抖
