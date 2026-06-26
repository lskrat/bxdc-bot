## Why

用户已在 Skill Hub 中累积了大量自建 Skill（API/SSH/Python/Extension 各类型），目前无法在用户/团队/环境间迁移——例如：
- 个人换电脑或重装环境后无法复用已有 Skill
- 团队成员之间无法共享某个配置好的 Skill
- 测试/生产环境间无法复用 Skill 配置
- 误删 Skill 后无备份可恢复

需要一个 JSON 格式的导入导出机制，把单条 Skill 的完整配置（含 configuration、interfaceDescription、parameterContract、executionMode、enabled 等字段）打包成 JSON 文件，让用户下载、跨环境/跨用户复用。本次需求先做**单条 Skill**的导入导出（不做批量），UX 上做到"所见即所得、对新手友好、几秒内完成"。

## What Changes

- **新增「导出 Skill」按钮**：Skill Hub 中每条自建 Skill 行尾追加导出按钮，触发浏览器下载 `<skill-name>-<yyyyMMdd-HHmm>.json`（configuration 字段完整导出）。
- **新增「导入 Skill」按钮**：Skill Hub 工具栏（顶部）新增导入入口，支持点击选择文件 + 拖拽文件两种交互；导入后弹预览对话框显示 Skill 名称/类型/简介，用户确认名称（必要时改名）后提交创建。
- **新增「通过 JSON 导入」创建 Skill 的 REST API**：与现有 `POST /api/skills` 复用同一控制器，扩展参数接受 `importPayload`（含 `sourceVersion`、`exportedAt` 元数据）。
- **新建工具函数**：`utils/skillExport.ts` 负责把 Skill 对象序列化为版本化 JSON（含 `metaSchemaVersion`、`exportedAt`、`sourceType`）；`utils/skillImport.ts` 负责校验文件结构并解析回 Skill 表单。
- **重名检测**：导入时检测目标用户下是否已存在同名 Skill，若存在弹「覆盖/重命名/取消」三选一弹窗，避免静默覆盖。

## Capabilities

### New Capabilities
- `skill-import-export`: 单条 Skill 的 JSON 格式导入导出全流程（导出 → 文件落地 → 导入 → 预览 → 命名冲突处理 → 落库），版本元数据、跨类型适配（API/SSH/Python/Extension/Tool）。

### Modified Capabilities
- `main-agent-conversation-scoped-skills`: 导出时仍遵守「session/conversation 隔离」约束——skill.description/configuration 中内嵌的 conversationId/sessionId 在导出时剥离，不随文件跨环境迁移。

## Impact

**前端**
- 新组件：`components/SkillImportDialog.vue`（拖拽/选文件 + JSON 预览 + 命名冲突处理）
- 修改：`components/SkillHub.vue`（行尾"导出"按钮 + 工具栏"导入"按钮）
- 新增工具：`utils/skillExport.ts`、`utils/skillImport.ts`
- 新增 i18n key：`SKILL.IMPORT/EXPORT/PREVIEW/CONFLICT`

**后端（gateway）**
- 扩展：`SkillController.createSkill` 增加 `importPayload` 参数透传
- 新增 DTO：`SkillImportRequest`（含 `metaSchemaVersion`、`payload`、`overrideStrategy`）
- 复用：`SkillService.createSkill` 已支持 `createdBy` 显式传值，导入时使用当前 user id
- **不修改** agent-core：导出/导入不涉及 LLM 调度协议

**数据库**
- 无 schema 变更（仍用现有 `skills` 表）

**OpenSpec**
- 单一 capability `skill-import-export`；archive 后落地 `openspec/specs/skill-import-export/spec.md`

**风险**
- 跨 user 复制：已通过 `createdBy = currentUser.id` + 现有"只有创建者可管理"权限控制解决
- 敏感字段泄漏：configuration 完整导出导入（含 SSH 密码 / API Key 等字段）；用户跨环境共享 JSON 文件需自行处理敏感信息（手动删除后分享，或使用环境变量注入替代）
- 文件格式版本演进：`metaSchemaVersion` 字段为后续 breaking change 提供兼容层