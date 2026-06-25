## Context

API 扩展 Skill（`kind: "api"`）在 gateway 侧的入口是 `SkillExecutionService.execute(...)` → `executeApiSkill(config, parameters)`。`parameters` 是 LLM 透传的入参（来自 agent-core 的 tool-call args），在传入 gateway 时已经经过 Zod schema 校验（结构合法，但**值的类型可能不符合契约**，因为 Zod 经常把 LLM 输出的 boolean 值序列化成字符串，或 LLM 直接把 boolean 写成字符串）。

`mergeDefaults(parameters, config)` 当前的实现（`SkillExecutionService.java` line 168-195）只做两件事：
1. 遍历 `parameterContract.properties`，把每个 key 的 `default` 或 `const` 写进 merged map
2. 用 `merged.putAll(inputMap)` 让用户传入的值覆盖 default

**没有**任何「按 type 强转」的步骤。下游 `executeApiSkill` 把 merged map 透传到：
- query：`buildUrlWithQuery` → `URLEncoder.encode(String.valueOf(value))` → 永远是字符串
- form body：`encodeFormBody` → `String.valueOf(value)` → 永远是字符串
- json body：直接塞进 `Map<String, Object>` 交给 Jackson → JSON 里是字符串 `"true"`

下游接口按契约期望 boolean 时，会拿到字符串、解析失败 / 行为错乱。

## Goals / Non-Goals

**Goals:**
- 在 `mergeDefaults` 末尾按 `parameterContract.properties[*].type` 对 merged map 做一次类型强转
- 覆盖 `boolean` / `integer` / `number` 三类 LLM 容易把字符串化的类型
- 强转失败抛 `IllegalArgumentException`（fail-fast，避免悄悄丢字段）
- 不新增第三方包，不新增 env 配置，不改 schema-mysql.sql
- 不修改 agent-core

**Non-Goals:**
- 不做整型范围校验（不查 `minimum` / `maximum`，按需后续 PR 扩展）
- 不做 enum 校验（即便 contract 写了 `enum: ["a","b"]`，本次不强转）
- 不做 array / object 嵌套强转（嵌套对象交给下游接口按自己 schema 解析）
- 不修改 Python Skill（`kind: "python"`）的入参处理（沙箱侧契约不在本次范围）
- 不重写 `executeApiSkill` 整体结构，只动 `mergeDefaults`

## Decisions

### Decision 1: 强转位置 = `mergeDefaults` 内（line 195 `return merged` 之前）

**理由**：
- `mergeDefaults` 是「contract 与 LLM 入参对齐」的唯一集中点。所有 `kind: "api"` 的调用都会过这里
- 在这里强转后，下游 `executeApiSkill` 的 query / form / json 三个分支**无需各自重复**做类型处理
- 顺带把 `default` / `const` 写出的字符串值（如用户在编辑器里写了 `default: "true"` 而不是 `default: true`）也规整掉，避免 default 自己就是字符串

**Alternatives considered:**
- 放在 `executeApiSkill` 内每个 binding 分支独立强转 → 重复 3 份代码，且 `default` 兜底的值不进 executeApiSkill，会漏
- 放在 agent-core 透传之前 → 违反 AGENTS.md 5.5（不改 agent-core），且会让 agent-core 承担「按 gateway 侧契约规整类型」的职责，跨层耦合

### Decision 2: 强转 API 设计 = `coerceByType(String key, Object value, String type) → Object`

**为什么扩展识别 `"yes" / "no" / "1" / "0"`，而不严格遵守 JSON Schema 规范（只识别 `true` / `false`）**：
- JSON Schema 规范中 boolean 类型只接受 `true` / `false` 字面量，但 LLM 实际透传的 boolean 字符串化形态有 4 类常见变体：
  1. JSON 原生字面量：`"true"` / `"false"`（多数场景）
  2. 大小写变体：`"True"` / `"False"` / `"TRUE"` / `"FALSE"`（LLM 训练语料 + 大写语气词风格）
  3. 自然语言：`"yes"` / `"no"`（LLM 把"启用/禁用"翻译成更可读的英文）
  4. 数字 0/1：`"1"` / `"0"`（程序员化 / 来自 form-urlencoded 习惯）
- 严格 JSON Schema 只识别第 1 类，**会让本次修复目标（"偶尔传成字符串"）的实际命中率不到 50%**，剩下 50% 的字符串化形态仍然踩 bug
- 选扩展识别是为了**修最多场景**，且 4 类都是"用户/接口都明确知道是 boolean"的无歧义形态，不存在被误识别的风险
- 如果未来需要严格 JSON Schema 兼容性，可在 `parameterContract.properties[*].coerceMode` 加 `"strict"` 选项；本次不做

```java
private Object coerceByType(String key, Object value, String type) {
    if (value == null) return value;
    if (type == null) return value;
    switch (type) {
        case "boolean":
            if (value instanceof Boolean) return value;
            if (value instanceof String) {
                String s = ((String) value).trim();
                if (s.isEmpty() || "false".equalsIgnoreCase(s) || "0".equals(s) || "no".equalsIgnoreCase(s)) return Boolean.FALSE;
                if ("true".equalsIgnoreCase(s) || "1".equals(s) || "yes".equalsIgnoreCase(s)) return Boolean.TRUE;
                throw new IllegalArgumentException(
                    "Skill parameter '" + key + "' declared as boolean but got non-boolean string: '" + value + "'");
            }
            throw new IllegalArgumentException(
                "Skill parameter '" + key + "' declared as boolean but got: " + value.getClass().getSimpleName());
        case "integer":
            if (value instanceof Integer || value instanceof Long) return value;
            if (value instanceof String) {
                try { return Long.parseLong(((String) value).trim()); }
                catch (NumberFormatException e) {
                    throw new IllegalArgumentException(
                        "Skill parameter '" + key + "' declared as integer but got non-numeric string: '" + value + "'", e);
                }
            }
            if (value instanceof Number) return ((Number) value).longValue();
            throw new IllegalArgumentException(
                "Skill parameter '" + key + "' declared as integer but got: " + value.getClass().getSimpleName());
        case "number":
            if (value instanceof Double || value instanceof Float) return value;
            if (value instanceof String) {
                try { return Double.parseDouble(((String) value).trim()); }
                catch (NumberFormatException e) {
                    throw new IllegalArgumentException(
                        "Skill parameter '" + key + "' declared as number but got non-numeric string: '" + value + "'", e);
                }
            }
            if (value instanceof Number) return ((Number) value).doubleValue();
            throw new IllegalArgumentException(
                "Skill parameter '" + key + "' declared as number but got: " + value.getClass().getSimpleName());
        case "string":
        default:
            return value;
    }
}
```

**注意**：原 `if (value == null || type == null) return value;` 单行写法虽然语义正确，但进入 switch 后 `case null:` 是 Java 编译错误（case label 必须是编译期常量，null 字面量非法）。已拆为 2 行提前 return 让代码可编译。

**调用位置**：在 `mergeDefaults` 的 `merged.putAll(inputMap)` 之后、`return merged` 之前，对 merged 做一次遍历：

```java
for (Map.Entry<String, Object> entry : properties.entrySet()) {
    String key = entry.getKey();
    Map<String, Object> propDef = (Map<String, Object>) entry.getValue();
    if (propDef != null && merged.containsKey(key)) {
        String declaredType = (String) propDef.get("type");
        merged.put(key, coerceByType(key, merged.get(key), declaredType));
    }
}
```

### Decision 3: 强转失败抛 `IllegalArgumentException` 而不是静默 keep-string

**理由**：
- 「字符串假装 boolean 能跑通」本身就是 bug，下游一直按契约期望 boolean，行为不可预期
- 静默 keep-string 会让 bug 永远藏在「不知道为什么接口有时候报错有时候正常」的现象里
- fail-fast 让 LLM 收到明确的错误信息，下次 tool-call 会传对类型（或人类在编辑 Skill 时把契约改成 `type: "string"`）

**Alternatives considered:**
- 静默 keep-string + log warning → 治标不治本，bug 隐藏
- 强转失败回退到「按 string 走」并标 audit log → 跟现在一样下游还是收字符串，等于啥都没改

### Decision 4: 不做整型范围 / enum / format 校验

**理由**：
- 当前 `JsonSchemaValidator`（line 1-100）也只做 required + type，不做 minimum/enum/format/pattern
- 强转范围扩展是另一个 PR 的事，本次只解决「类型根本不对」这个最常见、影响最大的问题
- 严格遵循 AGENTS.md 5.4（最小改动原则）

### Decision 5: 不修改 Python Skill（`kind: "python"`）

**理由**：
- Python Skill 当前走 `jsonSchemaValidator.validate(...)` 校验后，按 `properties.keySet()` 顺序从 LLM payload 提取 `orderedArgs` → 整体作为 `script_args` 数组传给 sandbox
- sandbox 侧的契约是 sandbox 自己声明的 `service_params` JSON Schema，LLM 入参规整在 gateway 这一层**不应该**做（sandbox 自己应该处理）
- 如发现 Python Skill 也踩同类问题，单独 follow-up

## Risks / Trade-offs

- **[Risk] 强转抛错会让原本「字符串也能蒙混过去」的接口立刻 400** → 缓解：在 CHANGELOG 标注「如果下游意外接受字符串 boolean，请主动把契约改成 `type: "string"`」。这是用户主动权。
- **[Risk] 用户在编辑 Skill 时把 contract 写错 `type`（如本意是字符串但手滑写了 boolean）** → 缓解：现有 spec 已要求契约要写在 parameterContract，强转只是按契约执行，编辑错的契约本来就该被检查出来。
- **[Risk] LLM 传 null 给 boolean 字段** → 缓解：当前设计 null 原样保留，下游按 nullable 处理。如果用户想强制 required，在 contract 的 `required: [...]` 里写（这条已经是 `JsonSchemaValidator` 的能力）。
- **[Risk] 单测覆盖不全漏掉 case** → 缓解：补 6+ 个单测（boolean 三态 + integer + number + null + 不存在 key），见 tasks.md。
- **[Trade-off] 不做 array / object 嵌套强转** → 接受：嵌套类型契约复杂度高，且本次 bug report 只涉及 boolean 顶层字段；嵌套需求后续 PR 处理。

## Migration Plan

无需数据 migration、无需 schema 变更、无需新配置。

**部署步骤**：
1. 修改 `SkillExecutionService.java`
2. 跑 `cd backend/skill-gateway && ./apache-maven-3.8.5/bin/mvn -s ./settings.xml compile` 验证编译
3. 跑 `./apache-maven-3.8.5/bin/mvn -s ./settings.xml test -Dtest=SkillExecutionServiceTest` 验证单测
4. 重启 skill-gateway（自动重编译）
5. agent-core / frontend 无需重启（无改动）

**回滚策略**：`git revert` 单 commit 即可，恢复到「字符串保持字符串」的行为。

**运维通知**：CHANGELOG 标注本次变更 + 「如果下游意外接受字符串 boolean 请改契约为 string」的兼容性提示。

## Open Questions

（无 — 设计已收敛）