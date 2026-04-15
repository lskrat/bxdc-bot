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
