## Context

当前 API 分享（`POST /api/agent-chat`）面向团队内部共享：所有调用者共享模板对话的 `userId` 和 `conversationId`，导致：
- 长期记忆（Mem0）按 `userId` 隔离，外部调用者无法独立积累记忆
- 短期记忆（对话消息历史）所有调用者共用，互相污染
- 无法按来源系统（电商 vs ERP vs CRM）进行用量统计

本设计在**不修改存量端点**的前提下，新增 `POST /api/agent-chat/external` 实现外部系统多租户接入：首次调用自动创建平台用户 + 克隆对话，后续调用基于 `(template_conv_id, caller_id)` 幂等复用。

## Goals / Non-Goals

**Goals:**
- 外部系统每个 `callerId` 拥有独立的平台用户 ID（`ext_` 前缀）和克隆对话，长期记忆与短期记忆完全隔离
- 同一 `callerId` 对同一模板的多次调用幂等复用已有克隆对话，不重复创建
- 支持流式（SSE）与非流式（JSON）双模输出，由请求参数 `streaming` 控制，默认非流式
- 管理员可在前端 PublishApiModal 配置"外部系统接入"模式，填写系统提示词
- 克隆对话通过 `conversations.source` 字段记录来源系统标识，支持后续统计
- 存量 `POST /api/agent-chat` 端点行为 100% 不变

**Non-Goals:**
- 不修改 agent-core `/agent/run` 执行逻辑
- 不修改 `conversation_messages` 表结构
- 不修改前端对话列表、聊天视图等非管理页面
- 不支持模板对话更新后向已有克隆对话传播变更（v1 不做）
- 不复制文件物理数据（共享引用）

## Decisions

### Decision 1: 克隆对话而非就地过滤

选中方案 B（克隆对话 + 自动创建用户），拒绝方案 A（在单对话 messages 表加 callerId 列过滤）。

**理由**：
- 方案 A 会污染 `conversation_messages` 表结构，且与 agent-core 的按 `conversationId` 做上下文压缩冲突
- 方案 B 每个外部用户拥有独立的 `conversationId` 和 `userId`，Mem0 长期记忆和对话压缩天然隔离
- 方案 B 对 agent-core 零侵入，仅 Gateway 侧新增编排逻辑

### Decision 2: 用户 ID 格式 `ext_{hash8}`

平台用户 6 位数字 ID 不够用，外部用户使用 `ext_` + SHA-256 前 8 位（`apiKey + callerId`）格式。

**理由**：
- 与平台用户 ID 格式明显区分，避免冲突
- 确定性算法：同一 `apiKey + callerId` 生成同一 `userId`，天然幂等
- 即使不同模板同一 `callerId` 哈希碰撞概率极低（2^32 空间）

### Decision 3: `external_api_tenants` 表做租户映射

```sql
CREATE TABLE external_api_tenants (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    template_conv_id BIGINT NOT NULL,
    caller_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(128) NOT NULL,
    cloned_conv_id BIGINT NOT NULL,
    created_at DATETIME NOT NULL,
    UNIQUE KEY uk_template_caller (template_conv_id, caller_id),
    INDEX idx_cloned_conv (cloned_conv_id)
);
```

单表一行记录模板对话 → 克隆对话 + 平台用户的映射。唯一约束保证首次创建后后续调用直接复用。

### Decision 4: `conversations` 表新增三列

| 列 | 类型 | 说明 |
|---|---|---|
| `publish_type` | `VARCHAR(16) DEFAULT 'internal'` | `internal`（内部共享）或 `external`（外部接入） |
| `external_system_prompt` | `TEXT NULL` | 外部接入模式的系统提示词 |
| `source` | `VARCHAR(64) NULL` | 来源系统标识（请求参数 `apiClient`），NULL 为手动创建 |

**理由**：
- `publish_type` 区分内部共享和外部接入两种模式，前端渲染不同 UI
- `external_system_prompt` 替代 `api_description` 作为 system message
- `source` 直接存调用方传入的标识，避免硬编码枚举，灵活支持多系统统计

### Decision 5: 流式/非流式由请求参数控制

`streaming` 参数，默认 `false`（非流式 JSON），传 `true` 走 SSE 透传。

非流式模式：Gateway 内部消费 agent-core SSE 后聚合为单次 JSON 响应。
流式模式：Gateway 将 agent-core SSE 事件转换格式后透传给调用方。

### Decision 6: 管理员判断

前端通过环境变量 `SYSTEM_ADMIN_IDS`（逗号分隔的 6 位用户 ID 列表）判断当前用户是否管理员。后端 `/api/user/{id}` 返回增加 `isAdmin` 字段。

### Decision 7: 外部接入默认系统提示词

外部接入模式需要一套简化的默认系统提示词，参考 `buildStaticSystemPrompt()` 但去掉"技能生成工具"相关内容。

**保留的策略**：agentRolePrompt（简化版）、skillDiscoveryPolicy、extendedSkillRoutingPolicy、downloadUrlPolicy  
**移除的策略**：skillGeneratorPolicy（外部用户不应创建技能）、taskTrackingPolicy、confirmationUIPolicy（外部调用 auto-deny）

提示词定义在 agent-core `src/prompts/en.ts` / `src/prompts/zh.ts` 中，新增 `externalApiSystemPrompt` 字段。agent-core 通过 `GET /prompts/external-api-default` 端点暴露默认提示词文本。

前端 `PublishApiModal` 选择"外部系统接入"时，自动从 gateway 代理获取该默认提示词并预填充到 `externalSystemPrompt` 文本框。管理员可在保存前按需修改，修改后的内容持久化到 `conversations.external_system_prompt`。

**理由**：
- 默认值降低管理员配置门槛，同时保留手动调整灵活性
- 提示词与现有 prompts 配置放在一起，语言（中/英）随 `AGENT_PROMPTS_LANGUAGE` 自动切换
- 不支持外部用户创建技能（skill_generator 移除），符合"外部调用者只消费已配置能力"的设计意图

## Risks / Trade-offs

- **[并发首次调用]**: 两个请求同时用同一 `(template_conv_id, caller_id)` 首次调用 → `UNIQUE` 约束兜底，后 INSERT 的请求失败走 `SELECT` 重试获取已有映射
- **[自动用户堆积]**: 每个 `callerId` 创建一个用户，长期可能产生大量用户 → 目前接受，后续可加 TTL 过期清理
- **[模板 owner 删除对话]**: 模板对话被删除后克隆对话仍可用（独立实体） → 符合预期，但前端需处理已删除模板的展示
- **[系统提示词修改不传播]**: 管理员修改模板的 `external_system_prompt` 不影响已有克隆对话 → v1 接受，后续可加手动同步按钮

## Migration Plan

1. 执行 DDL：创建 `external_api_tenants` 表 + 给 `conversations` 加列（`SchemaMigrationRunner` 幂等迁移）
2. 部署 Gateway 新代码（新端点 + `ExternalApiService`）
3. 部署前端新代码（PublishApiModal 管理员入口）
4. 存量 `POST /api/agent-chat` 不受影响，无需数据迁移
5. 回滚：删除新端点和 `ExternalApiService`，DDL 列不影响存量查询（NULL safe）
