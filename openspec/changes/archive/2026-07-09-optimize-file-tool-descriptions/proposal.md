## Why

当前 37 个系统文件工具的 `description` 写得较"功能描述式"（如"按列分组聚合 Excel 数据"），缺少高频用户意图词与"互斥边界"，导致两类问题：

1. **向量检索区分度差**：相近工具（excel_filter vs excel_sort vs excel_aggregate）description 主题词重叠，cosine 分数接近，LLM 拿到 top-K 仍要靠 schema 二次猜测。
2. **embedding 失败后兜底差**：当 embedding API 不可用时，[SkillEmbeddingService](file:///Users/zhangzhuang/ai/gitbbxdc-bot/bxdc-bot/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/service/SkillEmbeddingService.java) 走纯关键词评分，description 没有用户常用说法（"替换/筛选/汇总/透视/清洗/校验"）兜不住。

## What Changes

- **仅替换 description**：在 [FileToolSeeder.run()](file:///Users/zhangzhuang/ai/gitbbxdc-bot/bxdc-bot/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/config/FileToolSeeder.java#L55-L118) 和 [rollbackWordOpsIntegration()](file:///Users/zhangzhuang/ai/gitbbxdc-bot/bxdc-bot/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/config/FileToolSeeder.java#L275-L305) 中，替换 37 个系统文件工具的 seed description。
- **不改 skills.name**：`name` 仍是 `configuration.toolName`、基础工具加载、子 Agent 调用名的稳定标识，不做真实重命名。
- **不改 TOOL_TAGS / schema / file_type / operation_intent / business_scenario / configuration**：标签词表与 schema 完全不动；当前代码已使用 15 复合标签（读取查看/编辑修改/创建写入/分析计算 + 5 file_type + 6 business_scenario），本次只对 description 增强。
- **不改 agent-core**：execute-skill.ts 的 INTENTION_TAG_WHITELIST 与 tool schema describe 不动。
- **不改检索算法**：SkillEmbeddingService、SkillMatchRequest、SkillMapper 三层管线 0 改动。

## Description Rewrite Rules

每条 description 必须包含：

- **文件类型词**（工具族限定）：Word/Excel/Markdown/txt/md/csv/xlsx/doc/docx/log/html/表格/数据/文档
- **用户常用意图词**：读取、查看、搜索、提取、生成、写入、追加、替换、筛选、排序、统计、汇总、透视、清洗、校验、转换、查找、查询、修改、更新、整理
- **互斥边界**（相近工具）：在 description 末尾用"只做 X，不做 Y/Z"格式与同类工具区分

**强制互斥文案**（Excel 工具）：

| 工具 | 必须包含的互斥文案 |
|------|---------------------|
| excel_filter | 只做行筛选，不做排序/汇总/透视 |
| excel_sort | 只调整行顺序，不做筛选/统计 |
| excel_aggregate | 普通分组汇总，不是透视表 |
| excel_pivot | 行列交叉透视，不是普通 group by 聚合 |
| excel_calculate | 新增计算列，不是统计汇总 |
| excel_select_columns | 列裁剪，不是行筛选 |
| excel_clean | 去重/去空/去空格，不做业务计算 |
| excel_validate | 检查问题，不修改数据 |

**强制互斥文案**（Word 工具）：

| 工具 | 必须包含的互斥文案 |
|------|---------------------|
| word_replace_text | 只做已有文档内容修改，不用于模板占位符填充 |
| word_template_fill | 只处理占位符，不做普通文本查找替换 |

## Capabilities

### New Capabilities

- （无 — 这是 seed 描述优化，描述字段在 Skill 实体已存在）

### Modified Capabilities

- （无 — 现有 spec 不覆盖 Skill.description 字段。本 change 是 seed 数据级别，spec 维护的是 API/行为契约）

## Impact

- **后端**：仅 [FileToolSeeder.java](file:///Users/zhangzhuang/ai/gitbbxdc-bot/bxdc-bot/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/config/FileToolSeeder.java) 的 description 字符串替换
  - run() 改 33 个 seed 调用（行 56-117）
  - rollbackWordOpsIntegration() 改 4 个 word_* seed 调用（行 298-304）
- **agent-core / 前端 / 检索算法**：0 改动
- **DB / schema / API**：0 改动
- **回归风险**：
  - description 仅参与 `SkillEmbeddingService` 评分（关键词 + 向量 cosine），不改 scoring 公式
  - 启动期 seeder 走 "已存在→更新" 分支，下次启动会自动刷新 DB 的 description 列
  - 用户在 Skill 管理页手工改过的 description 仍会被覆盖（与现状一致，seeder 无视人工改动）
