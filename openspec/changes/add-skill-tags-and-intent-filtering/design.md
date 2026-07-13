## Context

e2ac8ce 引入向量检索技能匹配（commit 标题：`feat: 实现向量检索技能匹配系统，重构技能发现流程`），以**纯语义匹配**作为主召回路径，关键词增强（`FILE_TYPE_KEYWORDS` / `ACTION_SYNONYMS`）作加分项。

**今天的痛点**：
- 实际测试中，对中文短 query（如 "在文件末尾追加一行"），BGE cosine 落在 0.18-0.30，常被 0.25 阈值过滤掉
- 同样的 query 在多个 ReAct 迭代里反复 miss，agent 进入"换关键词 → 再试 → 仍 miss"的循环（最近一次测试中累计 18 次尝试）
- FileToolSeeder 已重构成 `registerTool()` 模式，新增 tag 列几乎零侵入

**机会**：现有 37 个文件工具已可清晰归类到 3 个维度（文件类型 / 操作意图 / 业务场景），把"标签预筛 + 向量打分"作为双阶段召回，能用极低成本显著提升匹配准确率。

**约束**：
- AGENTS.md §5.5「尽量不修改 agent-core」——本次需求**明确**要求 agent-core 传 tags，**必须**在 proposal / design 里说清楚
- AGENTS.md §5.3「给已有表加列必须同步 `SchemaMigrationRunner` 幂等迁移」
- AGENTS.md §5.4「JDK 1.8 兼容，无 `var` / Records / listOf(...)」

## Goals / Non-Goals

**Goals:**
1. **加 3 列**到 `skills` 表（file_type / operation_intent / business_scenario），幂等迁移兼容空库 + 旧库
2. **种子同步**：FileToolSeeder 在 seed 时一次性写入 3 列（与本次需求图示表格完全一致）
3. **API 扩展**：`POST /api/skills/match` 加 `tags` 字段（向后兼容，省略走 e2ac8ce 原行为）
4. **三阶段流水线**：
   - 阶段 1（新增）：SQL 硬筛 `IN (?,?,?)` 三列 OR 匹配
   - 阶段 2（沿用 e2ac8ce）：cosine + 关键词 hybrid 打分
   - 阶段 3（沿用 e2ac8ce）：按 search_weight 加权取 top-K
5. **agent-core tags 获取**：主 Agent LLM 在 tool call 时通过 `args.tags` 自报；schema describe + system prompt 强化引导；白名单校验 + 截断到 3 个

**Non-Goals:**
- 不改向量 embedding 模型 / 不引入新的向量数据库
- 不改前端 / 不改 `SkillManagementModal.vue`
- 不改 e2ac8ce 的关键词表（`FILE_TYPE_KEYWORDS` / `ACTION_SYNONYMS` / `SKILL_TYPE_MAP`）
- 不引入新的 LLM 依赖（用主 Agent 已用的 ChatOpenAI SDK + 用户配置的同一 baseUrl/apiKey）
- 不强制 tags 非空（始终向后兼容）

## Decisions

### D1. 标签权威源：`FileToolSeeder.TOOL_TAGS` 单一份

**为什么**：Java 端是单一权威，agent-core prompt 文案镜像（`// 镜像 FileToolSeeder.TOOL_TAGS` 注释 + PR review check）；减少双份维护漂移风险。

**备选**：
- 反向（agent-core TS 为权威）—— Java 端要 import TS 生成的 JSON，不可行
- DB 为权威，agent-core 启动期拉 DB —— 引入跨服务读，启动慢一倍，不必要

### D2. SQL OR 匹配（非 AND）

```
WHERE skill_owner_type = 2
  AND enabled = 1
  AND (search_weight IS NULL OR search_weight > 0)
  AND (
        file_type IN (?, ?, ?)
     OR operation_intent IN (?, ?, ?)
     OR business_scenario IN (?, ?, ?)
  )
```

**为什么 OR**：用户的 "1-3 个标签" 是**多个命中维度**，OR 才是"任一命中即入选"的召回直觉。AND 会过严，把真正该用的工具过滤掉。

**OR 的实操**：tags = `["Excel", "分析"]` → 12 个 excel_* 入选 + 4 个 analysis 操作（excel_aggregate/pivot/calculate/validate）→ 12 distinct candidates（excel_* 已覆盖子集）→ 向量打分

### D3. 候选数小于 `MIN_CANDIDATE_SIZE = 1` 时降级全量

```java
if (candidates != null && candidates.size() < 1) {
    log.warn("[SkillEmbedding] SQL filter returned 0 candidates for tags={}, " +
             "below MIN_CANDIDATE_SIZE=1, fallback to full pool", candidates.size(), tags);
    candidates = null;
}
```

**为什么是 1 不是 5**：23 个标签里每标签通常只命中 1-3 个工具（"写入"→2 个，"读取"→3 个，"分析"→4 个……），保守的 LLM 倾向只返回 1 个标签。5 太高会让安全阀几乎总是触发，tag 路径形同虚设（"末尾追加 → file_write" 的初次实现就是这个问题）。1 = 信任白名单过滤结果，仅在 SQL 真返回 0（hallucination tag 全部不在白名单）时才回退全量池。

### D4. tags 来源：主 Agent LLM 自报（路径 B）—— 替代早期独立 LLM 设计

**早期实现（路径 A，已废）**：用独立 ChatOpenAI 实例 + 1500ms 超时独立调用一次 LLM 抽 tags。问题：
- deepseek-v4-pro 等流式主 LLM 的首字节响应需要 2-3 秒，独立短实例同样易超时（实测 6/6 次重试全部 timeout）
- 每轮 ReAct 都引入一次额外 round-trip，500-1500ms 延迟
- 异常路径复杂，要 `Promise.race` + try/catch + JSON parse + 白名单 filter 全套

**现实现（路径 B）**：依赖主 Agent LLM 在 tool call 时通过 `args.tags` 字段直接给出：

```ts
// execute-skill.ts tool schema
tags: z.array(z.string()).max(3).optional().describe(`
  可选 1-3 个意图标签（agent-core 内白名单校验），用于 SQL 硬筛候选技能。
  白名单：通用/Word/文本/Markdown/Excel（file_type）；展示/删除/读取/写入/生成/提取/搜索/修改/分析/转换/新建/校验（operation_intent）；文件管理/检索查看/生成导出/提取解析/编辑整理/计算分析（business_scenario）。
  例子：用户说"在文件末尾追加一行" → tags=["写入"]。
  不确定时省略（tags 不传 = 与 e2ac8ce 完全等价）。
`),
```

```ts
// execute-skill.ts tool implementation
const rawTags: string[] | undefined = Array.isArray(args.tags) ? args.tags : undefined;
let tags: string[] | null = null;
if (rawTags && rawTags.length > 0) {
  const seen = new Set<string>();
  const filtered: string[] = [];
  for (const t of rawTags) {
    if (typeof t !== "string") continue;
    const tag = t.trim();
    if (!tag || !INTENT_TAG_WHITELIST.has(tag) || seen.has(tag)) continue;
    seen.add(tag);
    filtered.push(tag);
    if (filtered.length >= 3) break;
  }
  if (filtered.length > 0) tags = filtered;
}
```

**为什么换路径 B**：
- 复用主 LLM 已理解的用户上下文——它本来就要决定调哪个 tool，让它同时附上 1-3 个标签**几乎零成本**
- 0 额外 round-trip（与旧 e2ac8ce 的 latency 持平）
- 0 新故障点（不引入第二个 LLM 调用）；主 LLM 不稳？tags 不传 = 走原路径，不影响功能
- tool schema 的 `describe()` 字段对 LLM 透明可见，**不需要独立 prompt 模板**

**强化引导**：除 schema 外，`prompts/zh.ts` 的 `skillDiscoveryPolicy` 段新增【意图标签 tags（强烈推荐）】小节，正面告诉 LLM：调用前想想用户任务的标签维度，能确定就输出 tags，不确定就省略。`en.ts` 同步。

### D5. tags 参数：`autoSearchSkills` 同时驱动业务 match + utility 不变

```ts
// execute-skill.ts / autoSearchSkills 内
const [businessMatches, utilitySkills] = await Promise.all([
    axios.post(`${gatewayUrl}/api/skills/match`,
        { query, tags, limit: 5 },                    // 业务: 透传 tags（可能为 null）
        { headers: { 'X-API-Key': apiToken, 'Content-Type': 'application/json' } }),
    getUtilitySkills(gatewayUrl, apiToken),            // 工具级不带 tags
]);
```

**为什么 utility 不带 tags**：file_list / file_read / file_write 是基线工具集，无论 query 涉及什么文件类型都需要它们；标签只影响主业务召回，utility 始终全量。

**业务 match body 构造**：
```ts
const businessBody: { query: string; limit: number; tags?: string[] } = { query, limit: 5 };
if (tags && tags.length > 0) businessBody.tags = tags;
```
- tags 为 null/empty → 不写 `tags` 字段，gateway 走 e2ac8ce 全量匹配（向后兼容）
- tags 有值 → 写 `tags`，gateway 进三阶段 pipeline

### D6. API 兼容性策略：纯字段加法 + 内部 Optional 处理

```java
public class SkillMatchRequest {
    private String query;
    private int limit = 8;
    private List<String> tags = null;          // 新增，可选

    public List<String> getTags() {
        return tags != null ? tags : null;
    }
}
```

- 旧调用方不发 `tags` → Jackson → `tags = null` → `match(query, null, limit)` → 跳过 SQL 硬筛 → 完全等价 e2ac8ce
- 旧调用方发 `tags: null` → 同上
- 旧调用方发 `tags: []` → `tags = Collections.emptyList()` → 判定为空 → 同上
- 新调用方发 `tags: ["Excel"]` → 走 SQL 硬筛

### D7. AGENTS.md §5.5 例外说明

本 change **是用户明确要求** 改 agent-core（把识别到的标签作为参数传递）。理由：
- 用户原始需求："由意图识别将当前的任务内容按照tools的分类进行拆分...在调用match方法时，将识别到的标签作为一个参数传递"
- 意图识别必须在调用 match 之前完成 → 必须发生在 agent-core（gateway 接收 match 时 tags 已定型，无法反推用户 prompt）
- 替代方案不可行：
  - agent-core 调一次 LLM 完后才调 match，自然选择
  - 若改在 gateway：需要把 userInput 顺带传给 /api/skills/match，但 LLM 调用会让 match 响应时长不可预测，破坏现有实时性
- 对 agent-core 影响小：仅 execute-skill.ts 内函数加约 80 行
- 对现有 Skill 类型兼容性 100% 保留（utility fetch 不动 / 业务 match 体增强）
- 不需要回归测试（e2ac8ce 的 match 单测仍适用；标签路径覆盖独立测试）

## Risks / Trade-offs

| # | 风险 | 缓解 |
|---|---|---|
| R1 | 旧库首次启动缺 3 列 | `SchemaMigrationRunner.migrateSkills()` 用 `ensureColumn` 模式幂等 ALTER，**AGENTS.md §5.3 自查 checklist 全部通过**（任务清单 §1.4）|
| R2 | （已废）独立意图识别 LLM 调用 500-1500ms 延迟 | 改用路径 B：主 LLM 自报，无独立 round-trip；tags 输出超时即与不带 tags 等价 |
| R3 | LLM 幻觉未授权标签 | prompt 里硬编码 23 标签白名单 + 严格 JSON 解析 + 白名单过滤日志输出 |
| R4 | 双份词表漂移（agent-core prompt vs Java TOOL_TAGS） | agent-core 文件顶部加 `// 镜像 FileToolSeeder.TOOL_TAGS，见 backend/skill-gateway/src/main/java/.../config/FileToolSeeder.java §7` 注释；tasks.md §1.5 要求 PR 评审强 check |
| R5 | SQL OR 匹配在 >> 200 技能时性能下降 | 当前 37 个工具 < 5ms SELECT；预留 LIKE 索引兜底（如未来 FILE_TYPE_KEYWORDS 需要模糊匹配）|
| R6 | 文件类型 vs 操作意图同字符串混淆（如 "Excel" 即文件类型也是用户语言里的 "优秀"）| 23 个白名单都是单一语义；schema 列类型为 VARCHAR(32) 限定长度；查询时`IN`精确匹配，不分词 |
| R7 | agent-core prompt 内存 token 成本增加 | ~150 token 一次，可忽略 |
| R8 | tags=null 的兼容行为被新代码 subtle 改变 | tasks.md §10 加端到端 e2e 测试：`scripts/test-no-tags.sh` 验证旧调用路径仍正确 |
| R9 | 候选过窄漏召回 | D3 安全阀 (< 5 降级全量) + log warn 监控 |
| R10 | 标签种子数据漂移（FileToolSeeder 改了 TOOL_TAGS 但旧行已被老版本 seed 写入）| FileToolSeeder.run() MUST 检测 NULL → UPDATE；不为 NULL 但新版本改了值 → 也 UPDATE（实现：删后 insert 或 ON DUPLICATE KEY UPDATE）|

## Migration Plan

**Phase 1: 数据层（必须先完成）**
1. `schema-mysql.sql` 的 `CREATE TABLE skills` 加 3 列 → 空库路径
2. `SchemaMigrationRunner.migrateSkills()` 加 3 条 `ensureColumn` → 旧库路径
3. **部署顺序**：先 deploy skill-gateway 新版本（SchemaMigrationRunner 自动跑 ALTER）+ 同时重启（保证列已就绪再 FileToolSeeder）

**Phase 2: 行为层**
4. `Skill.java` 加 3 个 `@TableField` + getter/setter
5. `FileToolSeeder.TOOL_TAGS` 静态映射 + `seedSkill(...)` 签名扩展（seed 时写 3 列）
6. `SkillEmbeddingService.match(query, tags, limit)` 重载 + 三阶段流水线
7. `SkillMatchRequest` 加 `tags` 字段
8. `SkillController.matchSkills` 兼容处理 null/empty

**Phase 3: 调用方**
9. agent-core `execute-skill.ts` 加意图识别 + `autoSearchSkills` 签名扩展
10. agent-core `prompts/zh.ts` + `en.ts` 加 `INTENT_RECOGNITION_SYSTEM_PROMPT`

**回滚策略**：
- 任何阶段失败 → 旧 skill-gateway / agent-core 容器镜像直接回滚（无 schema 破坏，因为 3 列可空）
- 已写入的标签值无需清理（旧数据兼容）

## Open Questions

1. **是否需要在 SkillManagementModal.vue 显示这 3 列给用户编辑？** —— 暂定为仅后台 seed，不暴露；后续若需要可在另一个 change 加
2. **`excel_init_temp` / `file_init_temp` 等 init_temp 类工具的标签设计**：纳入"文件管理" / "新建" 维度统一处理（详见 TOOL_TAGS 表格）
3. **`searchQuery` vs `userInput` 哪个优先做意图识别输入？** —— D4 searchQuery 优先（已被 spec 锁定）
4. **标签跨语言**：当前 23 标签都是中文。未来若新增英文标签需要双语映射 —— 不在本 change 范围
