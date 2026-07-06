## ADDED Requirements

### Requirement: Lazy Filesystem Skill Discovery
The system MUST NOT inject filesystem skill descriptions into the static prompt or user message. Filesystem skills SHALL be discoverable only via a dedicated tool that the agent invokes on demand.

#### Scenario: No filesystem skill descriptions in static prompt
- **WHEN** the agent's prompt is constructed
- **THEN** the static prompt and user message SHALL NOT contain any lines of the form `- <skill name>: <description>` for filesystem SKILL.md entries
- **AND** `buildSkillPromptContext()` returns at most a 5-line placeholder block referencing the discovery tool

#### Scenario: Placeholder content
- **WHEN** `buildSkillPromptContext()` is called
- **THEN** it SHALL return a string containing: a `[Filesystem Skills]` header, a hint to use the discovery tool, and nothing more (≤ 5 lines, ≤ 300 characters)

### Requirement: Filesystem Skill Search Tool
The system MUST expose a `search_filesystem_skills` tool to the main Agent that, given a `query` string, returns the matching filesystem skills as a JSON list of `{id, name, description, score}` objects. Matching SHALL be a case-insensitive substring match on `name + description + frontmatter metadata keys`, identical to the current `search_tools` algorithm in [tools/search-tools.ts](file:///Users/dccb/botproject/fishtank/backend/agent-core/src/tools/search-tools.ts).

#### Scenario: Successful search with matches
- **WHEN** the agent invokes `search_filesystem_skills` with `query="hello"`
- **THEN** the tool returns `{"status": "SUCCESS", "skills": [{"id": "hello-world", "name": "Hello World", "description": "...", "score": 1.0}, ...]}`
- **AND** only skills whose `name`, `description`, or metadata keys contain the query (case-insensitive) are returned

#### Scenario: No matches
- **WHEN** the agent invokes `search_filesystem_skills` with `query="nonexistent-xyz"`
- **THEN** the tool returns `{"status": "NO_SKILLS_FOUND", "skills": []}`

#### Scenario: No filesystem skills loaded
- **WHEN** no SKILL.md files exist under the configured skill roots
- **THEN** the tool returns `{"status": "NO_SKILLS_AVAILABLE", "skills": []}` and does not throw

### Requirement: Tool Registration
The `search_filesystem_skills` tool MUST be registered in the main Agent's `baseTools` array (alongside `search_tools`, `execute_skill_with_context`, `skill_generator`, `compute`, `server_lookup`, `manage_tasks`).

#### Scenario: Main agent tool list
- **WHEN** `createMainAgent` is invoked
- **THEN** the returned `tools` array contains `search_filesystem_skills` as a member

### Requirement: Backward-Compatible Skill Invocation
A filesystem skill loaded via the discovery tool SHALL remain invocable by the agent the same way as before (via `execute_skill_with_context` with the returned skill's id, or by directly invoking the skill's registered tool name).

#### Scenario: Load + execute flow
- **WHEN** the agent calls `search_filesystem_skills(query)` → receives a skill `id` → calls `execute_skill_with_context(skillIds=[id], instruction=...)`
- **THEN** a sub-agent is created with that filesystem skill and the original behavior (sub-agent uses skill's prompt to execute) is preserved