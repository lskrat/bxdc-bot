## Why

Currently, when a user wants to invoke a specific frontend-checked skill, they must write a free-form request and rely on the LLM to discover the skill via `search_tools` and choose it. That indirection occasionally misfires (the LLM picks a similar-looking skill, asks the user a clarifying question, or produces a plan rather than executing). Users who already know exactly which skill they want — e.g. "run /测试时间 right now" — should be able to force that skill with 100% hit rate, while still letting the LLM extract natural-language parameters into the skill's JSON schema.

## What Changes

- Add a frontend `/` (or `#`) picker that lists the user-checked skills (sourced from the same `loadFromConversation` set already used by `createMainAgent`) and lets the user pick one before sending.
- After the user selects a skill and submits, the request still goes through `/agent/run`, but `instruction` is prefixed with `/<skill-name> ` (or `#<skill-name> `) and the user-typed remainder is appended as natural-language arguments. The two trigger characters are aliases — no semantic difference.
- agent-core detects the leading `/` or `#` trigger character at the top of `instruction`. When `AGENT_SLASH_SKILL_INVOCATION=true` is set, it appends a directive to the static system prompt forcing the LLM to call exactly that skill and to extract arguments from the trailing natural language.
- A new env `AGENT_SLASH_SKILL_INVOCATION` (default `false`) gates the whole feature. When the flag is off the controller behaves exactly as today: no detection, no prompt injection, no UI change.

## Capabilities

### New Capabilities
- `slash-skill-invocation`: frontend slash picker, controller-side `/<skill-name> ` prefix detection, forced-call directive injection, opt-in via `AGENT_SLASH_SKILL_INVOCATION` env.

### Modified Capabilities

(None — this change adds a new capability without changing existing requirement contracts. The "prompt injection on slash detection" lives entirely in the new spec.)

## Impact

### 受影响代码

| 文件 | 改动 |
|---|---|
| `frontend/src/components/MessageInput.vue` | `/` 前缀检测 + 弹技能选择器 + 选中后构造 `/<name> <args>` instruction |
| `frontend/src/composables/useChat.ts` | 在 send 前 hook 处理 slash instruction（识别 + 重写） |
| `frontend/src/services/skillService.ts` | 新增 `listCheckedSkills(conversationId)` 调用 `GET /api/skills/by-conversation` |
| `backend/agent-core/src/controller/agent.controller.ts` | 新增 `detectSlashSkillInvocation(instruction)` + 在 `userContent` 注入强制调用指令 |
| `backend/agent-core/src/controller/agent.controller.ts` | 读取 `AGENT_SLASH_SKILL_INVOCATION` env |
| `backend/agent-core/.env.example` | 加 `AGENT_SLASH_SKILL_INVOCATION=false` 注释 |

### 受影响 API

- `POST /agent/run`：当 `instruction` 以 `/<skill-name> ` 开头且开关启用时，注入强制调用指令。响应格式不变。
- 新增 frontend-only 内部调用：`GET /api/skills/by-conversation`（已有，frontend 仅复用）

### 依赖

- 无新增第三方包
- 复用现有 `loadFromConversation` 路径（commit `812f957` / `433777e`）拿 frontend 勾选技能列表
- 复用 `execute_skill_with_context`（不绕过 LLM，让 LLM 处理参数）

### 兼容性

- **AGENT_SLASH_SKILL_INVOCATION=false (默认)** → 完全走老路径，**不影响任何现有功能**
- 开关开启后：
  - 普通 instruction（不以 `/` 开头）行为完全不变
  - `/<name> ` 但 `<name>` 不在勾选列表 → 注入指令失败（fallback 到 search_tools 路径，不报错）
  - 已有 `AGENT_PROMPT_LEVEL` / `AGENT_LEGACY_DIRECT_TOOLS` 行为不变

### 测试范围

1. 开关关闭：所有现有 e2e 测试不变
2. 开关开启 + 普通 instruction：行为不变
3. 开关开启 + `/测试时间` 输入：LLM 100% 调用 `测试时间` 技能
4. 开关开启 + `/测试时间 abc` 输入：LLM 100% 调用 + 把 `abc` 提取成参数
5. 开关开启 + `/没勾选的技能`：fallback 到老路径（不破坏）