## 1. 折叠状态逻辑

- [x] 1.1 在 `<script setup>` 中新增 `getMessageBlockState(item)` 函数，传入 message 对象，返回 `{ hasAny: boolean, hasPending: boolean, hasRunning: boolean, shouldExpand: boolean, toolCount: number, pendingCount: number }`
- [x] 1.2 实现 `shouldExpand` 逻辑：`hasRunning || hasPending` 为 true 时强制展开；手动覆盖在非 pending 时优先于自动规则
- [x] 1.3 添加 per-message 的手动覆盖 `ref`（`Map<messageId, boolean>`），仅在非 pending 状态下响应用户点击

## 2. 模板重构

- [x] 2.1 将 `confirmation-card`（v-for）和 `tool-status-list` 合并到同一个折叠块 `<div class="execution-block">` 内
- [x] 2.2 折叠块标题：根据 `toolCount` 和 `pendingCount` 显示摘要文字（"调用详情（N 次工具 + M 项待确认）" 等变体），通过 `getBlockLabel(item)` 函数生成
- [x] 2.3 标题点击处理：pending 时忽略（`.execution-block-header--disabled`），否则切换手动覆盖状态（`toggleBlockExpansion`）
- [x] 2.4 折叠块内容区用 `v-show`（非 `v-if`）控制显隐，保证 tool 卡片内部状态不丢失

## 3. 视觉与样式

- [x] 3.1 折叠块整体样式：border + border-radius + overflow:hidden，与现有卡片风格一致
- [x] 3.2 标题箭头：展开 `▾`，收起 `▸`；pending 时 `.execution-block-header--disabled`（cursor:default + opacity:0.7）
- [x] 3.3 确认卡片在 `execution-block-body` 内自动继承 padding，与 tool-status-item 视觉协调

## 4. 验证

- [x] 4.1 `cd frontend && npx vue-tsc -b` 静默通过
- [x] 4.2 `cd frontend && npm run build` exit 0
- [x] 4.3 手动测试：多 tool 调用场景下运行时展开 → 完成后自动收起
- [x] 4.4 手动测试：pending 确认存在时折叠块禁止收起
- [x] 4.5 手动测试：纯文本消息（无 tool/confirmation）不渲染折叠块
