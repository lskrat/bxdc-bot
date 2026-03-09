## Why

当前聊天界面样式简陋、元素单一，在 PC 端显示效果差，不符合桌面端使用体验。需要采用 tdesign-vue-next 的经典设计风格，打造专业、美观、适合 PC 端访问的聊天界面。

## What Changes

- **布局升级**：采用 TDesign 经典布局（侧边栏 + 主内容区），适配 PC 端宽屏，支持合理的最大宽度与留白。
- **组件升级**：全面使用 tdesign-vue-next 经典组件（Card、Space、Avatar、Divider 等），替换当前简单 div 结构。
- **视觉增强**：应用 TDesign 经典主题变量、统一圆角与阴影，提升消息气泡、输入区、空状态的视觉层次。
- **交互优化**：增加图标、头像、分隔线等辅助元素，改善信息密度与可读性。

## Capabilities

### New Capabilities

- `pc-layout`: PC 端优化的主布局结构，包含侧边栏（可选）、主聊天区域、合理的响应式断点。
- `tdesign-classic-components`: 使用 TDesign 经典组件库规范，包括 Card、Space、Avatar、Divider、Icon 等组件的应用规范。

### Modified Capabilities

- `frontend-app`: 布局与主题从简单全屏改为 PC 端经典布局，支持 TDesign 经典样式引入。
- `chat-ui`: 消息列表、输入区、空状态等使用 TDesign 经典组件与样式，提升视觉与交互。

## Impact

- **前端**：`frontend/` 目录下的 Layout、ChatView、MessageList、MessageInput、MarkdownRender 等组件需重构。
- **依赖**：已使用 tdesign-vue-next，需确保引入经典主题样式（如 `tdesign-vue-next/es/style/index.css` 或经典主题变量）。
- **样式**：可能新增或调整全局/组件级 Less/CSS，以符合 TDesign 经典设计规范。
