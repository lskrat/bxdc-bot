## 为什么

当前的前端聊天界面是使用基本的 Tailwind CSS 组件构建的。虽然功能齐全，但缺乏专用 UI 库的精致和高级功能。TDesign 是一个综合性的企业设计系统，提供高质量的聊天组件 (`tdesign-chat`)，专门为对话界面设计。采用 TDesign Chat for Vue 将通过更好的样式、内置功能（如打字指示器、消息分组）和一致的设计语言来改善用户体验，同时减少自定义 UI 组件的维护负担。

## 变更内容

- **替换自定义聊天 UI**：移除手动实现的 `MessageList` 和 `MessageInput` 组件。
- **采用 TDesign Vue Next**：安装并配置 `tdesign-vue-next` 和 `@tdesign-vue-next/chat`（如果作为单独的包或主库的一部分可用）。
- **迁移到 Vue**：由于 TDesign 的主要和最成熟的实现是针对 Vue 的（并且用户特别要求“TDesign Chat for Vue”），我们需要将前端框架从 React 迁移到 Vue 3。
  - *注意*：这是一个重大变更。如果用户指的是“TDesign React”，我们应该澄清。但是，鉴于明确的请求“TDesign Chat for Vue”，我们将继续进行 Vue 迁移。
- **更新状态管理**：用 Vue 的 Composition API (ref/reactive) 或 Pinia 替换 React Context (`ChatContext`)。
- **更新构建工具**：为 Vue 而不是 React 重新配置 Vite。

## 能力

### 新增能力

- `frontend-vue-app`：Vue 3 应用程序结构，用于替换 React 应用程序。
- `tdesign-chat-ui`：由 TDesign 的 Chat 组件提供支持的聊天界面，支持流式响应、Markdown 渲染和用户输入。

### 修改的能力

- `agent-client`：API 客户端逻辑基本保持不变，但将由 Vue 组件而不是 React hooks 使用。

## 影响

- **前端重写**：现有的 `frontend/` 目录将被有效替换或大量修改以切换框架。
- **依赖变更**：卸载 React 依赖项；安装 Vue 3、TDesign Vue Next 和相关工具。
- **学习曲线**：代码库现在将使用 Vue 生态系统约定。
