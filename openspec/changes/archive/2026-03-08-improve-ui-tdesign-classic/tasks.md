## 1. 布局升级

- [x] 1.1 更新 Layout.vue，使用 t-layout、t-header、t-content 经典布局结构
- [x] 1.2 为主内容区添加 max-width（960px）与 min-width（600px）约束，居中显示
- [x] 1.3 调整 Header 样式，使用 TDesign 变量（--td-bg-color-container、--td-component-border）

## 2. 消息列表重构

- [x] 2.1 在 MessageList.vue 中为每条消息添加 t-avatar 区分用户与助手
- [x] 2.2 使用 t-space 或 t-card 包装消息气泡，增强视觉层次
- [x] 2.3 将空状态改为 t-empty 或带图标的占位内容
- [x] 2.4 使用 t-divider 或 t-space 控制消息间距

## 3. 输入区重构

- [x] 3.1 在 MessageInput.vue 中用 t-card 或带边框容器包裹输入区
- [x] 3.2 确保 t-textarea 与 t-button 使用 TDesign 默认样式
- [x] 3.3 统一输入区与主内容区的内边距与视觉边界

## 4. 聊天视图调整

- [x] 4.1 更新 ChatView.vue 的 chat-container 宽度与内边距，与 Layout 协调
- [x] 4.2 确认主内容区在 PC 端（≥1024px）显示正常

## 5. 样式与主题验证

- [x] 5.1 确认 main.ts 已正确引入 tdesign-vue-next/es/style/index.css
- [x] 5.2 移除或替换与 TDesign 冲突的自定义样式
- [x] 5.3 在 PC 端验证整体布局、消息展示、输入区功能无回归
