## 背景

当前的前端是一个使用 Tailwind CSS 进行样式的 React 应用程序。它实现了一个带有自定义组件（`MessageList`、`MessageInput`）的基本聊天界面，并通过 React Context 管理状态。用户请求使用“TDesign Chat for Vue”。TDesign 是腾讯的一个设计系统，它有一个 Vue 3 实现（`tdesign-vue-next`）。虽然没有广为人知的“TDesign Chat”独立库，但 TDesign 经常包含或用于构建聊天界面。我们将假设目标是使用 Vue 3 和 TDesign 组件重建前端，以实现更专业的外观和感觉。

## 目标 / 非目标

**目标：**
- **迁移框架**：从 React 切换到 Vue 3 + Vite。
- **采用设计系统**：使用 TDesign Vue Next 作为 UI 组件。
- **实现聊天 UI**：使用 TDesign 组件（或使用 TDesign 样式的自定义 Vue 组件）重新创建聊天界面。
- **保持功能**：确保与 React 版本的功能对等（流式响应、Markdown 渲染、API 集成）。

**非目标：**
- **后端变更**：Java Skill Gateway 和 Node.js Agent Core 应保持不变（如果端口更改可能需要更新 CORS，尽管 Vite 通常默认为 5173）。
- **复杂的状态管理**：我们将使用 Vue 内置的响应式 API（`ref`、`reactive`、`provide`/`inject`），这对于此范围来说已经足够，除非复杂性增加，否则避免使用 Pinia。

## 决策

### 1. 框架：Vue 3 + Vite
- **理由**：用户明确请求“Vue”。Vite 是 Vue 3 的标准构建工具。
- **替代方案**：Nuxt（对于单页聊天应用来说有点大材小用）。

### 2. UI 库：TDesign Vue Next
- **理由**：用户明确请求。
- **实现**：我们将安装 `tdesign-vue-next` 并使用其 Layout、Input、Button 和其他基础组件。如果其生态系统中存在特定的“Chat”组件（例如 `tdesign-chat`），我们将使用它；否则，我们将使用 TDesign 原语组合聊天 UI。*自我修正：TDesign 核心库中没有专用的“Chat”组件，因此我们将使用其 List、Card 和 Input 组件构建一个，以匹配 TDesign 美学。*

### 3. 状态管理：Composition API + Provide/Inject
- **理由**：功能上等同于 React Context。简单有效，用于传递聊天状态。

### 4. Markdown 渲染：`markdown-it` 或 `v-md-editor`
- **理由**：`react-markdown` 是 React 专用的。`markdown-it` 是 Vue 中常用的标准 JS 库。

## 风险 / 权衡

- **重写工作量**：这是前端代码的完全重写，而不是重构。
- **功能对等**：在重写过程中可能会丢失小细节（如自动滚动行为）的风险。
- **TDesign Chat 可用性**：如果用户假设存在像其他库（如 Ant Design Pro）那样的预构建“Chat”组件，如果我们必须从原语构建它，他们可能会感到失望。我们将使用 TDesign 样式构建高质量的自定义实现。

## 迁移计划

1.  **备份/清理**：移除现有的 `frontend` 目录内容（或移动到 `frontend-react-backup`）。
2.  **脚手架**：在 `frontend` 中初始化一个新的 Vue 3 + TypeScript 项目。
3.  **安装**：添加 `tdesign-vue-next`、`less`（TDesign 依赖）和 Markdown 库。
4.  **实现**：重建 API 服务、Store（composables）和 UI 组件。
5.  **验证**：针对运行中的后端进行测试。
