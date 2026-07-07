# Proposal: 大模型设置改成顶部菜单的弹窗形式

## Why

当前"大模型设置"是 [Layout.vue:71](file:///Users/dccb/botproject/fishtank/frontend/src/components/Layout.vue#L71) 顶栏按钮，点击后 `router.push('/settings')` 跳转到独立路由页面 [SettingsView.vue](file:///Users/dccb/botproject/fishtank/frontend/src/views/SettingsView.vue)。这种"跳转整页"的形式跟其他顶部菜单不一致：

| 菜单 | 当前模式 | 实现位置 |
|------|----------|----------|
| SkillHub | **弹窗** ✓ | `toggleSkillHub()` + [SkillHub.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/SkillHub.vue) |
| Servers | **弹窗** ✓ | `toggleServerLedger()` + [ServerLedger.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/ServerLedger.vue) |
| 编辑资料 | **弹窗** ✓ | `profileEditVisible` + [ProfileEditModal.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/ProfileEditModal.vue) |
| 文件管理 | 跳转路由 | `router.push('/file-manager')` |
| **大模型设置** | **跳转路由** ← 要改 | `router.push('/settings')` |
| 运营看板 | 跳转路由 | `router.push('/operations/skill-usage')` |

具体痛点：
1. 跳页会**丢失当前聊天上下文**（侧边栏会话列表还在，但页面被换掉，要手动返回 `/`）
2. 还要点"返回聊天"按钮（[SettingsView.vue:118](file:///Users/dccb/botproject/fishtank/frontend/src/views/SettingsView.vue#L118)）才回到主界面 —— 多一次点击
3. 跟同位置的"Servers / SkillHub / 编辑资料"在 UX 上不一致（一个页面元素，三种交互）
4. `SettingsView.vue` 用了自实现的 [Card.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/ui/Card.vue) / [Button.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/ui/Button.vue) / [Input.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/ui/Input.vue) 这套旧 UI 套件，跟主应用基于 TDesign `t-dialog` / `t-form` 的弹窗风格不一致
5. `SettingsView.vue` 用了 `router.replace('/login')` 做未登录跳转 —— 但**实际上所有顶层页面都已包在 Layout 里**（Layout 是路由 `/` 的容器），这一段路由级守卫是冗余的

需要把"大模型设置"从独立路由改造成跟其他菜单一样的**模态弹窗**，统一顶栏交互。

## What Changes

- 新增 [LlmSettingsModal.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/LlmSettingsModal.vue)：基于 `t-dialog` 的模态弹窗，表单字段与现有 `SettingsView` 完全一致（API Base URL / 模型名称 / API Key / 保存 / 清除已存密钥）
- 新增 [useLlmSettings.ts](file:///Users/dccb/botproject/fishtank/frontend/src/composables/useLlmSettings.ts)：模块级 singleton `isLlmSettingsVisible` ref + `toggleLlmSettings()` 函数，对齐 [useServerLedger.ts](file:///Users/dccb/botproject/fishtank/frontend/src/composables/useServerLedger.ts) 模式
- 修改 [Layout.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/Layout.vue)：
  - 顶栏"大模型设置"按钮的 `@click` 由 `router.push('/settings')` 改为 `toggleLlmSettings()`
  - 模板底部新增 `<LlmSettingsModal />`（与 `<ProfileEditModal />` 同位）
- 修改 [router/index.ts](file:///Users/dccb/botproject/fishtank/frontend/src/router/index.ts)：移除 `/settings` 路由 + `SettingsView` 的 `import`
- 删除 [SettingsView.vue](file:///Users/dccb/botproject/fishtank/frontend/src/views/SettingsView.vue)：被弹窗替代，不再需要
- 删除 [ui/Card.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/ui/Card.vue)、[ui/Button.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/ui/Button.vue)、[ui/Input.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/ui/Input.vue) 三个旧 UI 套件（仅 SettingsView 在用，删除 SettingsView 后无人引用）—— **这一步可选**，由实施时决定是否一起清；保守起见**暂保留**避免无关清理（参见 AGENTS.md "Don't add ... cleanup beyond what was asked"），单独 issue 处理
- **不动后端**：`fetchLlmSettings` / `saveLlmSettings`（[useUser.ts:156-167](file:///Users/dccb/botproject/fishtank/frontend/src/composables/useUser.ts#L156-L167)）的 API 调用和 `/api/users/{id}/llm-settings` 后端端点都保持不变
- **不动 agent-core**：本改动纯前端 UX 改写

## Capabilities

### New Capabilities

- `llm-settings-modal`: 顶部"大模型设置"菜单以 `t-dialog` 模态弹窗形式呈现，关闭后回到当前聊天上下文；表单字段（API Base URL / 模型名称 / API Key）与现有 `SettingsView` 等价

### Modified Capabilities

- 无（不影响任何已有 spec 的 REQUIREMENTS；后端 API、useUser 的 fetchLlmSettings / saveLlmSettings 函数签名都保持不变）

## Impact

### 前端（Vue 3 + TDesign + Vue Router）

- **新增**：[frontend/src/components/LlmSettingsModal.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/LlmSettingsModal.vue) — `t-dialog` 模态弹窗，复用 `useUser` 的 `fetchLlmSettings` / `saveLlmSettings`
- **新增**：[frontend/src/composables/useLlmSettings.ts](file:///Users/dccb/botproject/fishtank/frontend/src/composables/useLlmSettings.ts) — 模块级 singleton ref + toggle 函数
- **修改**：[frontend/src/components/Layout.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/Layout.vue) — 顶栏按钮 onClick 改为 `toggleLlmSettings()` + 模板底部加 `<LlmSettingsModal />`
- **修改**：[frontend/src/router/index.ts](file:///Users/dccb/botproject/fishtank/frontend/src/router/index.ts) — 删除 `/settings` 路由 + `SettingsView` import
- **删除**：[frontend/src/views/SettingsView.vue](file:///Users/dccb/botproject/fishtank/frontend/src/views/SettingsView.vue) — 被弹窗替代
- **不动**：[frontend/src/composables/useUser.ts](file:///Users/dccb/botproject/fishtank/frontend/src/composables/useUser.ts) — `LlmSettingsResponse` 类型 + `fetchLlmSettings` / `saveLlmSettings` 函数保留，弹窗直接复用

### 后端

- 无改动

### 数据 / DB

- 无改动

### 文档

- 新增 OpenSpec spec：`openspec/specs/llm-settings-modal/spec.md`（archive 后同步到 main specs）