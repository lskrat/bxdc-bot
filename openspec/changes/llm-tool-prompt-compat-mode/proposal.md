## Why

部分兼容 OpenAI 协议的网关或模型实现会忽略或弱化 `tools` / function-calling 通道，导致模型看不到工具说明、无法稳定发起工具调用。需要在服务端增加一种可选模式：把工具名称、说明与参数结构写进系统 prompt，以便这类后端仍能「读说明、调工具」；默认行为必须与现网一致，避免影响已正常工作的部署。

## What Changes

- 在 `agent-core` 增加**工具说明兼容模式**（可开关）：开启时，在发往模型的系统消息中追加结构化「可用工具」文本（含工具名、描述、参数 JSON Schema 或等价摘要）。
- **默认关闭**：与当前一致，仅通过 LangChain / Chat Completions 的 native `tools` 传递工具定义，系统 prompt 不额外夹带整份工具目录。
- 开关通过**环境变量**（或现有配置约定）控制，文档中说明变量名与取值；不强制改前端或网关契约（后续若需按用户/会话覆盖，可再扩展）。

## Capabilities

### New Capabilities

- `agent-tool-prompt-compat`: 定义工具说明兼容模式的默认关闭行为、开启后的系统 prompt 注入内容范围，以及与 native 工具通道并存时的语义（仍绑定工具，兼容模式为补充而非替代）。

### Modified Capabilities

- （无）本阶段仅服务端配置与 `agent-core` 组装消息逻辑，不改变已归档的 API 或前端规格中的对外契约。

## Impact

- **backend/agent-core**：`AgentFactory` 与 `AgentController`（或等价消息组装处）需能拿到当前轮次的工具列表并在兼容模式下格式化写入 `SystemMessage`；可选小工具函数做 schema 序列化与长度截断。
- **部署 / 运维**：新增环境变量说明（如 `.env.example`）；默认不设置即保持现状。
- **测试**：兼容模式开/关各至少一条行为或集成验证（系统内容是否包含工具块）。
