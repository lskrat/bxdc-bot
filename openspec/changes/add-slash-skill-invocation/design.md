## Context

### 现状
- frontend `MessageInput.vue` 直接发 `instruction` 到 `/agent/run`，LLM 通过 `search_tools` 检索技能。
- frontend 已有 `SkillHub.vue` / `SkillManagementModal.vue` 管理勾选状态；勾选结果持久化在 conversations.enabled_skills。
- agent-core `createMainAgent` 通过 `loadFromConversation: true` 拿勾选技能并直接挂载 LangChain tools（commit `433777e`）。
- 用户用勾选技能时只能写自然语言让 LLM 选；LLM 偶尔选错、问澄清、给计划而不执行。

### 关键约束
- 不影响原功能（开关默认关闭，老路径完全不变）
- 复用现有 `by-conversation` 接口拿勾选列表（已存在）
- **仍走 LLM**：只强制选技能，不绕过 LLM 提取参数

## Goals / Non-Goals

**Goals:**
- 提供 `/技能名 参数` 语法让用户 100% 锁定技能
- frontend 提供 `/` 触发的轻量选择器（不弹模态框，inline autocomplete）
- agent-core 检测后通过 prompt injection 强制 LLM 调用该技能
- `AGENT_SLASH_SKILL_INVOCATION=true` 控制启用，默认 false

**Non-Goals:**
- 不绕过 LLM（仍然让 LLM 处理参数提取，避免结构化参数模板重新发明）
- 不重写 skill-gateway 的 `/api/skills/execute`（保留 execute_skill_with_context 路径）
- 不支持多技能组合（一次只能 `/一个技能`）
- 不支持 `/未勾选的技能`（严格限制在 frontend 已勾选列表）

## Decisions

### Decision 1: Detection 在 agent-core 而不是 frontend
**做法**：frontend 只构造 `/技能名 参数` instruction + 普通字段，**不发**特殊字段（如 `forcedSkillId`）。agent-core 用正则 `/^\\/([^\\s]+)\\s+(.*)$/s` 解析。

**为什么**：
- 单一职责：agent-core 决定 prompt injection，frontend 只管 UI
- 解耦：将来如果加 slash 功能在 cli / api 调用，无需 frontend 改
- 安全：frontend 不传"信任字段"，避免绕过 LLM

**备选考虑**：
- ❌ frontend 加 `forcedSkill` 字段：需要在 agent-core 加 schema + validation；当前 `Body` 没这个字段，破坏向后兼容
- ✅ agent-core 检测：纯字符串处理，无 schema 改动

### Decision 2: Prompt Injection（不绕过 LLM）
**做法**：检测到 `/技能名 ` 后，**追加**（不替换）一段 system 提示到 `userContent` 末尾：

```
[Forced Skill Invocation]
The user has explicitly selected skill "测试时间" via slash syntax.
You MUST call this exact skill with execute_skill_with_context, passing
skillIds=["<skill id>"] (do NOT use any other skill). Extract the
parameters from the user's natural language below into the skill's
JSON schema.
```

**为什么**：
- 100% 命中：LLM 看到 system 指令必然调用指定技能
- 仍走 LLM：参数提取由 LLM 处理（用户的"abc"会被理解成 skill schema 里的参数）
- 不破坏 skill schema：execute_skill_with_context 不变

**备选考虑**：
- ❌ 前端直接调 `/api/skills/execute` 跳过 LLM：完全去掉 LLM 提取参数能力
- ❌ 强制 skill id 传给 execute_skill_with_context：需要 controller 改 schema
- ✅ prompt injection + LLM：最简单 + 100% 命中 + LLM 处理参数

### Decision 3: Skill 名称解析（id vs name）
**做法**：instruction 中用 **技能显示名**（中文/英文混合），agent-core 通过 `by-conversation` 返回的 skill 列表按 name 匹配（不区分大小写）。匹配到就 inject，未匹配到就 fallback 到老路径（不报错）。

**为什么**：
- 用户友好：用户不需要记 skill id（数字 ID 难记）
- 容错：中文名也能匹配

**备选考虑**：
- ❌ 用 skill id（数字）：用户友好差
- ✅ 用 name 匹配：用户友好

### Decision 4: 不重写 frontend 选择器组件
**做法**：复用现有 `SkillHub` 模式，新加一个轻量 `SlashSkillPicker.vue` 组件（inline autocomplete 列表，跟着 `/` 字符位置显示），不弹模态框。

**为什么**：
- 不打断对话流
- 复用 skill icon / 描述展示逻辑
- 组件小（~100 行）

**备选考虑**：
- ❌ 复用 SkillHub：太重（带勾选管理）
- ✅ 新加轻量 inline picker：UX 更轻

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| **R1: 技能名重名导致歧义** | `/技能名` 严格匹配 frontend 勾选列表；重名时按 frontend 顺序第一个匹配，**但** frontend 勾选列表来自 `by-conversation`，gateway 已去重 |
| **R2: LLM 误解自然语言参数** | 这是 LLM 通用问题，不是 slash 功能新增；用户可手动改 instruction 重试 |
| **R3: prompt injection 增大 prompt 体积** | 注入文本 ~150 字符，只在 slash 模式生效；未 slash 模式不受影响 |
| **R4: 误触 `/` 字符** | 用户输入纯文本带 `/` 不会被识别（必须有 `/技能名 ` 模式——即 `/` 后跟一个 token 然后空格）；regex 严格 |
| **R5: 用户想用未勾选的技能** | 严格 fallback：未匹配到就跳过 slash 逻辑，**完全走老 search_tools 路径** |
| **R6: regex 与多语言冲突** | regex 用 `/^\\/([^\\s]+)\\s+(.*)$/s`，`[^\\s]+` 匹配任何非空白字符（含中文）；trim 后比对 name |
| **R7: Skill 名带空格** | 限制为单 token（无空格）；**有空格的名字需要在 Skill Hub 重命名**（前端已有约束）|

## Migration Plan

### 阶段 1：实现 + 单测（本地）
1. agent-core controller 加 `detectSlashSkillInvocation` + `injectForcedSkillDirective`
2. `.env.example` 加 `AGENT_SLASH_SKILL_INVOCATION=false` 注释
3. frontend 新增 `SlashSkillPicker.vue`
4. frontend `MessageInput.vue` 加 `/` 触发 + 选择后构造 `/技能名 args`
5. 单测：detectSlashSkillInvocation 各种边界（无 slash / 空格 / 重名 / 大小写 / 中文）
6. e2e：开关关闭 → 行为不变；开关开启 → 100% 命中

### 阶段 2：内网环境 + 监控
1. .env 加 `AGENT_SLASH_SKILL_INVOCATION=true`
2. 让 1-2 个 user 试用 + 收集反馈
3. 监控：slash 触发频次、命中率、误识别率

### 阶段 3：清理（30-60 天后）
- 稳定后把默认从 false 改成 true
- 或者保留 false 作为 opt-in

### Rollback 流程

任何阶段发现 regression：
```bash
AGENT_SLASH_SKILL_INVOCATION=false   # 在 .env
# 重启 agent-core
# frontend 可以保留 picker UI，但 detection 关闭，行为完全老路径
```