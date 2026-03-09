# BXDC.bot 多用户 Agent 平台技术方案

## 1. 项目目标

本项目的核心目标是一个部署在服务器上支持多用户、多会话的企业级 Agent-bot 平台，实现 "Thin Agent, Thick Tools"（瘦 Agent，胖工具）的架构模式，支持agent自动调用存量skill自动完成任务分析执行和监控。

具体目标包括：

- **多用户支持**：构建 C/S 架构，支持多用户并发使用。
- **混合架构**：结合 Java Web 的业务优势和 Node.js/LangGraph 的 Agent 编排优势。
- **安全运维**：提供安全的远程服务器脚本执行（SSH）和 API 调用能力，敏感凭证不泄露给 Agent。
- **全链路审计**：实现对 Agent 思考过程和实际执行操作的全程记录与审计。

## 2. 整体方案描述

我们采用双层架构设计：

1. **上层：Java 业务控制层 (Skill Gateway)**
  - 作为系统的“躯干”，负责与用户交互、权限控制、资源管理和具体能力的执行。
  - 它不负责复杂的推理，只提供原子化的能力接口（Skills）。
2. **下层：Node.js Agent 执行层 (Agent Core)**
  - 作为系统的“大脑”，负责接收自然语言指令，进行 ReAct（推理+行动）循环。
  - 它不直接接触底层资源，而是通过调用 Java 层提供的 Skill 接口来完成任务。

## 3. 分层架构解释

### 3.1 Java Skill Gateway (Spring Boot)

- **职责**：
  - **API 网关**：暴露 RESTful 接口供 Agent 调用。
  - **安全中心**：管理 SSH 密钥、API Token 等敏感信息，进行细粒度的权限校验。
  - **执行引擎**：实际执行 SSH 命令、HTTP 请求等副作用操作。
  - **任务调度**：接收用户请求，分发给 Agent Core，并处理 Agent 的流式反馈。
  - **审计日志**：通过 AOP 切面记录所有 Skill 的调用情况。

### 3.2 Node.js Agent Core (NestJS + LangGraph)

- **职责**：
  - **推理编排**：基于 LangGraph.js 构建 ReAct Agent，规划任务执行路径。
  - **工具封装**：将 Java 层暴露的 API 封装为 LangChain Tool。
  - **流式输出**：通过 SSE (Server-Sent Events) 实时推送 Agent 的思考过程（Thinking）和执行结果。

## 4. 架构设计优点

- **扬长避短**：充分利用 Java 在企业级业务、权限控制方面的成熟生态，以及 Node.js 在 AI Agent 编排（LangChain/LangGraph）方面的灵活性。
- **安全性高**：Agent 运行时不持有敏感凭证（如 SSH 私钥），仅持有临时的任务 Token。所有高危操作（如 `rm -rf`）可在 Java 层被拦截。
- **可维护性**：业务逻辑（如何连 SSH）与智能逻辑（何时连 SSH）分离。升级 SSH 库不需要动 Agent 代码，优化 Prompt 不需要重启 Java 服务。
- **扩展性**：新增 Skill 只需在 Java 层实现并暴露接口，Agent 层只需注册对应的 Tool 定义。

## 5. 开源项目选型

### 5.1 Java 侧

- **Spring Boot 3.2**：核心 Web 框架，提供依赖注入、Web MVC 等基础能力。
- **Spring Security**：负责 API 的认证与授权。
- **Spring Data JPA (Hibernate)**：ORM 框架，用于操作数据库（审计日志等）。
- **SSHJ**：高性能的 Java SSH 客户端，用于远程命令执行。
- **Lombok**：简化 Java 代码，减少样板代码。

### 5.2 Node.js 侧

- **NestJS**：企业级 Node.js 框架，风格与 Spring Boot 类似，便于 Java 团队上手。
- **LangGraph.js**：LangChain 的图编排扩展，支持构建有状态、多步骤的 Agent 工作流。
- **LangChain.js**：提供 LLM 调用、Tool 封装等基础 AI 能力。
- **Axios**：HTTP 客户端，用于调用 Java Skill Gateway。
- **RxJS**：响应式编程库，处理异步流（SSE）。

## 6. 其他内容

### 6.1 通信协议

- **Java -> Node.js**：HTTP POST，下发任务指令。
- **Node.js -> Java**：Server-Sent Events (SSE)，单向流式回传执行状态。

### 6.2 部署建议

- 建议使用 Docker Compose 进行编排，Java 服务和 Node.js 服务运行在同一内部网络中，通过服务名相互访问，减少网络延迟。

