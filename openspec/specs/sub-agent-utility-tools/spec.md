# Sub-Agent Utility Tools - 功能规范

## 概述

Sub-Agent Utility Tools（子 Agent 工具注入）功能确保每个子 Agent 自动获得基础文件操作能力，不依赖向量检索匹配，同时支持 file_write 创建新文件。

## Requirements

### REQ-1: Utility tools default injection for sub-agents

**Requirement**: 系统 SHALL 自动将 file_list、file_read、file_write 作为工具注入到每个子 Agent，独立于向量搜索匹配。

**验证标准**:
- execute_skill_with_context 创建子 Agent 时，子 Agent 的工具列表 SHALL 包含 file_list、file_read、file_write
- 无论向量搜索结果如何，这三个工具都始终存在

**实现位置**:
- `backend/agent-core/src/tools/execute-skill.ts` — autoSearchSkills 合并逻辑

### REQ-2: Utility skills global caching

**Requirement**: 系统 SHALL 在 agent-core 启动时预拉取并缓存 utility skills（file_list、file_read、file_write），避免每次请求的 embedding API 延迟。

**验证标准**:
- agent-core 服务启动时，从 Gateway 获取 utility skill 元数据并缓存在内存中
- 后续所有子 Agent 执行直接使用缓存的工具列表
- Gateway 不可用时，降级到每次按 query 走向量搜索（原有路径）

**实现位置**:
- `backend/agent-core/src/tools/execute-skill.ts` — 启动时缓存逻辑

### REQ-3: file_write creates new file when fileRef does not exist

**Requirement**: 当 file_write 收到的 fileRef 不对应现有文件时，系统 SHALL 从请求参数推断文件扩展名并创建新文件，而非返回错误。

**验证标准**:
- file_write 传入不存在的 fileRef（如 "newfile.txt"）时，创建新的 .txt 文件
- fileRef 无法确定扩展名时，从请求参数推断类型并创建文件

**实现位置**:
- `backend/skill-gateway/src/main/java/.../FileToolService.java` — routeByExtension、inferExtensionFromParams

## Constraints

### CON-1: 向后兼容

不改变 file_write 对已有文件的行为，仅在文件不存在时添加创建新文件的能力。

### CON-2: 不新增第三方依赖

使用现有代码路径实现，不引入新的 npm 包或外部库。

## Deployment Notes

- 需要 gateway 和 agent-core 代码部署
- 向后兼容，无破坏性变更
