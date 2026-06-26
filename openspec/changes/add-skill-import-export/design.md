## Context

- **现状**：[components/SkillHub.vue](file:///e:/AI/bxdc-bot/fishtank/frontend/src/components/SkillHub.vue) 已展示 EXTENSION 类型自建 Skill 的列表，每行支持激活/编辑/删除；用户编辑入口复用 [SkillManagementModal.vue](file:///e:/AI/bxdc-bot/fishtank/frontend/src/components/SkillManagementModal.vue)；后端 Skill 表覆盖 API/SSH/Python/Extension/Tool 五种 type。
- **约束**：AGENTS.md 5.5 "新功能 = 新 Skill 类型优先在 gateway Tool 接入，不改 agent-core"。本次需求完全落在 gateway + frontend，不动 agent-core。
- **约束**：导出/导入不破坏现有"session/conversation 隔离"语义（main-agent-conversation-scoped-skills spec）。
- **约束**：导出 JSON 体积小（单条 skill configuration 通常 < 5KB），直接走 Blob 下载，不需要流式压缩。

## Goals / Non-Goals

**Goals:**
- 单条 Skill 一键导出为 JSON 文件（含完整 configuration / interfaceDescription / parameterContract / executionMode / enabled 等字段）
- 单条 Skill 通过 JSON 文件导入还原（含文件结构校验、命名冲突处理）
- 导出/导入走单一 REST API，不引入新依赖（用浏览器原生 `Blob + URL.createObjectURL + <a download>`，参考现有 [fileService.downloadFile](file:///e:/AI/bxdc-bot/fishtank/frontend/src/services/fileService.ts)）
- 跨类型适配：API / SSH / Python / Extension / Tool 五种 type 走同一份 schema
- UX 上「所见即所得」：导出按钮在行尾随鼠标 hover 出现；导入按钮在工具栏常驻；导入预览对话框含字段折叠/展开

**Non-Goals:**
- **批量导出/导入**（本次只做单条；批量留给后续 spec）
- **跨用户复制审计日志**（后端不写审计表，仅用现有 createdBy 字段做归属）
- **OAuth 授权分享**（不走团队分享链接；只走"文件落地 → 手工分发"模式）
- **导入时自动去重**（导入是用户主动行为，不做静默 dedup）
- **与 main-agent-conversation-scoped-skills 的对话级隔离**（导出时 strip conversationId/sessionId，不跨会话迁移）

## Decisions

### D1. JSON Schema 版本化（metaSchemaVersion 字段）

```json
{
  "metaSchemaVersion": "1.0.0",
  "exportedAt": "2026-06-24T20:30:00Z",
  "exportedBy": "wgj",
  "sourceType": "EXTENSION",
  "skill": {
    "name": "...",
    "description": "...",
    "configuration": "...",
    "executionMode": "...",
    "enabled": true,
    "requiresConfirmation": false,
    "visibility": "PRIVATE",
    "avatar": "🦀"
  }
}
```

**理由**：未来 configuration 字段结构可能演进（AGENTS.md 5.1 强调小步演进），版本号让 import 端做向后兼容。

**替代方案**：仅塞 skill 原始 JSON → 拒绝，因为失去版本元数据，无法做兼容性处理。

### D2. 导入流程三阶段

```
阶段 1: 选文件 / 拖拽
   ↓ FileReader.readAsText 同步读
阶段 2: JSON 校验 + 预览
   ↓ 解析失败 → 弹窗"文件格式错误，请检查 JSON"
   ↓ 解析成功 → 弹预览对话框：Skill 名称/类型/简介/必填字段，类型徽章 + 缩略图
阶段 3: 用户确认 + 提交
   ↓ 若目标用户已有同名 Skill → 弹"覆盖/重命名/取消"
   ↓ 提交 → POST /api/skills (复用现有接口 + importPayload 标记)
```

**理由**：分阶段反馈 + 明确决策点，符合"用户掌控感"原则，避免静默失败或自动覆盖。

**替代方案**：
- 一次性导入（无预览）❌ 新手不友好
- 拖拽即上传（无命名冲突处理）❌ 会静默覆盖

### D3. 文件命名格式

`<skillName>-<yyyyMMdd-HHmm>.json`，例如 `查询问题列表-20260624-2030.json`。

**理由**：中文文件名在 Windows / Mac / Linux 都兼容（Mac 文件名允许中文），含时间戳便于用户在下载文件夹里区分多份导出。

**替代方案**：UUID 文件名（不友好，用户不知道哪个对应哪个）。

### D5. 命名冲突处理

| 场景 | 行为 |
|------|------|
| 目标用户已有同名 Skill | 弹三选一：① 覆盖（删旧 + 创新）② 重命名（在原名后加 `-imported-<HHmmss>`）③ 取消 |
| 目标用户无同名 Skill | 直接创建，无需确认 |
| 系统种子 Skill (createdBy = "public") | 不允许覆盖（disabled 覆盖按钮 + 错误提示） |

**理由**：避免静默覆盖；同时系统 seed 是平台资产，普通用户无权覆盖。

**替代方案**：
- 自动加后缀 (无 UI 提示) ❌ 用户不知情
- 直接拒绝 ❌ 增加使用摩擦

### D6. 后端 API：复用现有 `POST /api/skills`

不新增 endpoint，扩展现有 create 接口支持 `importPayload` 字段透传：

```java
@PostMapping
public Result<SkillDto> createSkill(@RequestBody CreateSkillRequest req) {
    // req.importPayload 非空 → 走导入路径（带 sourceVersion 标记 + 元数据校验）
    // 否则走正常创建路径
}
```

**理由**：与现有"通过 SkillManagementModal 创建"复用同一事务/权限/校验路径，避免维护两条平行接口。

**替代方案**：新增 `POST /api/skills/import`（独立接口）❌ 重复校验逻辑。

## Risks / Trade-offs

- [R1] **JSON 文件被恶意构造**：恶意用户构造特殊 JSON 触发后端解析漏洞。**Mitigation**：后端用 Jackson 的 `@Valid @Size` 限制字段长度（name ≤ 100、description ≤ 2000、configuration ≤ 64KB）；超出直接 400。
- [R2] **跨会话隔离破坏**：configuration 内嵌 conversationId/sessionId。**Mitigation**：导出时 strip 这些 key（hardcode black list: `conversationId | sessionId | userId | xUserId`）。
- [R3] **存量用户无导入历史**：导入完成不写审计（避免 schema 变更）。**Mitigation**：当前 skillCallLogs 已记录调用历史，导入本身无需审计。
- [R4] **前端 vue-tsc -b 严格模式**（AGENTS.md 5.6）：所有 util 函数必须有 caller 或 `void` 修饰，否则 TS6133 阻断 build。**Mitigation**：写完 `void`-cast 所有 util 调用。
- [R5] **敏感字段泄漏**：configuration 完整导出导入（含 SSH 密码 / API Key 等字段）。**Mitigation**：在导入预览对话框顶部加"⚠ 敏感信息（如 SSH 密码 / API Key）请确认是否在共享前已手动删除"提示。

## Migration Plan

**无需数据迁移**：复用 skills 表，无 schema 变更。

**部署步骤**：
1. 前端：合并 SkillImportDialog.vue + 修改 SkillHub.vue → build 走 vite 重新打包
2. 后端：扩展 SkillController.createSkill + 新增 DTO `SkillImportRequest` → mvn spring-boot:run reload
3. agent-core 不动
4. **回滚**：删除前端 import 按钮（后端扩展 createSkill 不破坏原 create 路径，回滚安全）

## Open Questions

- **Q1**：是否需要在导入成功后立即触发一次"测试调用"以验证 skill 配置正确？目前选择"不测"，让用户自己去聊天页试用，减少初次接触的摩擦。后续可在 skill type 为 API/SSH 时做 ping 测试。
- **Q2**：是否支持部分导入（只导入 description，configuration 留空）？目前选择"全量导入"，避免半成品 Skill 污染 Hub。
- **Q3**：团队场景（visibility = PUBLIC）的 Skill 是否应该允许其他用户导入？目前选择**允许**（任何 user 可下载 PUBLIC Skill 的 JSON，自己导入会变 PRIVATE 副本）—— 这点需要在 UI 上明确提示"导入后将创建为你名下的 PRIVATE 副本"。