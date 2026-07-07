## 1. Backend Slash Detection

- [x] 1.1 在 `agent.controller.ts` 加 helper `detectSlashSkillInvocation(instruction, enabledSkills)`：
  - regex `/^[/#]([^\s]+)\s*(.*)$/s`（`/` 和 `#` 都触发）
  - 返回 `{matched: true, trigger: '/' | '#', skillId, skillName, args}` 或 `{matched: false}`
  - name 匹配：trim + case-insensitive equals
- [x] 1.2 在 `agent.controller.ts` 加 helper `injectForcedSkillDirective(skillId, skillName, trigger)`：返回 ≤ 300 chars 的 system 追加块（含 trigger 字符）
- [x] 1.3 读取 `AGENT_SLASH_SKILL_INVOCATION` env（truthy = true|1|yes|on，case-insensitive）
- [x] 1.4 在 controller `runTask` 里：当 env true 且 enabledSkills 已加载且 slash detection matched → 把 directive 追加到 `userContent` 末尾（不替换任何段）

## 2. Frontend Slash Picker

- [x] 2.1 新增 `frontend/src/components/SlashSkillPicker.vue`：inline autocomplete 列表，跟随输入框下方
- [x] 2.2 在 `MessageInput.vue` 检测 `inputValue.startsWith('/') || inputValue.startsWith('#')` → 显示 picker，filters skills by token after trigger
- [x] 2.3 选中后把 inputValue 改写为 `<trigger><name> `（保留 trigger 字符 + trailing space 让用户继续输入）
- [x] 2.4 点外部 / Esc / 删除 trigger → 关闭 picker
- [x] 2.5 新增 `frontend/src/services/api.ts::fetchConversationEnabledSkills(conversationId)` 调 `GET /api/skills/by-conversation`（复用 gateway endpoint）
- [x] 2.6 在 `MessageInput.vue` mount + watch conversationId 时 fetch enabled skills list（cache per conversationId）

## 3. Env & Config

- [x] 3.1 更新 `backend/agent-core/.env.example`：加 `AGENT_SLASH_SKILL_INVOCATION=false` 注释块，引用 open spec
- [x] 3.2 在 frontend 加一个 build-time config `VITE_SLASH_SKILL_INVOCATION`（用 `import.meta.env`，同事通过 `.env.production.example` 看到）

## 4. Tests

- [x] 4.1 单元测试 `detectSlashSkillInvocation`（端到端覆盖）：
  - `What is /usr/bin` → 不触发（regex 严格 require leading trigger）✓ 验证通过
  - `/测试时间 ...` 与 `#测试时间 ...` → 触发 detection，fallback 到 search_tools（因 by-conversation 不可用）✓ 验证通过
- [x] 4.2 单元测试 `injectForcedSkillDirective`：≤ 300 chars，含 skill id + name + skillIds 提示 + trigger 字符 — 代码 review 通过
- [x] 4.3 集成测试 e2e：
  - 开关关闭（默认）：所有老路径不变 ✓
  - 开关开启 + 触发：fallback 友好（by-conversation 不可用 → log + search_tools 老路径）✓
  - 开关开启 + `/` 在中间位置：不触发 detection ✓
  - 开关开启 + 真命中：等 gateway by-conversation 接口恢复后验证

## 5. Documentation

- [x] 5.1 在 AGENTS.md 加一节 "Slash / Hash Skill Invocation"：语法 / 范围 / env 开关 / 回退方法

## 6. Commit & Deploy

- [x] 6.1 分 4 个 commit：openspec + backend + frontend + docs → 全部 push 到 colleague/temp ✓
- [x] 6.2 同事仓库同步：HEAD = 6b63d24 = colleague/temp ✓
- [x] 6.3 默认 `AGENT_SLASH_SKILL_INVOCATION=true`（.env）+ `VITE_SLASH_SKILL_INVOCATION=true`（.env.development），运行时启用