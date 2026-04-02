# agent-tool-prompt-compat Specification

## Purpose

定义 Agent 在调用大模型时，是否将工具名称、说明与参数结构以文本形式写入系统 prompt（兼容模式），以及默认行为与 native 工具通道的关系。

## ADDED Requirements

### Requirement: 工具说明兼容模式默认关闭

系统在未显式开启兼容模式时 MUST 不将「完整工具目录」作为额外文本追加到系统 prompt；工具定义仅通过模型 API 既有的 tools / function 通道传递（与当前 LangChain ReAct 行为一致）。

#### Scenario: 默认未配置环境变量

- **WHEN** 兼容模式对应配置为关闭或未设置
- **THEN** 系统发往模型的系统消息 MUST NOT 包含为兼容模式追加的整块「可用工具」结构化目录（技能摘要、记忆等其它系统内容不受影响）

### Requirement: 兼容模式开启时注入系统 prompt

系统在兼容模式开启时 MUST 在系统消息中追加一段结构化文本，列出当前 ReAct Agent 已绑定的工具：每项至少包含工具名称与描述，并包含参数 JSON Schema 或等价机器可读摘要（与绑定到模型的定义同源）。

#### Scenario: 环境开启兼容模式

- **WHEN** 兼容模式配置为开启
- **THEN** 系统 MUST 在系统 prompt 中追加「可用工具」类小节
- **AND** 该小节内容 MUST 与当前轮次实际绑定的工具集合一致

### Requirement: 兼容模式与 native 工具并存

兼容模式开启时，系统 MUST 仍通过既有方式向模型提交 tools 定义（例如 Chat Completions 的 tools 字段），不得仅依赖系统 prompt 中的文字作为唯一工具契约来源。

#### Scenario: 兼容模式下的 API 请求

- **WHEN** 兼容模式开启且 Agent 带有非空工具列表
- **THEN** 模型请求 MUST 同时包含 native 工具定义与系统 prompt 中的工具说明文本

### Requirement: 超长内容的可控截断

当工具数量或单个 schema 体积导致序列化文本超过实现所设上限时，系统 MUST 截断或降级展示（例如保留名称与描述、省略部分 schema），并 MUST 避免因单次注入导致不可恢复的请求失败（在合理范围内）。

#### Scenario: 工具 schema 过长

- **WHEN** 某一工具的参数 schema 序列化后超过实现规定的单工具长度上限
- **THEN** 系统 MUST 对该工具的 schema 文本进行截断或摘要并继续处理其余工具
- **AND** 整体工具块超过总长度上限时 MUST 按实现策略截断并仍返回可用请求
