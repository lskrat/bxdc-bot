## 背景

BXDC.bot 平台目前由 Java Skill Gateway 和 Node.js Agent Core 组成。虽然 Agent 编排和工具执行的后端逻辑已经就绪，但最终用户没有图形用户界面。交互仅限于 API 调用或命令行工具。为了使更广泛的受众能够访问该平台，我们需要一个基于 Web 的前端，允许用户与 Agent 自然对话。

## 目标 / 非目标

**目标：**
- **用户界面**：使用 React 构建响应式 Web 应用程序。
- **聊天体验**：实现熟悉的聊天界面（如 ChatGPT），用户可以发送消息并接收流式响应。
- **实时反馈**：使用 Server-Sent Events (SSE) 实时可视化 Agent 的“思考”步骤和工具输出。
- **后端集成**：安全连接到 Java Skill Gateway。

**非目标：**
- **移动原生应用**：我们的目标是桌面/移动 Web，而不是原生应用程序。
- **复杂的认证 UI**：如果可用，我们将实现与后端认证的基本集成，但复杂的用户管理 UI 超出了本次迭代的范围。
- **高级可视化**：我们将专注于文本/Markdown 聊天。Agent 内部状态的复杂图形可视化不在范围内。

## 决策

### 1. 前端框架：React + Vite
- **理由**：React 是动态 UI 的行业标准。Vite 提供快速的开发体验和优化的构建。
- **替代方案**：Vue, Angular, Next.js。选择 React 是因为它的生态系统以及团队可能对其比较熟悉。虽然考虑了 Next.js，但对于此用例，通过 Vite 构建的单页应用 (SPA) 既足够又简单。

### 2. 样式：Tailwind CSS
- **理由**：实用优先的 CSS 允许快速开发 UI，无需切换到 CSS 文件。它确保了一致性和响应性。
- **替代方案**：CSS Modules, Styled Components。Tailwind 对于原型设计和构建现代 UI 更快。

### 3. 通信协议：HTTP + SSE
- **理由**：后端已经暴露了用于任务的 HTTP 端点和用于状态更新的 SSE。前端将直接使用这些。
- **实现**：
  - `POST /api/tasks`：提交新的用户查询。
  - `GET /api/tasks/{id}/events`：通过 `EventSource` 订阅 Agent 的执行流。

### 4. 状态管理：React Context + Hooks
- **理由**：应用程序状态（聊天记录、连接状态）相对简单。Redux 或其他重型库是不必要的开销。
- **实现**：`ChatContext` 将管理消息列表和 WebSocket/SSE 连接状态。

## 风险 / 权衡

- **CORS 问题**：如果后端配置不正确，浏览器安全策略可能会阻止请求。
  - *缓解措施*：我们将配置 Java Spring Boot 后端以允许来自 `localhost:5173`（Vite 默认）和生产域的请求。
- **SSE 稳定性**：SSE 连接可能会断开。
  - *缓解措施*：在前端客户端实现自动重连逻辑。

## 迁移计划

1.  **初始化前端**：创建 `frontend` 目录并搭建应用脚手架。
2.  **后端配置**：更新 Spring Boot CORS 设置。
3.  **开发 UI**：构建聊天组件。
4.  **集成**：将 UI 连接到后端 API。
5.  **测试**：验证端到端流程。
