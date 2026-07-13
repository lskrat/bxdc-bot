## 1. 数据层：skills 表 3 列 schema + 迁移

- [x] 1.1 修改 `backend/skill-gateway/src/main/resources/schema-mysql.sql` 的 `CREATE TABLE skills`，加 3 列 `file_type VARCHAR(32) NULL`、`operation_intent VARCHAR(32) NULL`、`business_scenario VARCHAR(32) NULL`，带 `COMMENT` 说明字段用途
- [x] 1.2 修改 `backend/skill-gateway/src/main/java/.../entity/Skill.java`，加 3 个 `@TableField` + getter/setter（沿用 e2ac8ce 的 searchWeight 写法）
- [x] 1.3 修改 `backend/skill-gateway/src/main/java/.../config/SchemaMigrationRunner.java` 的 `migrateSkills()`，加 3 条 `ensureColumn` 幂等 ALTER（`ALTER TABLE skills ADD COLUMN xxx VARCHAR(32) NULL`）
- [x] 1.4 自查 AGENTS.md §5.3 checklist：实体 ✓ | schema-mysql.sql ✓ | SchemaMigrationRunner.migrateXxx() ✓ | migrateSkills 列覆盖完整 ✓

## 2. 数据层：FileToolSeeder 标签种子

- [x] 2.1 在 `FileToolSeeder` 顶部加 `private static final Map<String, ToolTag> TOOL_TAGS` 静态映射，覆盖现有 37 个 file_/word_/txt_/md_/excel_ 工具
- [x] 2.2 把 `run()` 里现有 `registerTool(...)` 改成调用新的 `seedSkill(name, type, description, configuration, executionMode, requiresConfirmation, searchWeight, fileType, operationIntent, businessScenario)`，37 处全量补 tag
- [x] 2.3 在 `seedSkill` 内部实现"现有行更新 / 新行插入"二选一：先按 `name` 查现有行；若存在 → UPDATE 全部字段（含 3 个 tag）；若不存在 → INSERT
- [x] 2.4 验证 e2ac8ce 的 `registerTool` 已被 seedSkill 完全吸收（不再调旧 registerTool）
- [x] 2.5 自查：FileToolSeeder.TOOL_TAGS 是唯一的标签权威源（Java 端），注释里加 "DON'T REMOVE OR MODIFY WITHOUT SYNCING agent-core prompts INTENT_RECOGNITION_SYSTEM_PROMPT"

## 3. 数据层：SkillMatchRequest + SkillMatchResponse 字段扩展

- [x] 3.1 `SkillMatchRequest.java` 加 `private List<String> tags` + `getTags()` 返回 null-safe + `setTags()`
- [x] 3.2 `SkillMatchResponse.java` 维持原样（不加新字段，向后兼容）
- [x] 3.3 `SkillController.matchSkills` 用 `request.getTags()` 透传给 service（不修改 controller 主体逻辑）

## 4. 数据层：SkillMapper SQL 硬筛

- [x] 4.1 `SkillMapper.java` 加方法 `List<Long> findIdsByTags(@Param("tags") List<String> tags, @Param("ownerType") int ownerType)`（`@Select` 注解 + 三列 OR IN 查询）
- [x] 4.2 XML 文件或 `@Select` 内部 SQL：
  ```sql
  SELECT DISTINCT id FROM skills
  WHERE skill_owner_type = #{ownerType}
    AND enabled = 1
    AND (search_weight IS NULL OR search_weight > 0)
    AND (
          file_type IN (<foreach collection="tags" item="t" open="(" separator="," close=")">#{t}</foreach>)
       OR operation_intent IN (...)
       OR business_scenario IN (...)
    )
  ```
- [x] 4.3 当 `tags` 为 null 或 empty 时 caller 不调用本方法（避免 `IN ()` 语法错误）

## 5. 业务逻辑：SkillEmbeddingService 三阶段流水线

- [x] 5.1 在 `SkillEmbeddingService` 加 `MIN_CANDIDATE_SIZE = 5` 常量
- [x] 5.2 新增重载 `public List<MatchResult> match(String query, List<String> tags, int limit)`：
  - 阶段 1：`tags != null && !tags.isEmpty()` 时调 `skillMapper.findIdsByTags(tags, 2)`；结果放入 `Set<Long> candidates`
  - 安全阀：`candidates.size() < MIN_CANDIDATE_SIZE` → `log.warn(...)` 并 `candidates = null`
  - 阶段 2：循环 `index.values()` 打分（沿用 e2ac8ce 的 cosine + keyword hybrid）
  - **新增**：`candidates != null` 时过滤 `candidates.contains(sv.skillId)`，不在候选内即 skip
  - 阶段 3：top-K 逻辑沿用
- [x] 5.3 保留旧 `match(query, int limit)` 重载，内部转发到 `match(query, null, limit)`（兼容旧调用）
- [x] 5.4 `min_similarity` 阈值与当前 e2ac8ce 一致（0.25）

## 6. agent-core：tags 获取（路径 B：主 LLM 自报）

- [x] 6.1 `backend/agent-core/src/tools/execute-skill.ts` tool schema 加可选字段 `tags: z.array(z.string()).max(3).optional()`，describe 含 23 标签白名单 + 例子 + "不确定可省略"
- [x] 6.2 `execute-skill.ts` tool 实现：
  - 读 `args.tags`，若 undefined → tags=null
  - 去重、截断到 3、白名单校验（`INTENT_TAG_WHITELIST` 集合来自 FileToolSeeder.TOOL_TAGS 镜像字符串）
  - 过滤后为空 → tags=null
- [x] 6.3 主 LLM 自报通路验证：删除早期路径 A 的 `extractTagsFromUserInput` + 独立 ChatOpenAI + Promise.race 超时逻辑；删除 `prompts/{zh,en}.ts` 的 `INTENT_RECOGNITION_SYSTEM_PROMPT` + `prompts/{types,index}.ts` 的 dispatch 与缓存
- [x] 6.4 强化引导：`prompts/zh.ts` 的 `skillDiscoveryPolicy` 段加【意图标签 tags（强烈推荐）】小节，列出 23 标签 + 例子 + 省略指引；`en.ts` 同步加【Intent tags (strongly recommended)】小节
- [x] 6.5 23 标签镜像字符串：源码顶端加 `// MIRROR FileToolSeeder.TOOL_TAGS，见 backend/skill-gateway/.../config/FileToolSeeder.java §7` 注释
- [x] 6.6 诊断 log：在 `_call` 内加 `[TagsFromLLM] raw=...` 三分支（whitelist passed / all out / did NOT pass），便于排查主 LLM 输出
- [x] 6.7 `autoSearchSkills(query, tags, gatewayUrl, apiToken)` 签名扩展：tags 为 null/empty 时不写 `tags` 字段透传给业务 match；utility fetch 永远不带 tags

## 7. 业务串联：execute-skill.ts 入口串联

- [x] 7.1 把 e2ac8ce 现有 `autoSearchSkills(query, gatewayUrl, apiToken)` 调用改成 `autoSearchSkills(query, tags, gatewayUrl, apiToken)`
- [x] 7.2 提取 `tags` 的位置必须在 `func` 入口、其它 early-return 之前；保留 `NO_MATCH` 等早期返回路径
- [x] 7.3 `continueConversation` 命中 cache 分支不变（cached agent 直接用，跳过 match → 浪费一次 LLM 调用，**可接受**已在 design R4 列示）

## 8. 构建验证（依赖顺序：必须按 1→2→3→4→5→6→7）

- [x] 8.1 `cd backend/skill-gateway && mvn -s ./settings.xml -o compile` BUILD SUCCESS（exit 0，210 源文件全部编译）
- [x] 8.2 `cd backend/agent-core && npm run build` 无 type 错误（exit 0）
- [x] 8.3 同时启动 3 个服务（MySQL + gateway + agent-core + frontend），启动期间无 `Unknown column` 错误
- [x] 8.4 schema 验证：MySQL 客户端 `DESCRIBE skills` 输出包含 file_type / operation_intent / business_scenario 三列

## 8.5 实施期间附带修复（不属于原始 spec，记录用）

实施期间发现并修复了若干与本 change 强相关、但 spec 层面没穷举的环境问题：

- [x] **A. `application.properties` 缺 embedding 配置**：原 e2ac8ce 部署该文件少了 3 行 `app.embedding.{api-base,api-key,model}`，导致 `loadIndex` 时 `Successfully loaded 0/37 skill embeddings`，整个 match 永远空。修复：从 `application-prod.example.properties` 同步 3 行 → 37/37 加载
- [x] **B. SQL 硬筛 INFO log**：原始 `log.debug` 被 Spring Boot INFO 级过滤掉，加入 `[SkillEmbedding]` 日志查不到。修复：行 266 改为 `log.info`，所有 SQL 硬筛结果在 INFO 级可观测
- [x] **C. `SkillEmbeddingService.match` 末尾 score>0 过滤**：SQL 硬筛候选中可能存在 hybridScore=0（BGE 给 0 × searchWeight=1 = 0）的"死阳性"，会让前端展示 `score=0.00` 噪声。修复：取 top-K 前过滤 `r.score > 0.0`，对应 INFO log 加 `after score>0 filter A=>B` 信息
- [x] **D. 删 SkillController 临时 `System.out.println` DIAG**：诊断完成后清理，避免污染 stdout
- [x] **E. utility cache 锁死 bug 修复**：原 `if (cachedUtilitySkills)` 改为 `if (cachedUtilitySkills !== null)`，防止首次拿到 [] 后死锁（实际未在生产触发，记录备查）

## 9. 数据库回填验证

- [ ] 9.1 重启 gateway 后 `FileToolSeeder` 日志输出 `Upserted 37 tool tags`
- [ ] 9.2 DB 抽查：`SELECT name, file_type, operation_intent, business_scenario FROM skills WHERE skill_owner_type=2` 返回 37 行非 NULL
- [ ] 9.3 抽 5 行与本次需求图示表格一字不差：
  - file_list → 通用/展示/文件管理
  - file_write → 通用/写入/生成导出
  - word_extract_content → Word/提取/提取解析
  - md_filter_section → Markdown/修改/编辑整理
  - excel_aggregate → Excel/分析/计算分析

## 10. API 行为 e2e 验证

- [ ] 10.1 无 tags 调用（agent-core e2ac8ce 旧版本行为）：`curl -X POST http://localhost:18080/api/skills/match -d '{"query":"Excel","limit":5}' -H "X-API-Key: ..." -H "Content-Type: application/json"` 返回包含 file_* / excel_* / ... 的 top-K，行为与 e2ac8ce 完全一致
- [ ] 10.2 带 tags 调用（agent-core 新版本）：`curl -X POST .../api/skills/match -d '{"query":"末尾追加","tags":["写入"],"limit":5}' ...` 返回 file_write 排名靠前
- [ ] 10.3 带标签但 SQL 筛选过窄：`tags: ["区块链"]`（不在 23 白名单）→ 候选 = 0 → 走全量向量 → 不报错
- [ ] 10.4 前端真实场景：在前端发 "在文件末尾追加一行：xxx" 应当不报 NO_MATCH；agent-core log 显示识别到 `["写入"]` 或 `["修改"]`；gateway log 显示 SQL 硬筛 + top-K 完整流水线

## 11. PR 合并前最终确认

- [ ] 11.1 所有 checkbox 已勾选（除 11.2 自身）
- [x] 11.2 跑 `openspec validate add-skill-tags-and-intent-filtering --strict` 输出 PASS
- [ ] 11.3 提交 PR 时引用本 change，并在描述里贴上 `proposal.md` 的 "Why" 段落作为动机说明
- [x] 11.4 PR review check item：FileToolSeeder.TOOL_TAGS 与 agent-core 中 23 标签白名单镜像一致（现在镜像位置：execute-skill.ts 的 INTENT_TAG_WHITELIST 集合 + tool schema describe + system prompt 强化段——三处都必须与 TOOL_TAGS 一致）
