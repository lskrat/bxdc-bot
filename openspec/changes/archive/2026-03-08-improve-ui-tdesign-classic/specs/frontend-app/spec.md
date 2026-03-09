## MODIFIED Requirements

### Requirement: 前端应用程序结构
系统 MUST 提供一个通过 Vite 服务的基于 Vue 3 的单页应用 (SPA)，使用 tdesign-vue-next 作为 UI 组件库。

#### Scenario: 应用程序初始化
- **WHEN** 开发者运行 `npm run dev` 时
- **THEN** 应用程序在 `localhost:5173` 启动
- **AND** 根组件渲染无错误

### Requirement: 样式系统
应用程序 MUST 使用 tdesign-vue-next 的经典样式进行设计，并引入其默认样式文件。

#### Scenario: TDesign 样式应用
- **WHEN** 组件使用 tdesign-vue-next 组件（如 t-layout、t-button）
- **THEN** 样式在浏览器中正确应用
- **AND** 使用 TDesign 设计变量（如 --td-brand-color）

### Requirement: 路由
应用程序 MUST 支持客户端路由。

#### Scenario: 默认路由
- **WHEN** 用户访问根 URL `/` 时
- **THEN** 渲染聊天界面组件

### Requirement: PC 端布局
主布局 MUST 适配 PC 端，使用 TDesign 经典布局结构，主内容区具有合理的宽度约束与留白。

#### Scenario: PC 布局
- **WHEN** 用户在 PC 端（≥1024px）访问
- **THEN** 主内容区居中，最大宽度约 960px
- **AND** 使用 t-layout、t-header、t-content 等组件
