## Why

在 `AGENT_TOOL_PROMPT_COMPAT=true` 时，网关往往不下发或未使用原生 `tools` 通道，模型主要依赖系统 prompt 中的【可用工具】与技能摘要做首轮调用。当前技能全文仅在 `skill_*` 执行后注入，接口类 Skill（强依赖参数形态、嵌套 JSON、`extended_*` 协作规则等）在首轮容易用错 `input` 或漏掉闭合标签，而若把全文塞进系统 prompt 又会顶满长度上限。需要在**不扩大系统提示词总体预算**的前提下，用渐进披露补足「首轮可调用性」。

## What Changes

- 为兼容模式定义「渐进披露」分层：首轮仅暴露**有长度上限**的摘要与调用要点；完整 SKILL 仍在 `skill_*` 成功返回后提供（现有行为保留）。
- 在 agent-core 中实现可配置的**紧凑调用提示**来源（优先 Skill  frontmatter 显式字段，避免猜测正文结构），并与【可用工具】块内各 `skill_*` 的说明/schema 展示策略协同，在总长度上限内做**预算再分配**而非简单追加。
- 为「接口类」或高风险的 Skill 提供文档约定（如何在 SKILL.md 中声明 `compat` 相关元数据），保证运维可渐进补齐而不改代码。
- 增加/更新测试：兼容模式开关下，技能索引与工具块包含预期要点且不突破现有 max 配置语义。

## Capabilities

### New Capabilities

- `skill-compat-progressive-disclosure`：定义兼容模式下技能发现层必须提供的渐进披露内容、与【可用工具】预算的关系，以及可选 frontmatter 契约。

### Modified Capabilities

- （无）`openspec/specs/` 中尚无已归档的 `agent-tool-prompt-compat` 能力文档；本变更以新增能力 spec 为主，落地后与既有 `llm-tool-prompt-compat-mode` 变更中的概念对齐，归档时可再合并。

## Impact

- **代码**：`backend/agent-core` 内 `SkillManager`（`buildSkillPromptContext`、`getLangChainTools`）、`tool-prompt-compat.ts`（【可用工具】组装与截断策略）、相关类型与单测。
- **内容**：仓库内接口类 SKILL.md 可按需增加 frontmatter 字段（可选，渐进补齐）。
- **配置**：沿用现有 `AGENT_TOOL_PROMPT_COMPAT` 与工具块长度相关环境变量；若需新增上限应有默认值且默认不改变非兼容模式行为。
