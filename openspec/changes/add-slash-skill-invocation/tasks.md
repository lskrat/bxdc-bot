## 1. Backend Slash Detection

- [ ] 1.1 在 `agent.controller.ts` 加 helper `detectSlashSkillInvocation(instruction, enabledSkills)`：
  - regex `/^\/([^\s]+)\s*(.*)$/s`
  - 返回 `{matched: true, skillId, skillName, args}` 或 `{matched: false}`
  - name 匹配：trim + case-insensitive equals
- [ ] 1.2 在 `agent.controller.ts` 加 helper `injectForcedSkillDirective(skillId, skillName)`：返回 ≤ 300 chars 的 system 追加块
- [ ] 1.3 读取 `AGENT_SLASH_SKILL_INVOCATION` env（truthy = true|1|yes|on，case-insensitive）
- [ ] 1.4 在 controller `runTask` 里：当 env true 且 enabledSkills 已加载且 slash detection matched → 把 directive 追加到 `userContent` 末尾（不替换任何段）

## 2. Frontend Slash Picker

- [ ] 2.1 新增 `frontend/src/components/SlashSkillPicker.vue`：inline autocomplete 列表，跟随输入框下方
- [ ] 2.2 在 `MessageInput.vue` 检测 `inputValue.startsWith('/')` → 显示 picker，filters skills by token after `/`
- [ ] 2.3 选中后把 inputValue 改写为 `/<name> `（保留 trailing space 让用户继续输入）
- [ ] 2.4 点外部 / Esc / 删除 `/` → 关闭 picker
- [ ] 2.5 新增 `frontend/src/services/skillService.ts::listCheckedSkills(conversationId)` 调 `GET /api/skills/by-conversation`（复用 gateway endpoint）
- [ ] 2.6 在 `MessageInput.vue` mount 时 fetch enabled skills list（cache per conversationId）

## 3. Env & Config

- [ ] 3.1 更新 `backend/agent-core/.env.example`：加 `AGENT_SLASH_SKILL_INVOCATION=false` 注释块，引用 open spec
- [ ] 3.2 在 frontend 加一个 build-time / runtime config 暴露 `VITE_SLASH_SKILL_INVOCATION`（避免 hardcode，方便环境差异）

## 4. Tests

- [ ] 4.1 单元测试 `detectSlashSkillInvocation`：
  - 不以 `/` 开头 → matched=false
  - `/foo` 无空格 → matched=true 但 args=''
  - `/foo bar baz` → matched=true, args='bar baz'
  - `/foo ` 末尾空格 → matched=true, args=''
  - 大小写不敏感（`/Test` 匹配 "test"）
  - 中文名（`/测试时间`）
  - 未知名 → matched=false
- [ ] 4.2 单元测试 `injectForcedSkillDirective`：返回 ≤ 300 chars，含 skill id + name + skillIds 提示
- [ ] 4.3 集成测试 e2e：
  - 开关关闭：`/usr/bin` 类普通文本不触发；与改前完全相同
  - 开关开启：`/测试时间` → LLM 调用 `execute_skill_with_context` with skillIds=[<id>]
  - 开关开启：`/测试时间 把今天时间戳给我` → LLM 调用 + 提取参数
  - 开关开启：`/没勾选的技能` → 不注入 directive，走 search_tools 老路径

## 5. Documentation

- [ ] 5.1 在 AGENTS.md 加一节 "Slash Skill Invocation"：语法 / 范围 / env 开关 / 回退方法

## 6. Commit & Deploy

- [ ] 6.1 分 2-3 个 commit：backend / frontend / docs
- [ ] 6.2 同事仓库 push：仅在你确认 frontend 已就绪后一次性 push
- [ ] 6.3 内网环境默认 `AGENT_SLASH_SKILL_INVOCATION=false`，等 frontend 完成后手动 opt-in