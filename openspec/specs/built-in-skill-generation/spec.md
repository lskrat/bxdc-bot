# built-in-skill-generation Specification

## Purpose
TBD - created by archiving change improve-built-in-skill-generation. Update Purpose after archive.
## Requirements
### Requirement: Generate SSH Skill
The built-in skill generator SHALL support generating `CONFIG` type skills using canonical `kind=ssh`, and SHALL encode scenario intent (such as server status inspection) via preset/profile metadata and corresponding command fields.

#### Scenario: Generate SSH skill from description
- **WHEN** the user provides a description of a script or command to run on a server
- **THEN** the generator outputs a canonical SSH configuration with `kind=ssh` and the appropriate `command`
- **AND** the generator sets the matching preset/profile for the described scenario
- **AND** the system saves this skill to the SkillGateway

### Requirement: Generate OPENCLAW Skill
The built-in skill generator SHALL support generating `OPENCLAW` type skills based on user descriptions.

#### Scenario: Generate OPENCLAW skill from description
- **WHEN** the user provides a description of a complex task requiring autonomous planning
- **THEN** the generator outputs a skill configuration with `executionMode=OPENCLAW`, a generated `systemPrompt`, and a list of `allowedTools`
- **AND** the system saves this skill to the SkillGateway

### Requirement: Generate Template CONFIG Skill

The built-in skill generator SHALL support generating `CONFIG` type skills with canonical `kind=template`, containing a single generated `prompt` string derived from the user’s description of the reusable template text.

#### Scenario: Generate template skill from description

- **WHEN** the user asks for a reusable prompt-only template or similar intent without HTTP or server command execution
- **THEN** the generator outputs `executionMode=CONFIG` with `configuration` including `"kind": "template"` and a non-empty `prompt`
- **AND** the system saves this skill to the SkillGateway

### Requirement: Multi-type Generation Tool
The system SHALL provide a unified `JavaSkillGeneratorTool` (or equivalent) that can determine the target skill type (`api`, `ssh`, `openclaw`, or `template`) from the user's intent and generate the corresponding canonical configuration.

#### Scenario: Agent selects appropriate generation type
- **WHEN** the user asks to create a skill
- **THEN** the Agent uses the `JavaSkillGeneratorTool`
- **AND** the tool correctly infers the `targetType` based on whether the task is an API call, a server command, a complex planning task, or a prompt-only template
- **AND** for CONFIG mode, generated output uses canonical kinds (`api` / `ssh` / `template`) plus preset/profile metadata where needed for `api` and `ssh`

### Requirement: 生成并保存的 Skill 归属当前登录用户
所有通过 built-in skill 生成流程保存到 SkillGateway 的数据库 Skill MUST 将 **创建者** 设为 **当前登录用户**，并 MUST 符合 `skill-visibility` 中关于默认可见性与列表过滤的约定。

#### Scenario: SSH 生成保存记录创建者
- **WHEN** 生成器输出 SSH `CONFIG` skill 并成功保存到 SkillGateway
- **THEN** 持久化记录中的创建者 MUST 为当前会话用户

#### Scenario: OPENCLAW 生成保存记录创建者
- **WHEN** 生成器输出 OPENCLAW skill 并成功保存到 SkillGateway
- **THEN** 持久化记录中的创建者 MUST 为当前会话用户

#### Scenario: Template CONFIG 生成保存记录创建者
- **WHEN** 生成器输出 template `CONFIG` skill 并成功保存到 SkillGateway
- **THEN** 持久化记录中的创建者 MUST 为当前会话用户

#### Scenario: 多类型生成工具统一归属
- **WHEN** `JavaSkillGeneratorTool`（或等价工具）将 skill 写入 SkillGateway
- **THEN** 写入记录 MUST 携带当前用户作为创建者

