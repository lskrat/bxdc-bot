## ADDED Requirements

### Requirement: Main Agent Tool Mounting Modes
The main Agent SHALL select its tool mounting mode based on the runtime context, balancing prompt-size economy with low-latency access to user-checked skills.

#### Scenario: No conversationId (direct API call)
- **WHEN** `createMainAgent` is called without `config.conversationId`
- **THEN** the returned `tools` array contains ONLY the 7 baseTools (`search_tools`, `search_filesystem_skills`, `execute_skill_with_context`, `skill_generator`, `compute`, `server_lookup`, `manage_tasks`)
- **AND** no call to `loadGatewayExtendedTools(...)` is made

#### Scenario: With conversationId (default frontend chat)
- **WHEN** `createMainAgent` is called with `config.conversationId` set
- **THEN** it SHALL call `loadGatewayExtendedTools` with `loadFromConversation: true` and that conversationId; gateway reads `conversations.enabled_skills` and returns only the user-checked skills
- **AND** the main agent mounts those skills directly (least-surprise for explicit user choice)

#### Scenario: Legacy full mount (env override)
- **WHEN** `AGENT_LEGACY_DIRECT_TOOLS=true` is set in the environment
- **THEN** the main Agent calls `loadGatewayExtendedTools` with `skillOwnerType: 1` (all user skills), restoring the pre-change behavior for emergency rollback

#### Scenario: Sub agent path unchanged
- **WHEN** `createSubAgent` is called with a list of `skillIds`
- **THEN** it SHALL still call `loadGatewayExtendedTools(...)` with `enabledSkillIds=skillIds` and `skillOwnerType=2` — preserving the existing sub-agent behavior

### Requirement: Tool Mounting Diagnostic Log
Every call to `createMainAgent` MUST emit a single log line summarizing the mounted tools so regressions in skill loading are visible without restarting.

#### Scenario: Per-request tool summary
- **WHEN** the main agent is created (any mode)
- **THEN** the system logs `[LLM] Main agent tools: count=N base=7 extended=M (extended_x, extended_y, ...)`
- **AND** on the first request of a process, additionally logs `[LLM] Main agent tools (full): [full list]`

### Requirement: Unified Skill Routing Policy
The system SHALL update the agent's static prompt so the routing policy explicitly states that un-checked gateway skills must be reached via `search_tools` → `execute_skill_with_context`.

#### Scenario: Prompt wording
- **WHEN** `extendedSkillRoutingPolicy` is included in the static prompt (short or full mode)
- **THEN** its text SHALL note that gateway skills not checked by the user are not directly callable from the main agent, and that search-then-execute is the path for them

### Requirement: Per-Tool Description Length Cap
Each tool's `description` string in the main agent's tool list SHALL be ≤ 200 characters (Chinese / English mixed). LangChain auto-injects these into the prompt.

#### Scenario: Description size audit
- **WHEN** the main agent is created
- **THEN** a startup log line `[LLM] Main agent tools` reports the count of extended tools mounted, making the cumulative tool-description size visible