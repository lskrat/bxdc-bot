# pc-layout

## Purpose

定义 PC 端主布局结构（t-layout、t-header、t-content）及主内容区宽度约束（600px–960px）。

## Requirements

### Requirement: 主布局结构

系统 MUST 使用 TDesign 经典布局组件（t-layout、t-header、t-content）构建主界面，适配 PC 端宽屏显示。

#### Scenario: 布局渲染

- **当** 用户在 PC 端（视口宽度 ≥ 1024px）访问应用
- **那么** 主内容区以合理最大宽度（如 960px）居中显示
- **并且** 两侧留有适当留白

#### Scenario: Header 展示

- **当** 应用加载完成
- **那么** 顶部 Header 显示应用标题
- **并且** Header 使用 TDesign 样式（背景、边框等）

### Requirement: 主内容区宽度约束

主聊天区域 MUST 在 PC 端具有最小与最大宽度约束，保证可读性与美观。

#### Scenario: 宽度约束

- **当** 视口宽度 ≥ 1024px
- **那么** 主内容区宽度在 600px 至 960px 之间
- **并且** 内容居中
