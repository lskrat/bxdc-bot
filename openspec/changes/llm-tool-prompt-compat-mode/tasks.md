## 1. 配置与工具文本生成

- [x] 1.1 在 `agent-core` 增加兼容模式开关（环境变量，默认 false），并在 `.env.example` 中说明变量名与示例值
- [x] 1.2 实现从 LangChain 工具列表序列化为系统 prompt 小节（名称、描述、参数 schema），含单工具与总长度截断策略
- [x] 1.3 确保 `AgentFactory.createAgent`（或调用链）能向消息组装层提供与绑定一致的 `tools` 数组引用，避免重复手写工具表

## 2. 消息组装与验证

- [x] 2.1 在 `AgentController`（或集中组装 `SystemMessage` 处）在开关开启时将工具小节拼入 `systemContent`，关闭时行为与现网一致
- [x] 2.2 确认兼容模式开/关下均仍使用 `createReactAgent` 的 native tools，不删除 API 侧工具定义
- [x] 2.3 手动或自动化验证：关—系统内容无工具块；开—系统内容含工具块且请求仍带 tools
