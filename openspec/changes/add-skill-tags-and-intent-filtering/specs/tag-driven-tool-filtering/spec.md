## ADDED Requirements

### Requirement: 标签 SQL 硬筛作为向量检索前置阶段

`SkillEmbeddingService.match(query, tags, limit)` MUST 在向量打分前先做 SQL 硬筛，作为新增的第一阶段。SQL 使用 `IN (?, ?, ?)` 形式匹配三列任一命中，向量打分则只在筛出的候选 ID 上跑。

#### Scenario: 多标签 OR 匹配
- **WHEN** tags = `["Excel", "分析"]`
- **THEN** SQL MUST 返所有 `file_type='Excel'` 或 `operation_intent='分析'` 或 `business_scenario='分析'` 的系统技能（skill_owner_type=2）
- **AND** 该候选集作为向量打分池

#### Scenario: tags 为空完全等价 e2ac8ce
- **WHEN** tags 为 null 或空数组
- **THEN** MUST 跳过 SQL 硬筛直接走 e2ac8ce 向量打分，行为完全一致
- **AND** 旧调用方 0 改动可用

#### Scenario: 安全阀防止候选过窄
- **WHEN** SQL 硬筛返回的候选数量 < 5
- **THEN** MUST 降级到全量向量池（避免误召回把真正该用的工具过滤掉）
- **AND** log MUST 输出警告 "SQL filter returned N candidates, below threshold 5, fallback to full pool"

#### Scenario: search_weight 过滤一致
- **WHEN** SQL 硬筛查询
- **THEN** MUST 同时加 `search_weight > 0` 条件（与 e2ac8ce 的 loadIndex 行为一致）
- **AND** 不参与检索的 `search_weight = 0` 工具 MUST 排除

### Requirement: tags API 字段契约

`POST /api/skills/match` body MUST 支持可选 `tags: string[]` 字段：
- 不传 → tags = null → 走原路径
- `null` → tags = null → 同上
- `[]` → tags = empty → 同上（视为不传）
- `["Excel"]` → 走 SQL 硬筛

#### Scenario: 旧调用方兼容
- **WHEN** 调用方不发 `tags` 字段（agent-core e2ac8ce 旧版本）
- **THEN** `SkillMatchRequest.getTags()` MUST 返回 null
- **AND** match 走 e2ac8ce 原行为

#### Scenario: 新调用方
- **WHEN** 调用方发 `tags: ["Excel", "分析"]`
- **THEN** MUST 走三阶段 pipeline：SQL 硬筛 → 向量打分 → top-K

### Requirement: SkillMatchResponse 向后兼容

响应 MUST 不变：`{ matches: MatchItem[], total: int, query: string }`——不引入 `appliedTags`、`filterStrategy` 等新字段。标签行为对调用方透明。

#### Scenario: 响应结构稳定
- **WHEN** match 走 SQL 硬筛 + 向量打分三阶段
- **THEN** 响应 body MUST 与 e2ac8ce 完全兼容（字段、类型、顺序）

### Requirement: 失败回退到原路径

任何 SQL 异常、network timeout、FastJSON 反序列化错误 MUST 不抛出给调用方；catch 后走全量向量打分，与未传 tags 等价。

#### Scenario: SQL 异常
- **WHEN** findIdsByTags 抛 SQLException
- **THEN** MUST catch 后 log warn，candidates = null，走全量

#### Scenario: 数据库表无新列
- **WHEN** 数据库未升级（无 file_type/operation_intent/business_scenario 列）但代码已部署
- **THEN** MUST 不抛 `Unknown column` 异常；tags=null 时 SQL 硬筛根本不跑
- **AND** 运维侧 SchemaMigrationRunner 重启后自动补列（AGENTS.md §5.3）

### Requirement: 不破环现有 search_weight 行为

新的 SQL 硬筛 MUST 沿用 e2ac8ce 的 `search_weight > 0` 过滤，确保 `search_weight = 0` 配置人工下线的工具不被标签过滤意外拉回。

#### Scenario: search_weight=0 工具的双重排除
- **WHEN** 某工具 `search_weight = 0`
- **THEN** SQL 硬筛 MUST 排除该 ID（`WHERE search_weight > 0`）
- **AND** 向量打分 MUST 也排除该 ID（loadIndex 已 skip）
- **AND** tags 即便匹配该工具也不会让它进入 top-K
