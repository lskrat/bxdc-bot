## Why

API 扩展 Skill 在执行时，`parameterContract` 里声明了 `type: "boolean"` 的字段，LLM 实际透传到 gateway 的入参却经常以**字符串**形式到达（`"true"` / `"True"` / `"TRUE"` / `"false"` / `"False"` / `"FALSE"` 等各种大小写），导致下游接口拿到的不是真正的 boolean。

根因：`SkillExecutionService.mergeDefaults()` 只用 `parameterContract` 里的 `default` / `const` 做兜底，**不会按 `properties[*].type` 把入参做强转**。后续：
- JSON body 直接把字符串塞进 body map → JSON 里就是 `"flag":"true"`（下游期望 `true`）
- form body 经 `encodeFormBody` 用 `String.valueOf(value)` 序列化 → 一定是字符串
- query 经 `buildUrlWithQuery` 用 `URLEncoder.encode(String.valueOf(value))` → 一定是字符串

下游接口经常 400 / 解析失败 / 行为错乱（例如「启用」开关不生效，调用方以为是 LLM 漏传参数，触发后续重试风暴）。

## What Changes

- **`SkillExecutionService.mergeDefaults()`** 在合并完 `default` / `const` 后，**遍历 `parameterContract.properties[*].type`**，对每个声明了类型的 key 做一次**容错强转**：
  - `boolean`：识别字符串 `"true"` / `"True"` / `"TRUE"` / `"yes"` / `"1"` → `true`；`"false"` / `"False"` / `"FALSE"` / `"no"` / `"0"` / 空串 → `false`；其他值抛 `IllegalArgumentException`（明确报错，避免悄悄丢字段）
  - `integer`：字符串 → `Long`（trim 后 parseLong，失败抛错）
  - `number`：字符串 → `Double`（trim 后 parseDouble，失败抛错）
  - `string`：原样保留（无需处理）
  - 已是对应类型（Boolean/Long/Integer/Double）：原样保留
  - `null` 值：保留 `null`（不抛错，让下游按 nullable 处理）
- 强转应用在 `default` / `const` 写出来的值**和**用户传入的值之上，保证二者都符合契约。
- **不**修改 agent-core（遵循 AGENTS.md 5.5）：agent-core 只把 LLM 透传的原始 args 交给 gateway，**类型规整由 gateway 侧负责**。
- **不**新增第三方包：`Boolean.parseBoolean` / `Long.parseLong` / `Double.parseDouble` 均为 JDK 1.8 标准 API。
- **不**新增环境变量配置。
- **不**改 schema-mysql.sql（这是行为修复，不是 schema 变更）。
- **BREAKING**：无（这是 bug 修复，对下游一直按 boolean 用的调用方完全等价；对之前「凑合也能跑」的调用方，下游期望 boolean 时终于会收到 boolean）。

## Capabilities

### New Capabilities
（无 — bug 修复，不新增 capability）

### Modified Capabilities
- `api-extension-skill-llm-tool-call`: 增加一条 requirement —— 「按 `parameterContract` 的 type 字段对入参做强转」，覆盖 boolean / integer / number 三类常见 LLM 字符串化场景

## Impact

- **Gateway**：
  - `backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/service/SkillExecutionService.java`
    - `mergeDefaults()` 新增「按 contract.properties[*].type 强转」步骤（在 `default`/`const` 写完后、`merged.putAll(inputMap)` 之前，对 merged 整体跑一遍 coercion）
    - 新增私有方法 `coerceByType(String key, Object value, String type)` 返回强转后的 Object
  - **回归覆盖**：所有走 API Skill（`kind: "api"`）的下游 — query / jsonBody / formBody 三种 binding 都受益
  - **Python Skill（`kind: "python"`）**：当前用 `jsonSchemaValidator.validate(...)` 校验 + 提取 orderedArgs 后整体塞给 sandbox；不在本次修改范围（沙箱协议契约不在 LLM 透传面）。后续如发现 Python Skill 也踩同类问题，按相同模式 follow-up。
- **agent-core**：无改动（继续透传 LLM 原始 args）
- **Frontend**：无改动
- **测试**：
  - 给 `mergeDefaults` 补单测覆盖：
    - boolean 入参字符串 "true" / "True" / "TRUE" / "yes" / "1" / "false" / "False" → 对应 Boolean
    - boolean 入参非法字符串 "abc" → 抛 IllegalArgumentException
    - integer 字符串 "42" → Long 42
    - integer 字符串 "abc" → 抛 IllegalArgumentException
    - 已有 boolean 类型入参 → 原样保留
    - null → 原样保留 null
    - 无 contract 时 → 行为不变（仅做 default/const 兜底）
  - 编译验证：`cd backend/skill-gateway && ./apache-maven-3.8.5/bin/mvn -s ./settings.xml compile` 通过
- **回归风险**：
  - 强转抛错会让原本「字符串也能蒙混过去」的接口立刻 400。需要在 changelog 标注「如果你的下游接口意外接受了字符串 boolean，强转后会报错，请主动把契约改成 `type: "string"`」
  - Skill 编辑页（前端）展示的 schema 不变 — 契约已经在编辑器里写了 `type: "boolean"`，修复只是「按契约执行」