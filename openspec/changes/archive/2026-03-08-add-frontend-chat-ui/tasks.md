## 1. 项目设置

- [x] 1.1 创建 `frontend` 目录并初始化 Vite React 应用 (TypeScript + SWC)
- [x] 1.2 安装依赖：`tailwindcss`, `postcss`, `autoprefixer`, `react-router-dom`, `react-markdown`, `lucide-react` (图标)
- [x] 1.3 初始化 Tailwind CSS 配置
- [x] 1.4 清理默认的 Vite 样板代码

## 2. 后端配置

- [x] 2.1 更新 Java Skill Gateway 以允许来自 `http://localhost:5173` 的 CORS
- [x] 2.2 验证后端 API 端点是否可访问

## 3. 前端核心

- [x] 3.1 创建基本应用程序布局（页眉，主要内容区域）
- [x] 3.2 设置 `ChatContext` 用于管理应用程序状态
- [x] 3.3 创建用于 HTTP 请求的 API 客户端服务

## 4. 聊天界面实现

- [x] 4.1 创建 `MessageList` 组件以显示聊天记录
- [x] 4.2 创建 `MessageInput` 组件用于用户文本输入
- [x] 4.3 使用 `react-markdown` 实现 Agent 消息的 Markdown 渲染
- [x] 4.4 使用 Tailwind CSS 设置组件样式

## 5. 集成

- [x] 5.1 实现 `useChat` hook 以处理消息提交
- [x] 5.2 实现 `EventSource` 连接以进行实时 SSE 更新
- [x] 5.3 在 UI 中处理连接状态（连接中，已连接，错误）
- [x] 5.4 测试完整的端到端流程：用户发送消息 -> Agent 思考 -> Agent 响应
