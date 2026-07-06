## ADDED Requirements

### Requirement: Main Agent Does Not Mount Gateway Extended Tools
The main Agent SHALL NOT register any Gateway extended tools (owner_type=1 user skills, or owner_type=2 system skills surfaced via `loadGatewayExtendedTools`) as direct LangChain tools. All gateway skills SHALL be reachable only via the existing `search_tools` → `execute_skill_with_context` pathway.

#### Scenario: createMainAgent tool list
- **WHEN** `createMainAgent` is called
- **THEN** the returned `tools` array contains ONLY: `search_tools`, `search_filesystem_skills`, `execute_skill_with_context`, `skill_generator`, `compute`, `server_lookup`, `manage_tasks` (7 tools total, no extended tools from gateway)
- **AND** no call to `loadGatewayExtendedTools(...)` is made in the main Agent factory path

#### Scenario: Sub agent path unchanged
- **WHEN** `createSubAgent` is called with a list of `skillIds`
- **THEN** it SHALL still call `loadGatewayExtendedTools(...)` with `enabledSkillIds=skillIds` and `skillOwnerType=2` (or appropriate owner type) — preserving the existing sub-agent behavior

### Requirement: Unified Skill Routing Policy
The system SHALL update the agent's static prompt so that the routing policy explicitly states: "All skills (gateway or filesystem) are discovered via search_tools / search_filesystem_skills, then invoked via execute_skill_with_context. Do not assume any skill is directly callable from the main agent."

#### Scenario: Prompt wording
- **WHEN** `extendedSkillRoutingPolicy` is included in the static prompt (short or full mode)
- **THEN** its text SHALL mention that main-agent-direct tool invocation is not supported for skills, and that search-then-execute is the only path

### Requirement: Fallback for Hard-Coded Main Agent Tool Use
If existing skills or external clients depend on gateway extended tools being directly callable by the main agent, the system MUST log a deprecation warning on startup (read `AGENT_LEGACY_DIRECT_TOOLS` env; when set, the old behavior is kept and a warning is printed once).

#### Scenario: Default behavior
- **WHEN** `AGENT_LEGACY_DIRECT_TOOLS` is unset
- **THEN** main agent does NOT mount extended tools (new unified behavior)

#### Scenario: Legacy fallback
- **WHEN** `AGENT_LEGACY_DIRECT_TOOLS=true`
- **THEN** main agent DOES mount extended tools (old behavior, preserved for emergency rollback) AND logs `[LLM] AGENT_LEGACY_DIRECT_TOOLS=true: main agent mounting extended tools directly (legacy mode)` once at startup

### Requirement: Per-Tool Description Length Cap
Each tool's `description` string in the main agent's tool list SHALL be ≤ 200 characters (Chinese / English mixed). LangChain auto-injects these into the prompt.

#### Scenario: Description size audit
- **WHEN** the main agent is created
- **THEN** a startup log line `[LLM] Tool descriptions total chars=N` reports the cumulative size, which SHOULD be ≤ 1500 characters for the 7 baseTools