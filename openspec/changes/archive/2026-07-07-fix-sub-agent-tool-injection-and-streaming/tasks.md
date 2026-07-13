## 1. Utility Tools 默认注入

- [x] 1.1 agent-core 启动时预缓存 file_list/file_read/file_write 三个 utility skills（调用 Gateway /api/skills/match）
- [x] 1.2 execute-skill.ts 中 autoSearchSkills 合并缓存结果到 matchedSkills，limit 从 5 改为 6

## 2. file_write 创建新文件

- [x] 2.1 FileToolService 将 file_write 标记为 isOptionalFileIdTool，resolve() 失败时不中断路由
- [x] 2.2 routeByExtension 通过 inferExtensionFromParams 推断文件类型并创建新文件

## 3. 取消确认流程修复

- [x] 3.1 execute-skill.ts catch 块优先检测 confirmed:false，直接返回 CANCELLED 状态
- [x] 3.2 thinkId fallback key 改回固定值 'execute_skill_with_context'，取消时正确匹配
- [x] 3.3 controller 取消流程改为 iterator 替换 + continue outer
- [x] 3.4 前端 useChat.ts 移除 maybeYield 防抖函数

## 4. 流式输出修复

- [x] 4.1 normalizeJsonResponse 对 text/event-stream 响应直接返回，不读 body
- [x] 4.2 验证 DeepSeek 模型流式输出恢复正常
