## 背景

当前 bot 支持 `api`、`ssh`、`python` 三种 CONFIG-mode Skill 类型。三者共享 agent-core 侧的 `payload` 包装协议（`ensureObjectType`），LLM 工具调用统一为 `{ skillId, payload: { ... } }`，Gateway 收到扁平的 `Map<String, Object>`：

- `api`：将扁平 Map 组装为 query 参数或 JSON body
- `ssh`：将 `host`/`cmd` 注入 SSH 会话
- `python`：将扁平 Map 作为 `script_args` 传给 Python 沙箱

当前没有方式调用任意第三方 HTTP 服务（天气、股票、通知、脚本执行等），而不：(1) 在 Skill 配置里直接嵌入 URL（限制复用，且改接入信息要动 Skill）；(2) 在 agent-core 里写新的 skill executor（AGENTS.md §5.5 禁止）。

技术方案详见 `docs/external-service-skill-design.md`，本文档总结关键决策。

## 目标与非目标

**目标：**
- 新增 `kind="external"` CONFIG-mode Skill 类型，LLM 调用时使用与 `api`/`ssh`/`python` 完全相同的 `payload` 包装
- 通过 admin 管理的 `external_service` 注册表将服务元数据（URL、认证、重试、超时）与 Skill 配置解耦
- 通过 `external_service_input` 表将每个服务的入参契约（参数名、位置、原文透传标志）与 Skill 输入框定义解耦
- 允许业务方在创建 Skill 时自由定义输入字段名称，并映射到外部服务参数
- 支持字段值的原文透传（不做 JSON 序列化、不做 URL 编码）
- 支持 GET query、POST body（JSON/form/text/binary）、header 注入、三种认证方式（apiKey/bearer/dynamicToken）、超时重试、审计脱敏

**非目标：**
- GraphQL、gRPC 或 WebSocket 出站（仅支持 HTTP）
- 修改 agent-core
- 新增 Vue 组件或 npm 包
- 实现熔断器
- 将现有 `python` Skill 改造为 `external` 模型

## 关键决策

### 决策 1：两套独立的输入模型（Skill 输入框 + 外部服务入参契约）

**方案 A（否决）**：单一表（`external_service_param`），`placeholder` 同时作为 Skill 输入框的 key 和外部参数名。LLM 直接看到外部 API 的参数名（如 `q` 表示城市、`list` 表示股票代码），体验差且不安全。

**方案 B（采用）**：分离"Skill 输入框"（LLM 填写）和"外部服务入参契约"（第三方 API 期望）。Skill 输入框通过 `mapsTo` 字段引用外部服务入参名，`mapsTo=null` 表示"不传给第三方"。

选择理由：单一表强制 LLM 使用外部 API 的参数名（往往晦涩难懂）。分离后业务方可以自由命名 Skill 输入框（如 `city`、`stockCode`），同时映射到外部名（`q`、`list`）。`null` 映射也干净地支持"仅 Gateway 内部使用"的字段。

### 决策 2：Skill 输入框定义存放在 `skills.configuration.inputs[]` JSON，不新建表

**方案 A（否决）**：新建 `external_skill_input` 表，FK 指向 `skills`。

**方案 B（采用）**：Skill 输入框定义以 JSON 数组形式存放在 `skills.configuration.inputs`。

选择理由：所有 Skill 配置集中在一处。同一个外部服务可被多个 Skill 引用，每个 Skill 的输入名称和描述都可以不同。执行时无需 join 额外的表。

### 决策 3：`is_raw_transmission` 标志放在 `external_service_input`（外部服务契约侧）

**方案 A（否决）**：将标志放在 Skill 输入框侧。

**方案 B（采用）**：将标志放在 `external_service_input` 侧。

选择理由：原文透传行为是第三方 API 契约的属性（接收端），而非 Skill 表现层的属性。如果第三方 API 要求某个字段传 JSON 字符串，所有引用该服务的 Skill 都应遵守。要改只需改注册表，不需要改每个 Skill。

### 决策 4：Gateway 侧解析映射，agent-core 和前端不变

Gateway executor（`ExternalServiceSkillExecutor`）遍历 `inputs[]`，将每个 `mapsTo` 解析为 `external_service_input`，组装出站请求。agent-core 和前端零改动。

选择理由：符合 AGENTS.md §5.5（"新能力以新 Skill 类型接入 gateway 侧"）。前端只渲染表单，契约校验由 Gateway 强制。

### 决策 5：`auth_value_static` 加密存储，通过 `AesCipher` 解密运行时使用

凭证以加密形式存储在 `external_service.auth_value_static`，Gateway 在运行时解密后注入 Header。

选择理由：防止数据库快照泄露凭证。复用现有的 `AesCipher` 工具类，无新依赖。

## 风险与权衡

[风险：Admin 误配 `is_raw_transmission=1` 但值不是合法 JSON]  
缓解：`parseJsonOrKeepString` 兜底；审计日志 WARN 标记。

[风险：Skill 输入框没有映射到所有必填的外部入参]  
缓解：`MappingValidator.validate()` 在 Skill 创建/更新时校验；若有任何 `external_service_input.is_required=1` 未被 mapsTo，保存时返回 400。

[风险：Dynamic Token 缓存雪崩（多 Skill 并发首次请求）]  
缓解：`DynamicTokenCache` 按 `svc.getName().intern()` 加锁。

[风险：非幂等外部服务被重试]  
缓解：`description` 字段给出 admin 提示；`retry_max=0` 为安全默认值；Java 端不做强制重试。

[风险：TS6133 导致前端 build 失败]  
缓解：实现完成后 `vue-tsc -b && npm run build` 检查清单（按 AGENTS.md §5.6）。

[风险：JDK 1.8 不兼容]  
缓解：不使用 `List.of()`、`var`、Records 等高版本 API。全部通过 `Arrays.asList()` 和显式类型实现。

**权衡：两张表 vs. 一张表**：比单 JSON 字段复杂，但提供 FK 约束、行级索引和更干净的 admin CRUD。长期可维护性优先。

## 迁移计划

1. Gateway 启动时 `SchemaMigrationRunner` 自动创建 `external_service` 和 `external_service_input` 两张表
2. Admin 通过 SQL（或未来的 admin UI）插入服务定义和入参契约
3. 业务方通过现有的 Skill 管理弹窗创建 `kind=external` 的 Skill（已扩展支持新类型）
4. 已有 Skill（`api`/`ssh`/`python`）完全不受影响。功能回滚 = 在 `SystemSkillController` 中移除 `external` 类型 Schema 注册，无需删除数据。

## 开放问题

1. `external_service` 是否应该像 `python_sandbox` 一样仅限 admin 写，还是允许提升权限的用户写入？
2. 是否应该在 `external_service_input` 上加 `default_value` 字段，让缺失的可选参数获得合理的默认值？
3. Admin 注册表是否应该有专属的 Vue 页面（`ExternalServiceManagement.vue`）？还是仅通过 SQL/`api_call` 工具维护？
4. `python` Skill 理论上可以改造为引用 `external_service` + `external_service_input` 的 `kind=external` 实例。是否计划作为后续迁移？
