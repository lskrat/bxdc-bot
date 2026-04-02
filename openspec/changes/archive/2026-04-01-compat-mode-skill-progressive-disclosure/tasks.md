## 1. 类型与元数据

- [x] 1.1 在 `SkillFrontmatter`（或等价类型）中增加可选 compact hint 字段，并规定最大长度常量（与 `skill.manager` 截断逻辑一致）
- [x] 1.2 在 `parseSkillDir` 中解析该字段并挂到 `RegisteredSkill`（或仅内部用于 prompt 构建的派生字段）

## 2. 兼容模式下的 prompt 编排

- [x] 2.1 更新 `buildSkillPromptContext`：当 `isAgentToolPromptCompatEnabled()` 为真时，将截断后的 hint 并入技能列表行（保持总预算可控）
- [x] 2.2 更新 `getLangChainTools` 中 `DynamicTool` 的 `description`：兼容模式下附加相同或互补的截断 hint，使【可用工具】与技能段信息一致
- [x] 2.3 审视 `formatToolsBlockForSystemPrompt`：在默认 `maxTotalBlockChars` / `maxSchemaCharsPerTool` 不变前提下，必要时压缩通用说明或调整段落顺序，避免净增系统长度

## 3. 测试与文档

- [x] 3.1 增加或更新单测：兼容模式开/关、有/无 hint、hint 超长截断、`buildSkillPromptContext` 与工具 description 均含预期片段
- [x] 3.2 在 `.env.example` 或内部运维说明中简短记录新 frontmatter 字段（可选 SKILL 示例一条）

## 4. 验证

- [x] 4.1 本地运行 `backend/agent-core` 相关测试套件，确认无回归
