# frontend-vue-app

## Purpose

定义基于 Vue 3 的前端应用结构及 TDesign 集成（与 frontend-app 互补）。

## Requirements

### Requirement: Vue 3 应用结构

系统 MUST 提供一个通过 Vite 服务的基于 Vue 3 的单页应用 (SPA)。

#### Scenario: 应用程序初始化

- **当** 开发者运行 `npm run dev` 时
- **那么** 应用程序在 `localhost:5173` 启动
- **并且** 根组件渲染无错误

### Requirement: TDesign 集成

应用程序 MUST 使用 TDesign Vue Next 进行样式设计和基础组件。

#### Scenario: TDesign 主题

- **当** 应用程序加载时
- **那么** 应用 TDesign 全局主题样式
- **并且** TDesign 组件（例如 `t-button`）正确渲染

### Requirement: 路由

应用程序 MUST 使用 Vue Router 支持客户端路由。

#### Scenario: 默认路由

- **当** 用户访问根 URL `/` 时
- **那么** 渲染聊天界面组件
