## Context

当前文件隔离体系有两个问题：
1. **`enabled_files` 未生效**：`SkillController.executeSkill()` 未提取 `X-Conversation-Id`，导致 `conversationId` 永远为 null，下游隔离逻辑全部短路
2. **用户上传和临时文件混管**：两类文件都在 `enabled_files` 里管理，用户需要手动勾选 LLM 生成的临时文件，且临时文件跨会话可见

`user_files.conversation_id` 列已存在（DB 迁移已加），但 Java 实体未映射。以此为锚点实现临时文件自动绑定。

## Goals / Non-Goals

**Goals:**
- LLM 只能操作 `enabled_files` 中勾选的用户文件 + 本会话产生的临时文件
- `enabled_files` 最多 5 个用户上传文件，前端 + 后端双重限制
- 临时文件自动绑定到生成它的会话，不进入 `enabled_files`
- 临时文件仅对同 `conversationId` 的会话可见、可操作

**Non-Goals:**
- 不改变前端 `FileManagerView` 独立文件管理页面行为（该页面不受会话隔离）
- 不改变 `POST /api/files/tools/execute`（FileToolController 直调，测试用）
- 不引入关联表或 JSON 索引优化（性能问题另案处理）

## Decisions

### 决策 1：权限校验双路径判断

```
file_tool 请求到达 → FileToolService.execute()
  │
  ├── 用户上传文件 (is_tool_generated=0) → 必须在 enabled_files 中
  │
  └── 工具生成文件 (is_tool_generated=1) → conversationId 必须匹配当前会话
```

**理由**：两类文件天然不同——用户文件是用户主动选择和配置的，临时文件是 LLM 自动产生的副产品。合并管理增加用户负担。

### 决策 2：`UserFile` 实体激活 `conversationId` 字段

在 `UserFile` 实体中增加 `@TableField("conversation_id") private String conversationId`。该列已在 DB 中存在（`VARCHAR(128) NULL`），仅需映射。

**理由**：复用现有 DB 列，不引入新字段或表。

### 决策 3：`enabled_files` 上限 `5` 常量维护在一处

```java
public static final int MAX_ENABLED_FILES = 5;
```

放在 `ConversationService` 或配置常量类中。后端校验在 `ConversationController.updateConversation()` 和 `ConversationService.appendEnabledFile()` 中执行。前端在提交前校验。

**理由**：避免硬编码散落各处，后续调整只需改一个地方。

### 决策 4：临时文件写入时填充 `conversationId`

所有 ToolService 的 `new UserFile(...)` + `setIsToolGenerated(1)` 处统一增加 `setConversationId(conversationId)`。conversationId 从 `FileToolConversationContext` 的附加字段传入（类似 `enabledFiles` 的方式）。

**备选方案（未采纳）**：用独立 ThreadLocal 存 `conversationId` 字符串，ToolService 内部获取。不采纳理由：`conversationId` 与 `enabledFiles` 是同生命周期、同调用链的上下文，统一在 `FileToolConversationContext` 存储降低组件之间的耦合面，并保持与现有 `enabledFiles` 一致的 ThreadLocal 清理/设置时机（`FileToolService.execute()` 的 `try/finally`）。

### 决策 5：隔离生效路径修复

`SkillController.executeSkill()` 增加 `@RequestHeader("X-Conversation-Id")` 提取，写入 `req.conversationId`。这条修复让整个隔离链路重新生效。

### 决策 6：后端隔离的权限逻辑

```java
// FileToolService.execute() 内：
List<Long> enabledFiles = resolveEnabledFiles(conversationId, userId);
FileToolConversationContext.set(enabledFiles, conversationId); // 扩展 Context 存 conversationId 字符串

// 操作类工具（非 management）校验：
boolean isUserFile = userFile.getIsToolGenerated() != null && userFile.getIsToolGenerated() == 0;
boolean isTempFile = userFile.getIsToolGenerated() != null && userFile.getIsToolGenerated() == 1;

if (isUserFile && enabledFiles != null && !enabledFiles.contains(userFile.getId())) {
    return error("不在 enabled_files 中");
}
if (isTempFile && conversationId != null) {
    if (!conversationId.equals(userFile.getConversationId())) {
        return error("临时文件不属于当前会话");
    }
}
```

管理类工具（`file_list/delete/clear_all/detail`）在 `FileManageService` 内部：
- 用户上传文件 → 按 `enabledFiles` 过滤
- 临时文件 → 按 `conversationId` 过滤（同会话的临时文件也列入可见范围）

## Risks / Trade-offs

- **[风险] `conversation_id=NULL` 的存量临时文件不受隔离**：旧数据 `conversation_id` 为空，修复后仍全量可见。→ 影响可控，旧临时文件量小，可日后手动清理或一次性 SQL 修正
- **[风险] `enabled_files` 超过 5 的存量会话**：前端保存时拒绝并提示，不允许继续扩大。已超过的不强制裁剪，但用户删减后不能重新超过 5
- **[风险] `ConversationSkillPanel` 前端文件 Tab 同时展示两类文件**：配置面板应仅展示用户上传文件供勾选，临时文件不在面板中显示（但 file_list 工具可展示同会话临时文件）
- **[风险] 存量用户 `enabled_files > 5` 被新规则锁死**：上线后用户打开配置面板，可能因"超过 5 个上限"而无法继续保存既有勾选。→ Mitigation：前端首次保存时弹 confirm 对话框 "您的会话已勾选 N 个文件，超过上限 5 个，请选择：
  - 自动保留前 5 个
  - 手动取消勾选后再保存
  - 取消保存"
