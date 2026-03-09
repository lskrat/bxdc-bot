## 1. 设置

- [x] 1.1 将现有的 `frontend` 移动到 `frontend-react-backup`
- [x] 1.2 使用 Vite 在 `frontend` 中初始化新的 Vue 3 + TypeScript 项目
- [x] 1.3 安装依赖：`tdesign-vue-next`, `less`, `vue-router`, `markdown-it`
- [x] 1.4 配置 Vite 以支持 Vue 和 TDesign（导入样式）

## 2. 核心实现

- [x] 2.1 设置 Vue Router 和使用 TDesign Layout 的基本布局组件
- [x] 2.2 实现 `useChat` composable（相当于 React Context）用于状态管理
- [x] 2.3 在 `frontend/src/services/api.ts` 中实现 API 服务（从 React 移植）

## 3. 聊天 UI 实现

- [x] 3.1 使用 TDesign List/Card 创建 `MessageList` 组件
- [x] 3.2 使用 TDesign Input/Textarea 创建 `MessageInput` 组件
- [x] 3.3 使用 `markdown-it` 实现 Markdown 渲染组件
- [x] 3.4 组装 `ChatInterface` 视图

## 4. 集成与验证

- [x] 4.1 将聊天 UI 连接到 `useChat` composable
- [x] 4.2 验证来自后端的实时流
- [x] 4.3 验证 Agent 响应的 Markdown 渲染
