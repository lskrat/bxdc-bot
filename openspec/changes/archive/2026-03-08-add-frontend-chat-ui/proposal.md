## 为什么

当前的 BXDC.bot 系统提供了一个强大的后端架构，包括 Java Skill Gateway 和 Node.js Agent Core，但缺乏面向用户的界面。用户目前无法直接输入任务或实时查看 Agent 的推理和执行过程。添加前端对于使平台可用和易于访问至关重要，使用户能够通过聊天界面与 Agent 自然交互。

## 变更内容

- **新前端应用**：使用 React、Vite、TypeScript 和 Tailwind CSS 创建现代 Web 前端。
- **聊天界面**：实现一个聊天 UI，用户可以发送自然语言指令并查看 Agent 的响应。
- **实时更新**：集成后端的 Server-Sent Events (SSE)，以实时显示 Agent 的“思考”过程和工具执行结果。
- **后端集成**：将前端连接到 Java Skill Gateway 以进行任务提交和状态更新。

## 能力

### 新增能力

- `frontend-app`：基础 React 应用程序结构，包括路由、构建设置 (Vite) 和样式 (Tailwind CSS)。
- `chat-ui`：专用的聊天界面组件，支持用户输入、消息历史记录显示和 Agent 响应的 Markdown 渲染。
- `agent-client`：客户端服务层，用于处理与 Java Skill Gateway 的 API 通信，包括用于发送任务的 HTTP POST 和用于使用 SSE 流的 EventSource。

### 修改的能力

- `api-gateway`：更新 Java Skill Gateway 以支持 CORS（跨源资源共享），允许来自新前端应用程序的请求。

## 影响

- **新目录**：将在项目根目录中创建一个 `frontend/` 目录。
- **后端配置**：Java Spring Boot 应用程序将需要配置更改，以启用前端开发和生产源的 CORS。
- **用户工作流**：用户将通过 Web 浏览器而不是 API 调用或 CLI 与系统交互。
