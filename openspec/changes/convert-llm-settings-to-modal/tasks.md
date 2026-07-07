## 1. 新增 useLlmSettings composable

- [ ] 1.1 新建 [frontend/src/composables/useLlmSettings.ts](file:///Users/dccb/botproject/fishtank/frontend/src/composables/useLlmSettings.ts)：模块级 `const isLlmSettingsVisible = ref(false)`（对齐 [useServerLedger.ts:13](file:///Users/dccb/botproject/fishtank/frontend/src/composables/useServerLedger.ts#L13)）
- [ ] 1.2 导出 `useLlmSettings()` 函数：返回 `{ isLlmSettingsVisible, toggleLlmSettings, openLlmSettings, closeLlmSettings }`
- [ ] 1.3 `toggleLlmSettings()` 实现：取反 `isLlmSettingsVisible`；当 `false → true` 时**不**在这里 fetch（fetch 留给 modal 内的 watch(visible)，与 ProfileEditModal 一致）
- [ ] 1.4 `openLlmSettings()` / `closeLlmSettings()` 显式 setter（供将来用，本次可选）

## 2. 新增 LlmSettingsModal 组件

- [ ] 2.1 新建 [frontend/src/components/LlmSettingsModal.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/LlmSettingsModal.vue)，`<script setup lang="ts">`
- [ ] 2.2 从 `useLlmSettings` 取 `{ isLlmSettingsVisible, closeLlmSettings }`，从 `useUser` 取 `{ currentUser, fetchLlmSettings, saveLlmSettings }`
- [ ] 2.3 内部 ref：`apiBase`、`modelName`、`apiKey`、`hasStoredKey`、`loading`、`saving`、`message`、`isUserReady`
- [ ] 2.4 `watch(isLlmSettingsVisible, async (v) => ...)`：v=true 时 `if (!currentUser.value) return; loading=true; try { const s = await fetchLlmSettings(currentUser.value.id); apiBase=s.apiBase||''; modelName=s.modelName||''; hasStoredKey=s.hasApiKey; apiKey=''; message=''; } catch { message='加载失败'; } finally { loading=false; }`；v=false 时清 message（保留表单值，下次打开用户看到上次输入）
- [ ] 2.5 `handleSave()`：if (!currentUser.value) return; saving=true; try { const payload={apiBase:apiBase.value.trim(), modelName:modelName.value.trim()}; if (apiKey.value.trim()) payload.apiKey=apiKey.value.trim(); await saveLlmSettings(currentUser.value.id, payload); hasStoredKey=true; apiKey=''; message='已保存'; } catch (e:any) { message=e?.message||'保存失败'; } finally { saving=false; }`
- [ ] 2.6 `clearStoredKey()`：saving=true; await saveLlmSettings(currentUser.value.id, { apiBase: apiBase.value.trim(), modelName: modelName.value.trim(), apiKey: '' }); hasStoredKey=false; message='已清除保存的 API Key'; catch 同上
- [ ] 2.7 template：用 `t-dialog`（`:visible="isLlmSettingsVisible"` + `@close="closeLlmSettings"` + `header="大模型连接"` + `width="560px"` + `:footer="true"` + `:confirm-btn="{ content: '保存', loading: saving, theme: 'primary' }"` + `:cancel-btn="{ content: '取消' }"` + `@confirm="handleSave"` + `@cancel="closeLlmSettings"`）
- [ ] 2.8 表单用 `t-form` + 三个 `t-form-item`：`API Base URL` / `模型名称` / `API Key`（type="password"），placeholder 与原 SettingsView 一致
- [ ] 2.9 API Key `t-form-item` 加 `help`：v-if hasStoredKey 显示"当前已保存 API Key（仅显示状态，不回显明文）"
- [ ] 2.10 顶部加一行 `t-alert` 显示 `message`（成功 success / 失败 error）
- [ ] 2.11 防御性：`v-if="!currentUser"` 时显示 `<p>请先登录</p>` 占位，避免 currentUser 异步未就绪时空表单
- [ ] 2.12 防御性：`v-if="loading"` 时显示 `<t-loading text="加载中..." />`
- [ ] 2.13 footer 区域：在 confirm/cancel 之外加第三个 `t-button` "清除已存密钥"，`v-if="hasStoredKey"` + `:loading="saving"` + `@click="clearStoredKey"`（注意：t-dialog 的 footer 是 confirm/cancel，要额外加按钮需用 `<template #footer>` slot 覆盖默认 footer）

## 3. 修改 Layout.vue

- [ ] 3.1 [Layout.vue](file:///Users/dccb/botproject/fishtank/frontend/src/components/Layout.vue) script 顶部 import：`import LlmSettingsModal from './LlmSettingsModal.vue'` + `import { useLlmSettings } from '../composables/useLlmSettings'`
- [ ] 3.2 在 `useServerLedger` 解构旁边解构 `const { toggleLlmSettings } = useLlmSettings()`
- [ ] 3.3 顶栏"大模型设置"按钮（[Layout.vue:71](file:///Users/dccb/botproject/fishtank/frontend/src/components/Layout.vue#L71)）`@click` 由 `router.push('/settings')` 改为 `toggleLlmSettings()`
- [ ] 3.4 模板底部（`<SkillHub />` / `<ServerLedger />` / `<ProfileEditModal />` 同位）新增 `<LlmSettingsModal />`

## 4. ~~修改 router/index.ts~~ （SettingsView.vue 由用户保留作为 fallback，不动路由表）

- [x] 4.1（跳过）用户保留 SettingsView.vue，路由表无需删除 /settings

## 5. ~~删除 SettingsView.vue~~ （用户明确要求保留文件）

- [x] 5.1（跳过）SettingsView.vue 不删除；保留作为旧版整页设置的 fallback（直接 URL `/settings` 仍可达）

## 6. 验证

- [ ] 6.1 `cd frontend && npx vue-tsc -b` 必须 exit 0 且无输出（AGENTS.md 5.6 强约束零 TS6133）
- [ ] 6.2 `cd frontend && npm run build` 必须 exit 0
- [ ] 6.3 浏览器手动验收：登录 → 点顶栏"大模型设置" → 弹窗出现 → 关闭弹窗 → 聊天上下文未丢失（侧边栏 + 输入框 + 滚动位置不变）→ 再次点开弹窗 → 修改 API Base URL 后保存 → "已保存"提示出现 → 再点开"清除已存密钥" → 提示消失
- [ ] 6.4 浏览器地址栏直接敲 `/settings` → 渲染 404 / 默认路由（不是 SettingsView）