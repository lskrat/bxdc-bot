# api-skill-invocation

## Purpose

定义已配置 API Skill 的调用行为：在参数校验通过后执行 HTTP 请求并将结果返回给 LLM；校验失败时不发起请求并返回可纠错信息。对扩展 API Skill，调用前 MUST 应用与 agent 运行时一致的参数归一化（含 `input` 字符串解析与文档化的工具调用参数恢复）。

## Requirements

### Requirement: API Skill Invocation

The system MUST invoke the configured API skill using the parameters provided by the LLM after applying the same **normalization** rules as the agent runtime (including unwrapping a JSON string from `input` when used, and recovery of equivalent flat arguments from the tool call when documented for extension API skills).

#### Scenario: Successful invocation

- **WHEN** the LLM generates valid parameters for an API skill after normalization
- **THEN** the system executes the API request with the normalized parameters
- **AND** the system returns the API response to the LLM

#### Scenario: Failed invocation (validation error)

- **WHEN** the LLM generates invalid parameters for an API skill (e.g., missing required fields, type mismatch, enum violation) after normalization
- **THEN** the system MUST NOT execute the API request
- **AND** the system MUST return a structured error message to the LLM indicating the validation failures
- **AND** the LLM CAN attempt to correct the parameters and invoke the skill again

### Requirement: 可配置的契约参数到 HTTP body（JSON）映射

对扩展 API Skill，在 `parameterContract` 校验通过且即将调用 Skill Gateway 的 HTTP 代理前，系统 SHALL 支持在 skill `configuration`（`ExtendedSkillConfig`）中通过显式字段声明：**合并后的契约参数**（defaults + LLM 提供值，且已排除保留键）映射到 **URL query** 或 **JSON request body**。

未设置该配置时，系统 SHALL 保持与变更前一致的默认映射（合并后的标量字段进入 query、`merged.body` 单独作为 body 的既有行为）。

#### Scenario: jsonBody 模式下发 POST JSON

- **WHEN** skill `configuration` 将参数绑定设置为 JSON body（例如 `parameterBinding` 为 `jsonBody`）
- **AND** HTTP method 为 POST、PUT 或 PATCH
- **AND** `parameterContract` 在顶层定义了若干属性（如 `id`、`nickname`、`systemAdminPassword`）
- **THEN** 系统 MUST 将这些合并后的字段序列化为 JSON 对象，作为发往网关代理请求中的 **body**
- **AND** 系统 MUST NOT 仅因 `merged.body` 为空而省略上述字段，以致请求体为空

#### Scenario: 默认 query 模式兼容旧 Skill

- **WHEN** skill 未启用 JSON body 映射（默认 `query` 或未设置）
- **THEN** 系统 MUST 继续将合并后的标量字段用于 URL query 构建（与既有实现一致）
- **AND** 已有未修改的 Skill MUST 行为不变

#### Scenario: GET 与 jsonBody 的合理行为

- **WHEN** `parameterBinding` 为 `jsonBody` 但 HTTP method 为 GET
- **THEN** 系统 MUST NOT 将 JSON body 作为 GET 语义的一部分强行发送；系统 SHALL 回退为 query 映射或采用与实现文档一致的明确策略，且 MUST NOT 抛出未处理异常
