# Design: 大模型设置改成顶部菜单的弹窗形式

## Context

- 已有顶栏布局：[Layout.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/Layout.vue) 是 `<router-view>` 的容器，所有菜单按钮都在 `layout-header` 里
- 已有弹窗模式：
  - **composable + 顶层挂载**：[useServerLedger.ts](file:///Users/dccb/botproject/fishtank/frontend/src/composables/useServerLedger.ts) 模块级 `isServerLedgerVisible: ref(false)` + `toggleServerLedger()` + [ServerLedger.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/ServerLedger.vue) 在 Layout 底部直接挂载
  - **`defineModel` v-model**：[ProfileEditModal.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/ProfileEditModal.vue) 用 `defineModel<boolean>('visible')`，Layout 里 `v-model:visible` 控制
- 已有 LLM 设置数据接口：[useUser.ts:156-167](file:///Users/dccb/botproject/fishtank/frontend/src/composables/useUser.ts#L156-L167) 的 `fetchLlmSettings(userId)` / `saveLlmSettings(userId, body)` + `LlmSettingsResponse` 类型
- 已有路由表：[router/index.ts](file:///Users/dccb/botproject/fishtank/frontend/src/router/index.ts) 注册了 `/settings` 路由 + `requiresAuth` 守卫
- 现有 SettingsView 的表单逻辑：[SettingsView.vue](file:///Users/dccb/botproject/fishtank/frontend/src/views/SettingsView.vue) 的 `apiBase` / `modelName` / `apiKey` + `hasStoredKey` 状态 + `handleSave` / `clearStoredKey` 函数

**约束**：
- 必须复用现有 `useUser` 的 `fetchLlmSettings` / `saveLlmSettings`（后端 API 不动）
- 必须复用现有 TDesign 弹窗模式（`t-dialog` / `t-form` / `t-input`）
- 顶栏 4 个交互元素（SkillHub / Servers / 编辑资料 / 大模型设置）的 UX 风格要统一
- 删除 SettingsView 之前确认没有其他路由 / 组件引用它
- vue-tsc -b 必须零 TS6133（AGENTS.md 5.6 强约束）

## Goals / Non-Goals

**Goals:**
- 顶栏"大模型设置"点击后弹出模态框，不跳页
- 关闭弹窗后立即回到原页面（聊天上下文不丢失）
- 弹窗内表单字段与原 `SettingsView` 完全一致（API Base URL / 模型名称 / API Key / 保存 / 清除已存密钥）
- 删除 `/settings` 路由和 `SettingsView.vue`
- 复用现有 `useUser.fetchLlmSettings` / `useUser.saveLlmSettings`，后端零改动

**Non-Goals:**
- 不改 LLM 设置的后端 API（路径、payload、响应字段都不动）
- 不改 LLM 设置的字段语义（仍然是 OpenAI 兼容的 apiBase / modelName / apiKey）
- 不动 agent-core / skill-gateway
- 不做"全局生效确认"弹窗（保存即生效，与原 SettingsView 行为一致）
- 不做配置变更的审计日志（保留与原 SettingsView 一致的最小实现）
- 不动 `ui/Card.vue` / `ui/Button.vue` / `ui/Input.vue`（即使只有 SettingsView 在用，也不顺手删，避免无关变更；保留作为已弃用的内部组件，未来如有依赖再处理）

## Decisions

### 决策 1：弹窗打开方式 —— composable singleton vs `defineModel` v-model

**选**：**composable singleton 模式**（对齐 `useServerLedger`），不使用 `defineModel` v-model 模式（`ProfileEditModal`）。

**理由**：
- 顶栏按钮的 onClick 是直接触发，不是父子组件传值，`composable.toggleXxx()` 调用语义最自然
- 已经有 `useServerLedger.toggleServerLedger()` / `useSkillHub.toggleSkillHub()` 两个完全一致的先例，跟它们对齐可读性最高
- `defineModel` 模式更适合"父组件已有自己的状态，需要双向绑定"的场景（如 ProfileEditModal 的 `profileEditVisible = ref(false)` 在 Layout 里），LLM 设置没有这种需求
- modal 内嵌组件**可以直接读** composable 暴露的 `isLlmSettingsVisible`，无需 props 传入

**否决方案**：
- **defineModel v-model 模式**：Layout 里 `const llmSettingsVisible = ref(false)` + `<LlmSettingsModal v-model:visible="llmSettingsVisible" />` —— 也能工作，但跟兄弟组件（SkillHub / Servers）不一致

### 决策 2：表单组件 —— `t-form` + `t-form-item` vs 自实现

**选**：**`t-form` + `t-form-item` + `t-input`**（TDesign 表单套件）。

**理由**：
- 全站都用 TDesign（参见 SkillManagementModal / ConversationSkillPanel / ProfileEditModal），风格统一
- TDesign 表单自带 `label` / `required` / `rules` / `status` / `tips` 等字段，弹窗内嵌无需自实现
- 原 SettingsView 用的自实现 `Input.vue` / `Card.vue` / `Button.vue` 是更早的代码，停留在旧 UI 套件

**否决方案**：
- **沿用 `ui/Input.vue`**：跟兄弟弹窗风格不一致，且需要带 `ui/Card.vue` 容器，弹窗不需要 Card
- **原生 `<input>`**：无 label / 错误状态展示

### 决策 3：弹窗宽度与定位

**选**：**宽度 560px，居中**（对齐 [ConversationSkillPanel.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/ConversationSkillPanel.vue) 的 560px）。

**理由**：
- 同位置的对话配置 / 技能管理弹窗都是 560px，视觉一致
- 表单只有 3 个字段 + 2 个按钮，560px 足够，不挤也不空

**否决方案**：
- **更宽（720px）**：字段少，浪费空间
- **更窄（420px）**：API Key 是 password input，需要展示"已保存"提示，挤

### 决策 4：路由处理 —— 删除 `/settings` vs 重定向到 `/`

**选**：**删除 `/settings` 路由 + `SettingsView` import**。

**理由**：
- `SettingsView.vue` 是该路由唯一消费者，删路由 + 删 view 配对进行
- 整个站点只有 Layout 顶栏按钮一处入口；浏览器地址栏直接敲 `/settings` 也只是开发者手输，正常用户不会用
- 重定向到 `/` 反而兜不住"用户切到 settings 后误刷新"的场景，但这种场景概率极低，且就算发生也是回到 `/`，不算 regression
- 删路由更彻底，避免死代码

**否决方案**：
- **保留 `/settings` 重定向到 `/`**：保留死代码，价值低
- **保留路由 + 保留 SettingsView 作为后备**：双实现增加维护成本

### 决策 5：API Key 字段的"已保存"提示

**选**：**沿用现有 `hasStoredKey: boolean` 状态 + 在 API Key 字段下方用 `t-form-item` 的 `help` 属性展示提示文字**。

**理由**：
- 行为跟原 SettingsView 完全一致（"当前已保存 API Key（仅显示状态，不回显明文）"）
- `t-form-item` 的 `help` 属性是 TDesign 原生提示位，无需额外 DOM

### 决策 6：保存 / 清除按钮的 loading 状态

**选**：**沿用 `saving: boolean` 状态 + TDesign `t-button` 的 `loading` 属性**。

**理由**：
- 与原 SettingsView 一致
- TDesign `t-button` 的 `loading` 属性是原生的，无需 `<t-loading>` 包裹

### 决策 7：弹窗首次打开时才 fetch（不预加载）

**选**：**弹窗 visible 从 false → true 时才调 `fetchLlmSettings`**（watch visible 实现）。

**理由**：
- 跟 `useServerLedger.toggleServerLedger` 一致：toggle 到开时 fetchLedgers
- 用户不开就不发请求，省一次 round-trip
- 跟 `ProfileEditModal` 的 `watch(visible)` 模式一致（它是从 `currentUser` 读本地已有数据，但同样在 visible 切换时才更新表单）

### 决策 8：未登录态处理

**选**：**弹窗内直接拒绝渲染表单**（visible 但 currentUser 为空时显示"请先登录"占位）。

**理由**：
- 顶栏按钮已经 `v-if="currentUser"` 守卫了，理论上点不到
- 但作为防御性编程，弹窗内仍判一次，避免 currentUser 异步未就绪时显示空表单
- 不需要 `router.replace('/login')`（路由级守卫），因为根本不在路由层

## Architecture

```
[Layout.vue] 顶栏按钮 onClick="toggleLlmSettings"
     │
     ├─→ [useLlmSettings.ts] 模块级 isLlmSettingsVisible: ref(false)
     │       ├─ toggleLlmSettings()  // 取反 + visible=true 时 fetchLlmSettings
     │       └─ isLlmSettingsVisible
     │
     └─→ 模板底部 <LlmSettingsModal />  // 直接挂载，永远渲染但 v-if=false 时不显示 DOM
              │
              ├─ 读 useLlmSettings.isLlmSettingsVisible
              ├─ watch(visible) → fetchLlmSettings(currentUser.id)
              ├─ t-dialog + t-form + t-input + t-button
              └─ 复用 useUser.fetchLlmSettings / useUser.saveLlmSettings
```

## File-level diff 概览

| 路径 | 操作 |
|------|------|
| `frontend/src/components/LlmSettingsModal.vue` | **新增** |
| `frontend/src/composables/useLlmSettings.ts` | **新增** |
| `frontend/src/components/Layout.vue` | 修改：import + 按钮 onClick + 模板底部加 `<LlmSettingsModal />` |
| `frontend/src/router/index.ts` | 修改：删除 SettingsView import + 删 `/settings` 路由 |
| `frontend/src/views/SettingsView.vue` | **删除** |

## Risks & Mitigations

| 风险 | 影响 | 缓解 |
|------|------|------|
| 删除 `/settings` 路由后用户从外部链接 / 书签进来 404 | 低（站点内无外链，仅顶栏按钮可达） | 后续如需要再加 301 重定向到 `/` |
| 弹窗内表单状态与兄弟弹窗（SkillHub）不一致 | 低 | 字段数量、按钮数量都跟原 SettingsView 一致；视觉风格按 `ConversationSkillPanel` 560px 对齐 |
| `useUser.fetchLlmSettings` 在 currentUser 为 undefined 时调用报错 | 中 | 弹窗内 `watch(visible)` 第一行判断 `currentUser.value`，缺失则不调 |
| 删除 SettingsView 后遗留 `ui/Card.vue` / `ui/Button.vue` / `ui/Input.vue` 死组件 | 极低（明确不在本次范围） | 显式 Non-Goals，不动；后续单独 issue 处理 |
| vue-tsc -b 报 TS6133（未使用 declaration） | 中 | 实施完成后 MUST 跑 `npx vue-tsc -b` 验证零输出（AGENTS.md 5.6 强约束） |