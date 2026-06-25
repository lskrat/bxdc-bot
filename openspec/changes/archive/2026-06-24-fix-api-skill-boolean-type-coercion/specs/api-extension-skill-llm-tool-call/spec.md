## ADDED Requirements

### Requirement: API skill 入参按 parameterContract.properties[*].type 做强转

API 扩展 Skill（`kind: "api"`）在 gateway 侧执行 `SkillExecutionService.mergeDefaults(...)` 时，MUST 在合并完 `default` / `const` 与用户入参之后，遍历 `parameterContract.properties`，对每个声明了 `type` 的 key 按下表做强转。强转覆盖 `default` / `const` 写出的值**和**用户传入的值（`default` 字段在编辑器里写字符串 `"true"` 的场景也要被规整）。

| 契约 type | 入参类型 | 强转结果 |
|-----------|----------|----------|
| `boolean` | `Boolean` | 原样保留 |
| `boolean` | `String` `"true"` / `"True"` / `"TRUE"` / `"yes"` / `"1"`（大小写不敏感、去前后空格）| `Boolean.TRUE` |
| `boolean` | `String` `""` / `"false"` / `"False"` / `"FALSE"` / `"no"` / `"0"`（大小写不敏感、去前后空格）| `Boolean.FALSE` |
| `boolean` | `String` 其他值 | 抛 `IllegalArgumentException`（消息包含字段名 + 实际值）|
| `boolean` | 非 Boolean 非 String（如 `Number` / `Map` / `List`）| 抛 `IllegalArgumentException`（消息包含字段名 + 实际类型名）|
| `boolean` | `null` | 原样保留 `null` |
| `integer` | `Integer` / `Long` | 原样保留 |
| `integer` | `String` | `Long.parseLong(trim(value))`，失败抛 `IllegalArgumentException` |
| `integer` | 其他 `Number` | 转 `Long`（`((Number) v).longValue()`）|
| `integer` | 非 Number 非 String | 抛 `IllegalArgumentException` |
| `integer` | `null` | 原样保留 `null` |
| `number` | `Double` / `Float` | 原样保留 |
| `number` | `String` | `Double.parseDouble(trim(value))`，失败抛 `IllegalArgumentException` |
| `number` | 其他 `Number` | 转 `Double`（`((Number) v).doubleValue()`）|
| `number` | 非 Number 非 String | 抛 `IllegalArgumentException` |
| `number` | `null` | 原样保留 `null` |
| `string` | 任意类型 | 原样保留（不处理）|
| `null` / 缺失 | 任意类型 | 原样保留（不处理）|

强转应用范围：
- query 参数（`parameterBinding: "query"` 或缺省）
- jsonBody（`parameterBinding: "jsonBody"` + POST/PUT/PATCH/DELETE）
- formBody（`parameterBinding: "formBody"` + POST/PUT/PATCH/DELETE）

> **实际只影响 `kind: "api"`**。
> 经逐 kind 实证：`executeApiSkill` 是**唯一**使用 `mergeDefaults` 返回值的 Skill handler；
> `executePythonSkill` / `executeSshSkill` / `executeTemplateSkill` / `executeFileToolSkill` 内部各自重新 `asMap(parameters)`，**不读** `mergeDefaults` 的返回结果。
> 因此本次修改的实际生效范围是 `kind: "api"` 全部 binding。
>
> **未来扩展**：如果其他 kind（如 python / ssh）改为使用 `mergeDefaults` 返回结果（出于统一 default/const 兜底行为的目的），
> 本规约的强转会**自动扩展**到该 kind，无需新增代码。届时需同步更新本 spec 的「强转应用范围」段与对应 kind 的 spec。

> **实现细节**：强转循环按 key 寻址遍历 `parameterContract.properties`（`merged.put(key, coerceByType(...))`），**非顺序依赖**。
> 即使 Jackson 反序列化时把 properties map 写成 `HashMap`（迭代顺序不固定），强转结果也一致。

强转不应用范围：
- Python Skill（`kind: "python"`）— 沙箱侧契约不在 LLM 透传面，sandbox 自己负责入参规整
- 嵌套 object / array 内部元素 — 本次只做顶层 key 强转

#### Scenario: boolean 字符串 "true" 被强转为 true
- **WHEN** Skill `parameterContract.properties.enabled = {"type": "boolean"}`
- **AND** LLM 透传入参为 `{"enabled": "true"}`（字符串）
- **THEN** `mergeDefaults` 返回的 merged map 中 `enabled` MUST 为 `Boolean.TRUE`（非字符串）
- **AND** 下游 query / jsonBody / formBody 任一 binding MUST 收到 boolean `true`，**不是**字符串 `"true"`

#### Scenario: boolean 字符串 "True" / "TRUE" 大小写不敏感
- **WHEN** Skill `parameterContract.properties.enabled = {"type": "boolean"}`
- **AND** LLM 透传入参为 `{"enabled": "True"}` 或 `{"enabled": "TRUE"}` 或 `{"enabled": " true "}`（带空格）
- **THEN** merged map 中 `enabled` MUST 为 `Boolean.TRUE`

#### Scenario: boolean 字符串 "false" / "False" / "0" 被强转为 false
- **WHEN** Skill `parameterContract.properties.enabled = {"type": "boolean"}`
- **AND** LLM 透传入参为 `{"enabled": "false"}` / `{"enabled": "False"}` / `{"enabled": "0"}` / `{"enabled": ""}`（空串）
- **THEN** merged map 中 `enabled` MUST 为 `Boolean.FALSE`

#### Scenario: boolean 非法字符串抛错
- **WHEN** Skill `parameterContract.properties.enabled = {"type": "boolean"}`
- **AND** LLM 透传入参为 `{"enabled": "abc"}`（无法解析为 boolean 的字符串）
- **THEN** gateway MUST 抛 `IllegalArgumentException`
- **AND** 异常消息 MUST 包含字段名 `enabled` 和实际值 `abc`
- **AND** 异常 MUST 在出站 HTTP 调用前抛出，下游 MUST NOT 被调用

#### Scenario: integer 字符串被强转为 Long
- **WHEN** Skill `parameterContract.properties.count = {"type": "integer"}`
- **AND** LLM 透传入参为 `{"count": "42"}`
- **THEN** merged map 中 `count` MUST 为 `Long(42)`（不是字符串 `"42"`）

#### Scenario: number 字符串被强转为 Double
- **WHEN** Skill `parameterContract.properties.ratio = {"type": "number"}`
- **AND** LLM 透传入参为 `{"ratio": "0.75"}`
- **THEN** merged map 中 `ratio` MUST 为 `Double(0.75)`

#### Scenario: 已是对应类型原样保留
- **WHEN** Skill `parameterContract.properties.enabled = {"type": "boolean"}`
- **AND** LLM 透传入参为 `{"enabled": true}`（已经是 Boolean）
- **THEN** merged map 中 `enabled` MUST 仍为 `Boolean.TRUE`，**不**被额外包装或转换

#### Scenario: null 值原样保留
- **WHEN** Skill `parameterContract.properties.enabled = {"type": "boolean"}`
- **AND** LLM 透传入参为 `{"enabled": null}` 或根本未传 `enabled` 字段
- **THEN** merged map 中 `enabled` MUST 为 `null`（不抛错、不转换成 `false`）

#### Scenario: default 字符串 "true" 也会被强转
- **WHEN** Skill `parameterContract.properties.enabled = {"type": "boolean", "default": "true"}`
- **AND** LLM 未传 `enabled` 字段
- **THEN** merged map 中 `enabled` MUST 为 `Boolean.TRUE`（不是字符串 `"true"`）

#### Scenario: 无 parameterContract 时行为不变
- **WHEN** Skill config 没有 `parameterContract` 字段
- **AND** LLM 透传任意入参（含字符串 boolean）
- **THEN** merged map MUST 与 `asMap(parameters)` 一致（**不**做强转，向后兼容无契约 Skill）

#### Scenario: property 未指定 type 时原样保留（保守契约）
- **WHEN** Skill 有 `parameterContract` 但**某个 property 未声明 `type` 字段**（如 `{"name": "用户 ID"}` 这种简化描述）
- **AND** LLM 透传 `{"name": "true"}`（字符串）
- **THEN** merged map 中 `name` MUST 仍为字符串 `"true"`，**不**被推断或强转为 boolean
- **AND** **不**触发任何 `IllegalArgumentException`（未声明 type → 不视为契约违反）

#### Scenario: type 显式为 null 时原样保留
- **WHEN** Skill `parameterContract.properties.flag = {"type": null}` 或 `"type": ""`
- **AND** LLM 透传 `{"flag": "true"}`
- **THEN** merged map 中 `flag` MUST 仍为字符串 `"true"`，**不**做强转

#### Scenario: type 不是 boolean/integer/number/string 时原样保留
- **WHEN** Skill `parameterContract.properties.payload = {"type": "object"}` 或 `"type": "array"`
- **AND** LLM 透传 `{"payload": {"enabled": "true"}}`（嵌套对象）
- **THEN** merged map 中 `payload` MUST 仍为原 Map，**不**做递归强转（嵌套规整不在本次范围）

#### Scenario: query binding 收到 boolean true
- **WHEN** Skill 配置 `parameterBinding: "query"` + `method: "GET"`
- **AND** LLM 透传入参 `{"enabled": "true"}` + contract 声明 `enabled.type: "boolean"`
- **THEN** 出站 URL 的 query 段 MUST 包含 `enabled=true`（不是 `enabled=true` 的字符串编码形式 `enabled=%22true%22`）

#### Scenario: jsonBody binding 收到 JSON boolean true
- **WHEN** Skill 配置 `parameterBinding: "jsonBody"` + `method: "POST"`
- **AND** LLM 透传入参 `{"enabled": "true"}` + contract 声明 `enabled.type: "boolean"`
- **THEN** 出站 body JSON MUST 包含 `"enabled":true`（JSON boolean literal，不是字符串 `"enabled":"true"`）

#### Scenario: formBody binding 收到字符串 "true"
- **WHEN** Skill 配置 `parameterBinding: "formBody"` + `method: "POST"`
- **AND** LLM 透传入参 `{"enabled": "true"}` + contract 声明 `enabled.type: "boolean"`
- **THEN** 出站 form body MUST 包含 `enabled=true`（强转后的 boolean 经 `String.valueOf` 转回 `"true"`，符合 form-urlencoded 协议）

#### Scenario: agent-core 不做类型规整
- **WHEN** LLM 通过 tool-call 透传字符串 boolean 给 gateway
- **THEN** agent-core MUST NOT 在透传前做类型转换（agent-core 只负责 tool-call 协议与 LLM 调度）
- **AND** 所有类型规整 MUST 在 gateway `SkillExecutionService.mergeDefaults(...)` 内完成