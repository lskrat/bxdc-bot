## ADDED Requirements

### Requirement: tags 由主 Agent LLM 在 tool 调用时自报

`execute_skill_with_context` 工具的 zod schema MUST 暴露可选字段 `tags: string[] (max 3)`。主 Agent LLM 在调用此工具时 MUST（在能确定时）通过此字段附带 1-3 个意图标签。

实现采用"主 LLM 自报"路径（路径 B）而非"独立 LLM 意图识别"路径（路径 A）。早期实现路径 A 因独立 ChatOpenAI 调用存在以下问题：
- deepseek-v4-pro 等流式主 LLM 的首字节响应需要 2-3 秒，独立短实例也易超时
- 每轮 try/catch 增加代码路径，调试复杂
- 引入额外 round-trip 延迟（500-1500ms）

改用主 LLM 自报后：tags 复用主 LLM 已理解用户请求的上下文，无额外 round-trip，无新故障点。

#### Scenario: 主 LLM 输出有效 tags
- **WHEN** 主 Agent 调用 `execute_skill_with_context({ userInput: "把 Excel 按部门汇总", searchQuery: "Excel 汇总", tags: ["Excel", "分析", "计算分析"] })`
- **THEN** gateway `POST /api/skills/match` body MUST 含 `tags: ["Excel", "分析", "计算分析"]`
- **AND** SQL 硬筛命中 file_type='Excel' ∪ operation_intent='分析' ∪ business_scenario='计算分析' 的 12 个工具

#### Scenario: 主 LLM 不确定，省略 tags
- **WHEN** 主 Agent 调用 `execute_skill_with_context({ userInput: "你好", tags: undefined })`
- **THEN** MUST 等价于 `tags=null`，gateway 走 e2ac8ce 全量向量打分
- **AND** 主 Agent 流不中断，体感与无 tags 完全一致

#### Scenario: 主 LLM 输出超 3 个标签
- **WHEN** 主 Agent 输出 `tags: ["Excel", "分析", "计算分析", "生成导出"]`
- **THEN** agent-core MUST 截断到前 3 个 `["Excel", "分析", "计算分析"]`
- **AND** 截断 MUST 在白名单校验通过后执行（避免截断掉唯一有效标签）

#### Scenario: 主 LLM 输出超过 1500ms
- **WHEN** 用户请求产生主 Agent 调 LLM 调用，主 LLM 流式首字节 > 1500ms
- **THEN** 不影响 tags 机制——tags 由主 LLM 输出，本身就要走完整流式响应
- **AND** 不存在"独立 tags LLM 超时"的故障点

### Requirement: 白名单校验防御

agent-core MUST 对 `args.tags` 每一项做白名单校验（23 个标准标签，与 FileToolSeeder.TOOL_TAGS 完全一致）。任何不在白名单的标签 MUST 被丢弃；最终传给 gateway 的 tags MUST 仅含白名单内值。

#### Scenario: 主 LLM 输出未授权标签
- **WHEN** args.tags = `["Excel", "区块链"]`，"区块链"不在 23 个白名单
- **THEN** 传给 gateway 的 tags MUST 仅含 `["Excel"]`
- **AND** agent.out MUST log `[TagsFromLLM] raw=["Excel","区块链"] → tags=["Excel"] (whitelist passed)`

#### Scenario: 主 LLM 全部幻觉
- **WHEN** args.tags = `["区块链", "AI绘画"]`，全部不在白名单
- **THEN** 过滤后 tags = [] → 规范化 `null` → gateway 走 e2ac8ce 全量匹配
- **AND** agent.out MUST log `tags=null (all out-of-whitelist)`

#### Scenario: 主 LLM 不传 tags 字段
- **WHEN** args.tags = undefined / 不存在
- **THEN** tags MUST 视为 null → gateway 走 e2ac8ce 全量匹配
- **AND** agent.out MUST log `raw=undefined (main LLM did NOT pass tags field)`

### Requirement: 23 标签白名单定义

| 维度 | 标签 |
|---|---|
| `file_type` | 通用 / Word / 文本 / Markdown / Excel |
| `operation_intent` | 展示 / 删除 / 读取 / 写入 / 生成 / 提取 / 搜索 / 修改 / 分析 / 转换 / 新建 / 校验 |
| `business_scenario` | 文件管理 / 检索查看 / 生成导出 / 提取解析 / 编辑整理 / 计算分析 |

合计 23 个标签。单一权威源 MUST 为 `backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/config/FileToolSeeder.java` 中的 `TOOL_TAGS` 静态映射。agent-core 侧的白名单 MUST 与之镜像，并在源码顶端加 `// MIRROR FileToolSeeder.TOOL_TAGS` 注释。

#### Scenario: 词表一致性
- **WHEN** 任何一处标签定义被修改
- **THEN** PR review MUST 拒绝合并除非另一处同步更新
- **AND** 此约束 MUST 通过 OpenSpec validate --strict 的 lint 规则强制

### Requirement: tool schema 暴露白名单到主 LLM

`execute_skill_with_context` 工具的 zod describe() MUST 在 23 标签白名单字符串中描述 `tags` 字段，让主 Agent LLM 在生成 tool call 时知道合法值。

#### Scenario: 主 LLM 读取 schema
- **WHEN** 主 Agent LLM 构造 tool call，注意到 schema 里有 `tags: { describe: "..." }` 字段
- **THEN** schema 的 describe MUST 列出全部 23 个白名单标签 + 1-3 个推荐 + 例子（如 "在文件末尾追加一行" → `tags=["写入"]`）
- **AND** MUST 告知主 LLM：不确定可省略 tags 字段

#### Scenario: system prompt 强化
- **WHEN** `AGENT_PROMPTS_LANGUAGE=zh`
- **THEN** `prompts/zh.ts` 的 `skillDiscoveryPolicy` 段 MUST 含【意图标签 tags（强烈推荐）】小节
- **AND** `prompts/en.ts` 同理含【Intent tags (strongly recommended)】小节
- **AND** 两份 prompt 内容 MUST 与 tool schema describe 完全等价

### Requirement: utility fetch 永远不带 tags

`autoSearchSkills` 内部业务 match MUST 带 tags；而同次调用内的 utility fetch（`file_list`/`file_read`/`file_write` 文件级工具） MUST 永远不带 tags 参数，确保 LLM 始终拿全量 utility 选项。

#### Scenario: 业务 vs utility 不同请求体
- **WHEN** `autoSearchSkills({query, tags, limit})` 被调
- **THEN** business match body MUST 为 `{ query, tags, limit }`
- **AND** utility fetch body MUST 为 `{ query, limit }`（**无 tags 字段**）
- **AND** 两者 MUST 并行（沿用 e2ac8ce 的 Promise.all 模式）

### Requirement: utility 兜底 0 分设计

utility 工具（`file_list`/`file_read`/`file_write`）在追加到最终结果列表时 MUST 保留 `score = 0` 以便压到列表底部；不参与 LLM 选择排序决策。

#### Scenario: utility 显示
- **WHEN** utility 被追加到匹配结果
- **THEN** 其 skill entry 的 score MUST 为 0
- **AND** name / description 等字段 MUST 用 utility fetch 时 gateway 返回的真实值（不被固定硬编码）
- **AND** 前端可观察到的 0.00 是设计预期，非 bug；如需改善显示请走单独的 UI change
