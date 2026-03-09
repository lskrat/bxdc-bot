## Context

当前前端为 Vue 3 + tdesign-vue-next + Vite 构建的聊天应用，已有基础 Layout（Header + Content）、MessageList、MessageInput 等组件。界面采用简单 div 布局，max-width 800px 居中，元素较少，在 PC 端显得空旷、缺乏层次感。用户反馈样式丑陋、不适合 PC 端访问。

## Goals / Non-Goals

**Goals:**
- 采用 tdesign-vue-next 经典组件与设计规范，提升整体视觉与交互。
- 布局适配 PC 端：合理内容宽度、侧边栏（可选）、留白与响应式。
- 消息区、输入区、空状态等使用 Card、Space、Avatar、Divider、Icon 等经典组件，增强信息层次。
- 保持现有功能（发送消息、Markdown 渲染、SSE 流式更新）不变。

**Non-Goals:**
- 不引入新的后端 API 或数据模型。
- 不实现移动端专属适配（保持响应式即可）。
- 不更换框架（继续使用 Vue + tdesign-vue-next）。

## Decisions

### 1. 布局：TDesign 经典布局（主内容区 + 可选侧边栏）
- **理由**：TDesign 经典布局提供 Header + Aside + Content 结构，适合 PC 端多区域展示。
- **实现**：使用 `t-layout`、`t-header`、`t-aside`（可选）、`t-content`，主聊天区限制 max-width（如 960px）并居中，两侧留白。
- **替代**：纯全屏居中。选择经典布局以提升 PC 端专业感。

### 2. 组件：全面采用 TDesign 经典组件
- **理由**：Card、Space、Avatar、Divider、Icon 等可快速提升视觉层次与一致性。
- **实现**：
  - 消息气泡：外层用 `t-card` 或 `t-space` 包裹，用户/助手用 `t-avatar` 区分。
  - 输入区：`t-input`/`t-textarea` + `t-button`，置于 `t-card` 或带边框的容器内。
  - 空状态：使用 `t-empty` 或带图标的占位区域。
  - 分隔：消息间可用 `t-divider` 或 `t-space` 控制间距。
- **替代**：继续使用裸 div。选择经典组件以符合 TDesign 设计语言。

### 3. 主题与样式：TDesign 默认主题 + 经典变量
- **理由**：tdesign-vue-next 默认引入 `es/style/index.css` 已包含经典设计变量（如 `--td-brand-color`、`--td-bg-color-container`）。
- **实现**：确认 `main.ts` 已引入 `tdesign-vue-next/es/style/index.css`，组件内使用 CSS 变量与 TDesign 类名，避免硬编码颜色。
- **替代**：自定义 Less 主题。当前阶段使用默认主题即可满足需求。

### 4. 响应式：PC 优先，最小宽度约束
- **理由**：目标为 PC 端，需保证在 1024px 及以上有良好表现。
- **实现**：主内容区 min-width 约 600px，max-width 约 960px；窄屏下可收缩侧边栏或隐藏，保证聊天区可用。

## Risks / Trade-offs

- **性能**：增加 Card、Avatar 等组件可能略微增加渲染开销。
  - *缓解*：组件数量有限，影响可忽略；必要时对长列表做虚拟滚动（后续迭代）。
- **兼容性**：TDesign 组件 API 可能与现有自定义样式冲突。
  - *缓解*：优先使用组件默认样式，必要时通过 `:deep()` 微调，避免覆盖过多。
- **设计一致性**：若后续引入其他设计系统，需统一迁移。
  - *缓解*：本次仅使用 TDesign，无混用计划。

## Migration Plan

1. **更新 Layout**：将 `Layout.vue` 改为 TDesign 经典布局（Header + Content，可选 Aside），调整样式变量。
2. **重构 MessageList**：用 `t-card`、`t-avatar`、`t-space` 等包装消息项，优化空状态（`t-empty`）。
3. **重构 MessageInput**：用 `t-card` 或带边框容器包裹输入区，统一按钮与输入框样式。
4. **调整 ChatView**：更新容器宽度、内边距，确保与 Layout 协调。
5. **验证**：在 PC 端（≥1024px）检查布局与样式，确认功能无回归。
