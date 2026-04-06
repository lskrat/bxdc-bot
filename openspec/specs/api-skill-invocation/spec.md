# api-skill-invocation

## Purpose

定义已配置 API Skill 的调用行为：在参数校验通过后执行 HTTP 请求并将结果返回给 LLM；校验失败时不发起请求并返回可纠错信息。

## Requirements

### Requirement: API Skill Invocation

The system MUST invoke the configured API skill using the parameters provided by the LLM.

#### Scenario: Successful invocation

- **WHEN** the LLM generates valid parameters for an API skill
- **THEN** the system executes the API request with the provided parameters
- **AND** the system returns the API response to the LLM

#### Scenario: Failed invocation (validation error)

- **WHEN** the LLM generates invalid parameters for an API skill (e.g., missing required fields, type mismatch, enum violation)
- **THEN** the system MUST NOT execute the API request
- **AND** the system MUST return a structured error message to the LLM indicating the validation failures
- **AND** the LLM CAN attempt to correct the parameters and invoke the skill again
