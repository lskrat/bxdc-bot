## Why

当前 37 个系统文件工具的 `description` 写得较"功能描述式"（如"按列分组聚合 Excel 数据"），缺少高频用户意图词与"互斥边界"，导致两类问题：

1. **向量检索区分度差**：相近工具（excel_filter vs excel_sort vs excel_aggregate）description 主题词重叠，cosine 分数接近，LLM 拿到 top-K 仍要靠 schema 二次猜测。
2. **embedding 失败后兜底差**：当 embedding API 不可用时，[SkillEmbeddingService](file:///Users/zhangzhuang/ai/gitbbxdc-bot/bxdc-bot/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/service/SkillEmbeddingService.java) 走纯关键词评分，description 没有用户常用说法（"替换/筛选/汇总/透视/清洗/校验"）兜不住。

## What Changes

- **仅替换 description**：在 [FileToolSeeder.run()](file:///Users/zhangzhuang/ai/gitbbxdc-bot/bxdc-bot/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/config/FileToolSeeder.java#L55-L118) 和 [rollbackWordOpsIntegration()](file:///Users/zhangzhuang/ai/gitbbxdc-bot/bxdc-bot/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/config/FileToolSeeder.java#L297-L305) 中，按 3 段式模板（功能说明 / 触发关键词 / 注意事项）重写 37 个系统文件工具的 seed description。
- **不改 skills.name**：`name` 仍是 `configuration.toolName`、基础工具加载、子 Agent 调用名的稳定标识，不做真实重命名。
- **不改 TOOL_TAGS / schema / file_type / operation_intent / business_scenario / configuration**：标签词表与 schema 完全不动；当前代码已使用 15 复合标签（读取查看/编辑修改/创建写入/分析计算 + 5 file_type + 6 business_scenario），本次只对 description 增强。
- **不改 agent-core**：execute-skill.ts 的 INTENTION_TAG_WHITELIST 与 tool schema describe 不动。
- **不改检索算法**：SkillEmbeddingService、SkillMatchRequest、SkillMapper 三层管线 0 改动。

## Description Rewrite Rules

每条 description 严格按 **3 段式模板**：

```
功能说明：{粒度细节 + 场景}
触发关键词：{kw1}、{kw2}、{kw3}、{kw4}、{kw5}、{kw6}
注意事项：{互斥边界 + 互引工具}
```

- **功能说明**：1-2 句，落到具体粒度（"前后几行" / "二维交叉" / "比较运算符"），点出场景
- **触发关键词**：4-6 个、`、` 分隔，包含工具族词（txt/Excel/Word/Markdown）+ 行为词（grep/筛选/排序/透视）+ 同义词（按列排序 = 升降序）
- **注意事项**：用"X 不是 Y（用 Z）"格式显式划清与同类工具的边界

**强制互斥文案**（Excel 工具）：

| 工具 | 互斥文案（写入"注意事项"） |
|------|---------------------------|
| excel_filter | 只行筛选不排序/汇总/透视（用 excel_sort/aggregate/pivot）|
| excel_sort | 只调整行顺序不筛选/统计（用 excel_filter/aggregate）|
| excel_aggregate | 单层 group by 不是透视表（用 excel_pivot）；不新增列（用 excel_calculate）|
| excel_pivot | 二维交叉不是普通 group by（用 excel_aggregate）|
| excel_calculate | 新增计算列不统计汇总（用 excel_aggregate）|
| excel_select_columns | 列裁剪不是行筛选（用 excel_filter）|
| excel_clean | 只清洗不做业务计算（用 excel_calculate）|
| excel_validate | 只检查不修改（修用 excel_clean）|

**强制互斥文案**（Word 工具）：

| 工具 | 互斥文案 |
|------|----------|
| word_replace_text | 只改文字不处理 {{placeholder}}（用 word_template_fill）|
| word_template_fill | 只填占位符不做普通文本替换（用 word_replace_text）|

**BGE 长度约束**：

- 嵌入模型：`BAAI/bge-large-zh-v1.5`（max seq 512 tokens）
- 中文按 ~1.5 token/字估算 → 硬上限 ≈ 340 中文字
- 安全值：单条 description ≤ 100 中文字（实测 32-91）
- 用 `\n` 分隔 3 段（BGE 将其视为 whitespace，不影响编码）

## Capabilities

### New Capabilities

- （无 — 这是 seed 描述优化，描述字段在 Skill 实体已存在）

### Modified Capabilities

- （无 — 现有 spec 不覆盖 Skill.description 字段。本 change 是 seed 数据级别，spec 维护的是 API/行为契约）

## Impact

- **后端**：仅 [FileToolSeeder.java](file:///Users/zhangzhuang/ai/gitbbxdc-bot/bxdc-bot/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/config/FileToolSeeder.java) 的 description 字符串替换
  - run() 改 33 个 seed 调用（行 56-117）
  - rollbackWordOpsIntegration() 改 4 个 word_* seed 调用（行 299-302）
- **agent-core / 前端 / 检索算法**：0 改动
- **DB / schema / API**：0 改动
- **回归风险**：
  - description 仅参与 `SkillEmbeddingService` 评分（关键词 + 向量 cosine），不改 scoring 公式
  - 启动期 seeder 走 "已存在→更新" 分支，下次启动会自动刷新 DB 的 description 列
  - 用户在 Skill 管理页手工改过的 description 仍会被覆盖（与现状一致，seeder 无视人工改动）
