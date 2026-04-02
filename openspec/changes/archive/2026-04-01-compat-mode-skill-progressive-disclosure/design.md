## Context

- 兼容模式下，`formatToolsBlockForSystemPrompt` 将工具名、说明与 JSON Schema 写入【可用工具】；`buildSkillPromptContext` 仅列出技能名、短描述与 metadata 摘要。完整 SKILL 正文只在模型调用 `skill_*` 后由 `buildToolResult` 注入。
- 接口类 Skill 的规则（参数形态、嵌套 JSON、与 `extended_*` 的顺序等）往往写在 SKILL 正文深处，首轮调用缺少抓手；若把整个 SKILL 提前塞进系统消息，会与「超长内容的可控截断」目标冲突。
- 用户要求：**系统提示词总长度不增加**——理解为在现有 `maxSchemaCharsPerTool` / `maxTotalBlockChars` 等机制下，通过**内容编排与预算再分配**提升首轮准确率，而非提高默认上限。

## Goals / Non-Goals

**Goals:**

- 兼容模式开启时，模型在**未执行** `skill_*` 之前仍能获得「够用到能发出合法首轮 tool 调用」的要点（尤其对接口类 Skill）。
- 保持渐进披露：全文仍以 `skill_*` 返回为主路径；发现层只增加**有硬上限**的紧凑字段。
- 非兼容模式行为与 prompt 体积基线不变（开关关闭时无新增块）。

**Non-Goals:**

- 不要求自动解析 SKILL 正文全文生成摘要（脆弱且难测）；以显式元数据为主、可选启发式为辅需在 spec 中单独约束。
- 不承诺网关侧改造；仍假设部分环境仅依赖正文中的 XML / ```json 工具调用。

## Decisions

1. **紧凑提示来源：frontmatter 优先**  
   - 在 SKILL.md YAML frontmatter 中增加可选字段（名称实现时定为单一事实来源，例如 `compat_tool_hint` 或 `agent_compat_hint`），内容为单行或极短多行、硬截断。  
   - **理由**：可审计、可渐进补齐、不依赖 Markdown 结构推断。  
   - **备选**：从正文第一节抽取——放弃为首版，避免误截与多语言标题问题。

2. **展示位置：索引行 + 工具描述协同**  
   - `buildSkillPromptContext`：在兼容模式下，每条技能摘要行尾或独立前缀附加截断后的 `hint`（占用独立小预算，从现有摘要上限中扣减或单独常量上限）。  
   - `getLangChainTools` 生成的 `DynamicTool.description`：在兼容模式下附加同一段或互补片段，使【可用工具】里 `### skill_*` 块与系统技能段一致。  
   - **理由**：网关若主要扫【可用工具】，工具级描述最可见；技能段则服务「先读技能列表再选工具」的路径。  
   - **预算**：不新增全局 max 默认值；通过略压缩通用说明文案或对大 schema 工具维持现有截断，把字符拨给 `hint`。

3. **接口类 Skill 的运维约定**  
   - 在仓库 SKILL 模板或文档中说明：凡依赖嵌套 JSON、`extended_*` 链式调用或严格字段名的，**应当**填写 compat hint。  
   - **理由**：渐进披露由人/生成器维护最稳。

4. **与「超长截断」Requirement 的关系**  
   - hint 被截断时须在实现上可观测（日志或 metrics 可选，非本变更必须），行为上仍须满足 spec：截断后不得抛错。

## Risks / Trade-offs

- **[Risk] frontmatter 未填的 Skill 仍缺要点** → **Mitigation**：保持现有通用兼容说明；可选在 CI 或文档中 lint「接口类」Skill；后续再评估启发式。  
- **[Risk] hint 与正文不一致** → **Mitigation**：代码 review + 单测样例 SKILL；文档要求 hint 与正文参数节同步。  
- **[Trade-off] 索引行变长** → 通过 `MAX_DESCRIPTION_LENGTH` / 新 hint 上限常量显式平衡，避免单条无限增长。

## Migration Plan

1. 部署新版本 agent-core；默认无 frontmatter 时行为接近现状。  
2. 对接口类 SKILL 按需补 frontmatter（可分批）。  
3. 若需回滚：关闭兼容模式或回退版本即可，无需数据迁移。

## Open Questions

- frontmatter 字段最终命名是否与现有 `metadata` 嵌套合并（如 `metadata.compat_hint`）以减少顶层键扩散——实现阶段二选一并在 types 中固定。  
- 是否在【可用工具】内对 `skill_*` 统一提升 schema 区优先级（相对其他工具）需结合线上工具数量再调参。
