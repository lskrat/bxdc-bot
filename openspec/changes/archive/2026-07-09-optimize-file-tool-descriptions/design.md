## Context

[FileToolSeeder.java](file:///Users/zhangzhuang/ai/gitbbxdc-bot/bxdc-bot/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/config/FileToolSeeder.java) 启动时把 37 个系统文件工具的 description 写入 `skills.description` 列，作为：

1. **LLM tool schema `description` 字段** —— [SkillService.getSkillById](file:///Users/zhangzhuang/ai/gitbbxdc-bot/bxdc-bot/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/service/SkillService.java) / agent-core 透传
2. **向量检索语料** —— SkillEmbeddingService 把 description 编入 [SkillVector.text](file:///Users/zhangzhuang/ai/gitbbxdc-bot/bxdc-bot/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/service/SkillEmbeddingService.java) 用于 cosine
3. **embedding 失败后的关键词兜底** —— [SkillEmbeddingService.match](file:///Users/zhangzhuang/ai/gitbbxdc-bot/bxdc-bot/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/service/SkillEmbeddingService.java) 走 `keywordScore × searchWeight` 路径

当前 description 偏"功能描述式"，缺少用户常用意图词与工具间互斥边界。LLM 在 top-K 里挑错工具、embedding 挂掉时关键词兜不住，是两个具体痛点。

## Goals / Non-Goals

**Goals:**
- 37 个工具的 description 提升"被 LLM 正确识别"和"被关键词兜底命中"两个维度的召回率
- 不引入新依赖、不改 schema、不改 API 行为
- 不改 skills.name、TOOL_TAGS、schema_properties、configuration

**Non-Goals:**
- 不重构 FileToolSeeder 的整体结构
- 不优化 SkillEmbeddingService 的算法
- 不做真实 skills.name 重命名（alias/displayName 机制属于另一项架构改动）
- 不修正文档与代码的 23/15 标签差异（按用户要求，operation_intent/file_type/business_scenario 完全不动）

## Decisions

### Decision 1: 仅改 description，不动其他任何字段

description 是 FileToolSeeder 里**唯一对 LLM 行为有显著影响**且**改起来零风险**的字段。其他字段（name/schema/configuration/TOOL_TAGS）改了会破坏执行链路或检索逻辑。

- `name` → 影响 `configuration.toolName` 匹配、基础工具（file_list/file_read/file_write）加载、子 Agent tool schema
- `schema_properties` → 影响 LLM 看到的入参 schema
- `TOOL_TAGS` → 影响 SQL 硬筛（虽然当前 SQL IN 在多值场景漏匹配，但本次不修，保留 ba0b967 状态）
- `configuration` → 影响 gateway 执行路由

**改 description 不动其他字段** = 最小爆炸半径。

### Decision 2: 3 段式模板（功能说明 / 触发关键词 / 注意事项）

单一权威源是 [tasks.md](file:///Users/zhangzhuang/ai/gitbbxdc-bot/bxdc-bot/openspec/changes/optimize-file-tool-descriptions/tasks.md) 的 37 条 description。每条按以下结构：

```
功能说明：{粒度细节 + 场景}
触发关键词：{kw1}、{kw2}、{kw3}、{kw4}、{kw5}、{kw6}
注意事项：{互斥边界 + 互引工具}
```

**为什么用 3 段**：
- **功能说明**：落到具体粒度（"前后几行" / "二维交叉" / "比较运算符"），让向量空间有清晰锚点
- **触发关键词**：用户口语化说法直接列在 description 里，关键词兜底时直接命中
- **注意事项**：互斥文案独立成段，降低 LLM 忽略概率

**为什么用 `\n` 分隔**：
- BGE 编码将 `\n` 视为 whitespace，不影响 embedding 质量
- Java 源码单行可读，渲染后三段清晰
- 未来按段切片做日志分析时方便

### Decision 3: 强制互斥文案（不靠 LLM 自觉）

相近工具（excel_filter / excel_sort / excel_aggregate）description 主题词高度重叠（"Excel"、"数据"），不写互斥文案 LLM 会混淆。**强制每条 description 在"注意事项"段包含"X 不是 Y（用 Z）"**，与同类工具显式划清边界。

**Alternatives considered**:
- 靠 TOOL_TAGS 的 file_type 区分 → 当前 15 标签 file_type 只到"Excel"粒度，无法区分 aggregate vs pivot
- 靠 schema_properties 区分 → LLM 看到 schema 已晚，description 是第一筛选层
- 改 retrieval 算法 → 超出本次 scope

### Decision 4: 不动 execute-skill.ts 与 agent-core prompt

description 改了立即生效（seeder 启动期重写 DB），agent-core 不需要任何改动：

- agent-core 不缓存 description，每次 tool call 现查现透
- 标签白名单在 execute-skill.ts 里有镜像，但 description 改动不影响白名单
- INTENTION_TAG_WHITELIST 走的是 `args.tags`，与 description 解耦

### Decision 5: BGE 长度上限 100 中文字（远超 512 token 硬上限）

`BAAI/bge-large-zh-v1.5` max seq 512 tokens，中文 ~1.5 token/字 → 硬上限 ~340 中文字。

本次实测 37 条 description 中文字数 32-91，平均 47，远低于硬上限。**不写长 description** 的原因：
- 描述越长，向量空间越容易"稀释"（与同类工具的主题相似度升高）
- 关键词兜底评分按词频计算，长 description 把低频词稀释，主关键词权重下降
- LLM 看到长 description 容易跳过关键信息（"lost in the middle" 现象）

## Risks / Trade-offs

- **[Risk] description 改长 → embedding chunk 噪音增加** — 控制在 91 中文字以内
- **[Risk] 用户在 Admin 手工改过 description 会被 seeder 覆盖** — 与现状一致（seeder 启动时无条件 update），本次不修
- **[Risk] 互斥文案误导 LLM** — 用"X 不是 Y（用 Z）"否定+互引句式，依赖 LLM 理解"不做 Y"。LLM 对否定理解在多数模型上 OK
- **[Trade-off] 不改 skills.name** — 接受 skills.name 仍是无意义短串（如 `excel_aggregate`），改 name 会破坏工具加载链
- **[Trade-off] 不改 SQL 硬筛匹配** — TOOL_TAGS 多值场景 SQL IN 仍漏匹配，但 description 改好可让向量/关键词兜住大部分 case

## Migration Plan

无 migration、无 schema 变更、无新配置。

部署：
1. 合并 PR（只动 OpenSpec 工件 + FileToolSeeder.java 的 37 个字符串字面量）
2. 重启 skill-gateway（seeder 自动重写 skills.description）
3. 跑 8 条 plan query 验 top-1 命中

回滚：`git revert` 单 commit 即可，seeder 启动会用旧 description 覆盖回滚后的值。
