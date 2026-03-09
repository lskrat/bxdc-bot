## ADDED Requirements

### Requirement: PC 端主布局结构
系统 MUST 使用 TDesign 经典布局组件（t-layout、t-header、t-content）构建主界面，适配 PC 端宽屏显示。

#### Scenario: 布局渲染
- **WHEN** 用户在 PC 端（视口宽度 ≥ 1024px）访问应用
- **THEN** 主内容区以合理最大宽度（如 960px）居中显示
- **AND** 两侧留有适当留白

#### Scenario: Header 展示
- **WHEN** 应用加载完成
- **THEN** 顶部 Header 显示应用标题
- **AND** Header 使用 TDesign 样式（背景、边框等）

### Requirement: 主内容区宽度约束
主聊天区域 MUST 在 PC 端具有最小与最大宽度约束，保证可读性与美观。

#### Scenario: 宽度约束
- **WHEN** 视口宽度 ≥ 1024px
- **THEN** 主内容区宽度在 600px 至 960px 之间
- **AND** 内容居中
