## Purpose

Define the slash/hash skill invocation feature: a user can prefix their instruction with `/<skill-name>` or `#<skill-name>` to force the LLM to call that specific skill (100% hit rate), bypassing the normal skill-discovery flow. The two trigger characters are aliases with identical semantics.

---

## Requirements

### Requirement: Slash Skill Invocation Detection
The system SHALL detect a `/<skill-name>` or `#<skill-name>` prefix at the start of the `instruction` field of `POST /agent/run` when the feature is enabled, and extract the skill name + remainder text. The two trigger characters are aliases with identical semantics.

#### Scenario: Feature disabled (default)
- **WHEN** `AGENT_SLASH_SKILL_INVOCATION` is unset, `false`, or any value other than `true`
- **THEN** the system MUST NOT perform any slash-related detection, prompt injection, or filtering
- **AND** the request SHALL be processed exactly as before this change

#### Scenario: Feature enabled, slash or hash prefix present
- **WHEN** `AGENT_SLASH_SKILL_INVOCATION=true` AND `instruction.trim()` starts with `/<token>` or `#<token>` followed by whitespace AND `<token>` matches (case-insensitive, trimmed) the `name` of a skill in the conversation's enabled-skill list
- **THEN** the controller identifies `<token>` as the forced skill and treats the remainder as natural-language arguments
- **AND** the trigger character (`/` or `#`) is preserved in the directive so the LLM can echo it back if needed

#### Scenario: Feature enabled, no slash or hash prefix
- **WHEN** `AGENT_SLASH_SKILL_INVOCATION=true` AND `instruction` does NOT start with `/` or `#`
- **THEN** the controller MUST NOT inject any forced-skill directive
- **AND** the request SHALL be processed by the normal LLM routing path

#### Scenario: Feature enabled, trigger prefix but unknown skill
- **WHEN** `AGENT_SLASH_SKILL_INVOCATION=true` AND `instruction` starts with `/<token> ` or `#<token> ` AND `<token>` does NOT match any conversation-enabled skill name
- **THEN** the controller MUST NOT inject the forced-skill directive
- **AND** the system SHALL treat the entire `instruction` as a normal request (LLM may still resolve it via search_tools)

#### Scenario: Trigger in middle of text (not a slash invocation)
- **WHEN** `AGENT_SLASH_SKILL_INVOCATION=true` AND `instruction` is `What is /usr/bin?` (slash not at position 0)
- **THEN** the controller MUST NOT treat it as a slash invocation; the `/` is treated as ordinary text

#### Scenario: Hash in middle of text (not a slash invocation)
- **WHEN** `AGENT_SLASH_SKILL_INVOCATION=true` AND `instruction` is `Count how many # in markdown # tags`
- **THEN** the controller MUST NOT treat it as a slash invocation; the `#` is treated as ordinary text

### Requirement: Forced-Skill Directive Injection
When slash skill invocation is detected and the named skill is found in the conversation's enabled list, the controller SHALL append a directive block to the user-content section that explicitly forces the LLM to call the matched skill.

#### Scenario: Directive content shape
- **WHEN** the directive is injected
- **THEN** it SHALL contain: the matched skill's id, an explicit instruction that the LLM MUST call the matched skill directly with parameters extracted from the trailing natural-language remainder
- **AND** it SHALL NOT replace any existing user-content sections (static prompt, skill context, memory, instruction); only append

#### Scenario: Injection bounded length
- **WHEN** the directive is appended
- **THEN** the appended block SHALL be ≤ 300 characters to keep prompt size predictable

### Requirement: 100% Hit Rate via Tool Mounting
The system SHALL guarantee that when slash detection fires, the LLM calls the matched skill (not a substitute) by mounting ONLY that single skill as a tool and hiding all other skill-selection tools (search_tools, execute_skill_with_context, search_filesystem_skills, skill_generator).

#### Scenario: Slash + natural-language args
- **WHEN** instruction is `/get_daily_news 获取科技新闻内容` and `get_daily_news` is in the conversation's enabled skills
- **THEN** the agent SHALL mount only the `extended_get_daily_news` tool (no other gateway skills, no search/execute/generator base tools)
- **AND** the LLM MUST return a `toolCalls` block calling `extended_get_daily_news` with parameters extracted from `获取科技新闻内容`

#### Scenario: Hash + natural-language args
- **WHEN** instruction is `#get_daily_news 获取科技新闻内容` and `get_daily_news` is in the conversation's enabled skills
- **THEN** the agent SHALL mount only the `extended_get_daily_news` tool
- **AND** the LLM MUST return a `toolCalls` block calling `extended_get_daily_news` with parameters extracted from `获取科技新闻内容`

#### Scenario: Trigger without args
- **WHEN** instruction is `/get_daily_news` or `#get_daily_news` (no trailing text)
- **THEN** the LLM MUST call the skill with an empty / default parameter object

#### Scenario: Slash mode does not include base tools
- **WHEN** slash detection fires
- **THEN** the agent's `tools` list SHALL contain only the one matched gateway skill; compute / server_lookup / manage_tasks / search_tools / execute_skill_with_context / search_filesystem_skills / skill_generator MUST NOT be mounted

### Requirement: Skill Name Resolution
Skill names referenced by the slash prefix SHALL be resolved against the same enabled-skill list that `createMainAgent` uses (returned by gateway `/api/skills/by-conversation` for the current conversationId).

#### Scenario: Match by exact name (case-insensitive)
- **WHEN** the slash token (trimmed) equals a skill `name` (case-insensitive) in the enabled list
- **THEN** the skill is selected

#### Scenario: Ambiguous name in enabled list (should not normally happen)
- **WHEN** two skills in the enabled list share the same `name` (case-insensitive)
- **THEN** the first one returned by gateway is selected (gateway is responsible for stable ordering)

#### Scenario: Whitespace handling
- **WHEN** instruction is `  /get_daily_news   args` (leading/trailing spaces)
- **THEN** the controller trims instruction before pattern matching; the slash token is `get_daily_news` and remainder is `args`

### Requirement: Feature Toggle Isolation
The `AGENT_SLASH_SKILL_INVOCATION` env variable SHALL control the entire feature with no side effects when disabled.

#### Scenario: Default off
- **WHEN** the env is unset
- **THEN** the controller reads it as `false` and behaves as the legacy path

#### Scenario: Truthy values
- **WHEN** the env is `true` / `1` / `yes` / `on` (case-insensitive)
- **THEN** the controller treats it as `true` and slash detection is active

#### Scenario: Other values
- **WHEN** the env is any other string (e.g. `full`, `enabled`)
- **THEN** the controller MUST treat it as `false` and log a one-shot startup warning (`[LLM] AGENT_SLASH_SKILL_INVOCATION has unrecognized value 'xxx', defaulting to false`)

### Requirement: Frontend Slash Picker
The frontend MessageInput component SHALL, when `VITE_SLASH_SKILL_INVOCATION` is enabled, show an inline skill picker as soon as the user types `/` or `#` at the start of the input field.

#### Scenario: Trigger on leading `/` or `#`
- **WHEN** the input value starts with `/` or `#` (no leading whitespace)
- **THEN** the picker appears directly below the input, listing the conversation's enabled skills (sourced from `GET /api/skills/by-conversation`)

#### Scenario: Filter by typed text after trigger
- **WHEN** the user has typed `/测` (or `#测`, `/te`, `#te`, etc.) in the input
- **THEN** the picker filters its list to skills whose `name` (case-insensitive) starts with or contains the typed token after the trigger character

#### Scenario: Selecting a skill
- **WHEN** the user clicks or keyboard-selects an entry in the picker
- **THEN** the input value is rewritten to `<trigger><skill-name> ` (trailing space) where `<trigger>` is whichever character (`/` or `#`) the user originally typed, so the user can continue typing arguments

#### Scenario: Dismiss picker
- **WHEN** the user clicks outside the picker, presses Escape, or deletes the leading `/` or `#`
- **THEN** the picker SHALL close and the input value SHALL be unchanged from the user's typing

#### Scenario: Picker stays closed after skill selected
- **WHEN** the user has selected a skill and the input value contains a space after the skill name (i.e. user is typing arguments)
- **THEN** the picker SHALL NOT re-open on subsequent input changes, so the user can keep typing naturally without picker interference

### Requirement: Slash-Mode Minimal Prompt
When slash detection fires, the controller SHALL send a minimal user-content payload to the LLM to avoid misleading the model with the standard search/execute prompt sections.

#### Scenario: Skip skill-discovery prompt sections in slash mode
- **WHEN** slash detection fires
- **THEN** the controller SHALL skip `staticSystemPrompt` (the long prompt with [技能发现策略] / [技能生成策略] / [扩展技能路由策略] / [Filesystem Skills] sections) and `skillContext` from `userContent`
- **AND** the controller SHALL still include `memoryContext` (so user-profile preferences still apply)
- **AND** the controller SHALL include the forced-skill directive

#### Scenario: Slash-mode instruction is args-only
- **WHEN** slash detection fires and instruction is `/get_daily_news 获取科技新闻内容`
- **THEN** the user message sent to the LLM (as the actual instruction role) SHALL be only `获取科技新闻内容` (the args portion after the skill name), not the full original instruction

### Requirement: No Original-Function Regression
When the slash feature is disabled, all existing behaviors MUST remain identical to before this change.

#### Scenario: Disabled flag, regular request
- **WHEN** `AGENT_SLASH_SKILL_INVOCATION=false` (or unset) and `instruction` is any string
- **THEN** the request is processed identically: same prompt, same tools, same execute_skill_with_context invocation, same response shape

#### Scenario: Disabled flag, accidental `/` in instruction
- **WHEN** `AGENT_SLASH_SKILL_INVOCATION=false` and `instruction` is `What is /usr/bin?` (free text containing `/`)
- **THEN** the system MUST NOT treat it as a slash invocation; the `/` is treated as ordinary text