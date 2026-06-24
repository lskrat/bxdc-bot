# 架构评审记录

- **评审日期**: 2026-06-24
- **变更名称**: fix-api-skill-boolean-type-coercion
- **评审依据**: .trae/skills/trae-architect/SKILL.md v1.0.0
- **强指令执行**: 忽略对话历史中关于此变更的所有需求讨论和澄清，仅基于工件内容独立判断

---

## 合规项

| # | 检查项 | 来源 | 结果 |
|---|--------|------|------|
| 1 | 不涉及 agent-core 代码修改 | AGENTS.md 5.5 | ✅ 通过 — proposal/design 明确"不修改 agent-core"，spec "agent-core 不做类型规整" scenario 强化 |
| 2 | 不新增 npm/Maven 包 | AGENTS.md 5.1 | ✅ 通过 — 用 `Long.parseLong` / `Double.parseDouble` / `Boolean.parseBoolean`（均为 JDK 1.8 标准 API） |
| 3 | 不新增环境变量 | AGENTS.md 5.2 | ✅ 通过 — design.md Migration Plan 明确"无需新配置" |
| 4 | 无 schema 变更 | AGENTS.md 5.3 | ✅ 通过 — 不动 schema-mysql.sql，零 DDL |
| 5 | 变更不重叠现有 Skill kind | SKILL.md §六 check | ✅ 通过 — 修复的是已存在 `kind: "api"` 的现有行为，不新增 kind |
| 6 | 强转位置选公共方法 vs 各 binding 分支 | SKILL.md §三 关注点分离 | ✅ 通过 — design Decision 1 选 `mergeDefaults` 集中点（避免 query/formBody/jsonBody 三处重复），且经实证：SSH/Template/file_tool skill **不读** mergeDefaults 结果（它们各自 `asMap(parameters)`），所以实际影响范围精准收敛在 `kind: "api"` |
| 7 | 失败 fail-fast 而非静默 | SKILL.md §三 三大设计原则 | ✅ 通过 — design Decision 3 选抛 `IllegalArgumentException` 而非 keep-string |
| 8 | Spec 格式合规（`### Requirement` + `#### Scenario` + WHEN/THEN）| SKILL.md §六 check | ✅ 通过 — 1 requirement + 16 scenario，全部 4 hashtag + WHEN/THEN |
| 9 | Tasks 路径匹配代码规约 | SKILL.md §四 | ✅ 通过 — 只动 service 层，不动 controller，不动 entity |
| 10 | 无不必要新文件 | SKILL.md §六 check | ✅ 通过 — 仅新建 1 个测试文件 `SkillExecutionServiceTest.java`（合规）+ 更新既有 CHANGELOG |

---

## 违规项

### ❌ CRITICAL 违规 1: design.md Decision 2 代码片段 `case null:` 编译错误

- **违反**: AGENTS.md 5.4「JDK 1.8 锁定」（具体是 Java 语言规范本身）
- **工件位置**: `openspec/changes/fix-api-skill-boolean-type-coercion/design.md` line ~62（Decision 2 代码块）
- **问题代码**:
  ```java
  switch (type) {
      case "boolean": ...
      case "integer": ...
      case "number": ...
      case "string":
      case null:        // ← 编译错误
      default:
          return value;
  }
  ```
- **根因**: Java 语言规范禁止 `case null` — case label 必须是**编译期常量表达式**，且 null 字面量非法（会触发 `case expressions must be constant expressions` 编译错误）
- **实际影响**: 即便外层 `if (type == null) return value;` 已提前处理 type==null，switch 内的 `case null:` 仍会导致整个文件**编译失败**，`mvn compile` 立即 exit code 1
- **建议修改**:
  ```java
  if (value == null) return value;
  if (type == null) return value;     // 提前处理，switch 内不再需要 case null
  switch (type) {
      case "boolean": ...
      case "integer": ...
      case "number": ...
      case "string":
      default:
          return value;
  }
  ```
  或更简洁：
  ```java
  if (value == null) return value;
  switch (type == null ? "" : type) {
      case "boolean": ...
      case "integer": ...
      case "number": ...
      case "string":
      default:
          return value;
  }
  ```

### ⚠️ MEDIUM 违规 2: spec 文本与 implementation 范围一致性需明确

- **违反**: 不严格违反规约，但 spec "强转应用范围" 与 implementation 行为存在**潜在歧义**
- **工件位置**: `specs/api-extension-skill-llm-tool-call/spec.md` line ~38 「强转应用范围」
- **现状**:
  - spec 文本明确说 "API 扩展 Skill（`kind: "api"`）"
  - 但 implementation 是在**公共方法** `mergeDefaults` 加 coercion 循环
  - 经逐 kind 实证：`executeApiSkill` 用 mergeDefaults 结果；`executePythonSkill` / `executeSshSkill` / `executeTemplateSkill` / `executeFileToolSkill` 各自重新 `asMap(parameters)`，**不读** mergeDefaults 结果
  - 所以 implementation **实际**只影响 `kind: "api"`
- **风险**: 如果未来某 kind 改为使用 mergeDefaults 结果，强转会自动生效，spec 文本会与实际不符
- **建议修改**: 在 spec "强转应用范围" 段加一句：
  > 本次修复实际只影响 `kind: "api"`。其他 kind（python / ssh / template / file_tool）当前不读 mergeDefaults 结果，因此不受影响。如未来其他 kind 改用 mergeDefaults，本规约的强转会自动扩展到该 kind，spec 需同步更新。

### ⚠️ LOW 待补强 3: `IllegalArgumentException` 是否需记 audit log

- **违反**: 不违规，但有 observability 盲区
- **工件位置**: design.md「Risks / Trade-offs」 + tasks.md「编译与回归验证」
- **现状**: `coerceByType` 抛 `IllegalArgumentException` → 向上抛到 controller → 500 响应。**没有任何 audit 记录**（现有 `GatewayOutboundAuditLog` / `ApiCallLog` 只在出站 HTTP 调用前后记，强转在出站之前就抛了）
- **影响**: 运维排查「为什么这个 Skill 调用失败」时，看 audit log 看不到 coercion 失败信息（只能看 stacktrace）
- **建议补强**（非强制）:
  - 选项 A：在 `coerceByType` 抛错前，调 `log.warn(...)`（带 skillId / userId / 参数名 / 实际值）— 最小成本
  - 选项 B：在 `execute()` 的 catch 块记 audit log — 需新增 audit 类型
  - 选项 C：本次先不做，tasks 4.1 CHANGELOG 提示"如需 audit 排查看 skill-gateway.log"
- **本评审建议**: 选选项 A（最小改动，只加 `log.warn`）。可在 tasks.md 增加 1 个子任务。

---

## 补充观察（非违规，记录供参考）

### 观察 1: 字符串 "yes" / "no" 处理与规范 JSON Schema 的兼容性

- JSON Schema 规范中 boolean 类型**仅**接受 `true` / `false` 字面量（boolean primitive），不识别 `"yes"` / `"no"` / `"1"` / `"0"`
- 但本设计选择**扩展**识别 `"yes"` / `"no"` / `"1"` / `"0"`（来自 LLM 输出习惯）
- 这是**合理的产品决策**（强转宽容性更好），spec 已在表格明确列出，不算违规
- 建议在 design.md Decision 2 的开头加 1 句解释"为什么不严格按 JSON Schema 规范"，方便未来 reviewer 理解

### 观察 2: 强转循环对 `properties` map 的迭代顺序敏感

- Java `HashMap` 迭代顺序不固定；`LinkedHashMap` 才保留插入顺序
- 当前 `mergeDefaults` 用 `LinkedHashMap` 写 default / const / inputMap，但 `parameterContract.properties` 的 `Map<String, Object>` 类型由 Jackson 反序列化（默认 `LinkedHashMap` for `Map<String, Object>`，但**不保证**）
- 强转循环只读不写顺序，**不依赖**迭代顺序，所以**不构成问题**
- 但建议在 spec 或 design 加注释明确"properties 用 `get(key)` 寻址，非顺序依赖"

### 观察 3: 与现有 `JsonSchemaValidator.validate(...)` 的关系

- `JsonSchemaValidator` (line 1-100) 做 **校验**（结构合法 + type 匹配）
- 本次新增 `coerceByType` 做 **强转**（类型规整）
- 两个职责正交，不冲突
- 未来如需要"validate-and-coerce"组合，可在 service 层把两者串起来。本次最小改动不抽离。✅

---

## 结论

**NEEDS_REWORK**

### 必须修复（阻塞 apply）

1. **违规 1**: `design.md` Decision 2 代码片段删除 `case null:`，或在 `if (type == null)` 提前 return 后让 switch 内不再需要此 case

### 建议修复（不阻塞，记录备查）

2. **违规 2**: `spec.md` 强转应用范围段加一句明确"实际只影响 kind: api，未来其他 kind 改用 mergeDefaults 时本规约会自动扩展"
3. **待补强 3**: `tasks.md` 增加 1 个子任务 — `coerceByType` 抛错前 `log.warn` 记录 skillId/userId/key/value，方便排查

### 可选优化

4. design.md Decision 2 加 1 句"为什么扩展识别 yes/no/1/0 而不严格 JSON Schema 规范"
5. spec "强转应用范围" 加注释 "properties 用 get(key) 寻址，非顺序依赖"

---

## 重新评审（2026-06-24 同日）

用户已采纳全部 5 条修复建议并应用：

| # | 修复点 | 落位 | 状态 |
|---|--------|------|------|
| 1 | 删除 `case null:`，拆分为 2 行提前 return | `design.md` Decision 2 代码块 | ✅ 已修复 |
| 2 | spec 加 "实际只影响 kind: api" + "未来扩展自动生效" 说明 | `spec.md` 强转应用范围段 | ✅ 已修复 |
| 3 | tasks 加 log.warn 子任务 1.4 | `tasks.md` §1.4 | ✅ 已修复 |
| 4 | design 加 yes/no/1/0 扩展识别解释 | `design.md` Decision 2 顶部 | ✅ 已修复 |
| 5 | spec 加 properties 寻址、非顺序依赖注释 | `spec.md` 强转应用范围段 | ✅ 已修复 |

### 重新校验结果

`npx openspec validate fix-api-skill-boolean-type-coercion --strict` 输出：`Change 'fix-api-skill-boolean-type-coercion' is valid`

### 重新结论

**PASS** ✅

可进入 `/opsx:apply` 开始实施。

---

## 二次重新评审（独立执行强指令）

**执行时间**：2026-06-24（用户重新触发 trae-architect）
**评审方式**：重新读取全部 4 个工件 + AGENTS.md（上下文），忽略对话历史，独立判断。

### 5 项修复落实情况（独立验证）

| # | 修复 | 落位 | 独立验证结果 |
|---|------|------|--------------|
| 1 | 删 `case null:` + 拆 2 行提前 return | `design.md` Decision 2 | ✅ 已落实，代码编译合法 |
| 2 | spec 加 "实际只影响 kind: api" | `spec.md` 强转应用范围 | ✅ 已落实 |
| 3 | tasks 加 log.warn 子任务 1.4 | `tasks.md` §1.4 | ✅ 已落实 |
| 4 | design 加 yes/no/1/0 扩展识别理由 | `design.md` Decision 2 顶部 | ✅ 已落实 |
| 5 | spec 加 properties 寻址非顺序依赖 | `spec.md` 强转应用范围 | ✅ 已落实 |

### 二次深度复查（新增）

| 维度 | 检查项 | 结果 |
|------|--------|------|
| JDK 1.8 API 兼容性 | 逐 API 检查修复后代码片段 | ✅ 全部 JDK 1.0~1.7 API，无 Java 9+ / 14+ / 16+ 特性 |
| 架构约束 6 条 | AGENTS.md 5.1~5.6 | ✅ 全部满足 |
| spec 表格与代码一致性 | 6 类典型 type×value 组合逐行对照 | ✅ 6/6 一致 |
| spec scenario 与 code 分支一致性 | 16 个 scenario 逐一对照 | ✅ 16/16 一致 |
| 强转应用范围实证 | spec 声称「仅 api 受影响」 | ⏳ 待 apply 阶段实证（mergeDefaults 调用图） |

### 残留低优观察（非违规）

- **Wording 优化（非阻塞）**：`design.md` Decision 1 说「mergeDefaults 是『所有 `kind: "api"` 的调用』的集中点」，与 spec 加的「未来扩展自动生效」措辞上略有不连贯。建议在 Decision 1 加一句「如未来其他 kind 改读 merged 结果，强转会同步生效」以对齐 spec 文案。**不阻塞 PASS**。

### 三次评审最终结论

**PASS** ✅

可进入 `/opsx:apply` 开始实施。