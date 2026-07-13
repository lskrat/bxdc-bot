## Why

当前系统技能匹配（e2ac8ce 引入）完全依赖 BGE 向量相似度 + 关键词增强。对中文短 query（如"在文件末尾追加一行"），BGE cosine 在 0.18-0.30 区间，常被 0.25 阈值过滤掉，导致简单操作（如文件追加）也是 NO_MATCH。

**机会**：基于现有 37 个文件操作工具的清晰归类（文件类型 / 操作意图 / 业务场景 三维度），可在向量检索前先用标签把候选集从 37 缩到 3-12 个，**让真正该用的工具被向量打分选到**，同时减少 embedding 调用噪声。

**为什么是现在**：
1. e2ac8ce 已经把基础设施（SkillEmbeddingService、search_weight、FileToolSeeder 重构）全部铺好
2. FileToolSeeder 已暴露 `setSearchWeightEnabledFalse / registerTool` 模式，加 tag 列无侵入
3. 既有 FILE_TYPE_KEYWORDS / ACTION_SYNONYMS / SKILL_TYPE_MAP 可作为标签设计的事实依据

## What Changes

### 新增（数据层 + 行为）

- **`skills` 表新增 3 列**：`file_type`、`operation_intent`、`business_scenario`（VARCHAR(32)，可空）
  - 通过 `SchemaMigrationRunner.migrateSkills()` **幂等 `ADD COLUMN`**（AGENTS.md §5.3 强制）
  - `schema-mysql.sql` 的 `CREATE TABLE skills` 同步加列（空库路径）
- **`FileToolSeeder` 在 seed 37 个文件工具时同步写入 3 标签**，来源为本次需求图示表格
- **`SkillMatchRequest` 新增可选字段 `tags: List<String>`**（空时等同于旧行为，完全向后兼容）
- **`SkillEmbeddingService` 新增重载 `match(query, tags, limit)`**：三阶段 pipeline
  - 阶段 1（新增）：SQL 硬筛（`@Select` + 3 标签 OR 匹配，候选 < minThreshold 时 fallback 全量）
  - 阶段 2：保留 e2ac8ce 的 cosine + 关键词 hybrid 打分
  - 阶段 3：按 `search_weight` 加权排序取 top-K

### 新增（agent-core，**用户明确要求**——本 change 是本次需求的核心）

tags 由**主 Agent LLM** 在调用 `execute_skill_with_context` 时**自报**到 `args.tags` 字段，无需独立 LLM 调用。早期实现路径（独立 ChatOpenAI + 1500ms 超时）因主 LLM 流式首字节 2-3 秒 + 独立实例同样超时而被废，改用路径 B 的设计：

- **`execute_skill_with_context` tool schema 新增可选字段 `tags: string[] (max 3)`**：23 标签白名单 + 示例写在 `describe()` 中，主 Agent LLM 构造 tool call 时可见
- **主 LLM 利用已理解的用户上下文**输出 tags，不引入额外 round-trip
- **`prompts/zh.ts` + `en.ts` 的 `skillDiscoveryPolicy` 段**新增【意图标签 tags（强烈推荐）】小节，正面强化主 LLM 输出 tags
- **`autoSearchSkills` 签名扩展**：接受 `tags` 参数，**业务 match 用 tags，utility fetch 不带 tags**
- **POST `/api/skills/match` body 加 `tags` 字段**（optional，向后兼容——不传则走原匹配）
- **agent-core 入口白名单校验 + 截断到 3**：避免 LLM 幻觉标签路由到 gateway

### 不变（防御性保留）

- e2ac8ce 的向量打分主路径、关键词表、`search_weight` 过滤、agent-core 主调度逻辑 0 改动
- FileToolSeeder.seedSkill() 的 `registerTool()` 调用不变，只额外传 3 个 tag 参数
- `SkillController.matchSkills` 兼容 `tags=null`（即旧调用方 0 改动可用）

### 已知风险与缓解（写入 design.md）

| 风险 | 缓解 |
|---|---|
| 旧库首次启动缺 3 列 | SchemaMigrationRunner 幂等 ALTER（AGENTS.md §5.3 必查） |
| 标签 LLM 调用 500-1500ms 延迟 | 独立 ChatOpenAI + 1500ms Promise.race 兜底；超时/异常 → tags=null → 走原 e2ac8ce 路径（per-AGENTS.md §5.7 全 `/agent` 前缀规避） |
| LLM 抽出未授权标签 | prompt 里硬编码 23 标签白名单 + 严格 JSON 解析 + 白名单校验过滤 |
| 双份词表漂移 | agent-core 标签白名单与 FileToolSeeder.TOOL_TAGS 在 tasks.md 实施时加注释互引，**单一权威源 = FileToolSeeder.TOOL_TAGS**（Java 端）；agent-core prompt 用镜像字符串（启动期校验一致性） |
| Encoding / matchedCount 等之前踩过的坑 | 测试用例覆盖 + 全链路 e2e 命令（tasks.md §10） |

## Capabilities

### New Capabilities

- **`skill-tags-system`**: 技能的三维度标签（file_type / operation_intent / business_scenario）数据模型定义与种子维护
- **`intent-recognition-for-tool-search`**: 从用户 prompt 提取 1-3 个标签，作为 tool search 的辅助输入
- **`tag-driven-tool-filtering`**: 在向量检索前基于标签缩小候选集，降低误召回与 cosine 噪声敏感度

### Modified Capabilities

（无需求级变更——本 change 是 additive。e2ac8ce 引入的 `vector-skill-search` capability 是底层基础设施，新增 capability 是其上层使用）

## Impact

### 受影响代码

| 文件 | 类型 | 行数估计 |
|---|---|---|
| `backend/skill-gateway/src/main/resources/schema-mysql.sql` | schema 加列 | +3 |
| `backend/skill-gateway/src/main/java/.../entity/Skill.java` | 加 3 个 `@TableField` + getter/setter | +18 |
| `backend/skill-gateway/src/main/java/.../config/SchemaMigrationRunner.java` | `migrateSkills()` 加 3 条 `ensureColumn` | +12 |
| `backend/skill-gateway/src/main/java/.../config/FileToolSeeder.java` | 加 `TOOL_TAGS` 静态映射 + seedSkill 签名扩展 | +80 |
| `backend/skill-gateway/src/main/java/.../dto/SkillMatchRequest.java` | 加 `tags: List<String>` + getter/setter | +10 |
| `backend/skill-gateway/src/main/java/.../service/SkillEmbeddingService.java` | 加 SQL 硬筛 + 三阶段流水线 | +60 |
| `backend/skill-gateway/src/main/java/.../mapper/SkillMapper.java` | 加 `findIdsByTags(List<String>)` | +25 |
| `backend/agent-core/src/tools/execute-skill.ts` | 加意图识别 LLM 调用 + autoSearchSkills 签名扩展 | +80 |
| `backend/agent-core/src/prompts/zh.ts` | 加 INTENT_RECOGNITION_SYSTEM_PROMPT | +30 |
| `backend/agent-core/src/prompts/en.ts` | 加同 prompt 英文版 | +30 |
| `backend/agent-core/src/prompts/types.ts` | 注入新 prompt key | +2 |

**合计 ~350 行代码改动**（58% Java, 42% agent-core TypeScript），0 行前端代码。

### 受影响 API

- `POST /api/skills/match` 新增可选字段 `tags`，旧调用方不传 0 改动
- 无 breaking change（OpenAPI 兼容）

### 受影响运行时

- 启动期 `FileToolSeeder` 比 e2ac8ce 多写 3 字段（不增加 I/O 负担）
- 启动期 `SchemaMigrationRunner` 旧库多 3 条 `ALTER TABLE ADD COLUMN`（**幂等**，5.3 合规）
- 每条 match 流量多一次 SQL SELECT（带索引则 < 5ms）

### 不受影响

- Frontend（0 行改动；list-tool 列表由 SKillController 返回，新增 tag 字段不影响前端）
- LLM 模型切换 / OpenAI 兼容层（沿用 e2ac8ce 已建好的连接池）
- 异步任务系统、对话历史、SkillManagementModal 等无关联模块
