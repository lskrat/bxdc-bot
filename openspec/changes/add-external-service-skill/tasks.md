## 1. 数据库 & Entity 基础

- [ ] 1.1 在 `backend/skill-gateway/src/main/resources/schema-mysql.sql` 追加 2 张表 DDL（`external_service` 13 字段 + `external_service_input` 12 字段；含 `auth_config` JSON 列）
- [ ] 1.2 在 `backend/skill-gateway/src/main/java/.../config/SchemaMigrationRunner.java` 加 `migrateExternalService()` + `migrateExternalServiceInput()` 两个幂等 `CREATE TABLE IF NOT EXISTS` 方法（按 AGENTS.md §5.3 模式，HIGHEST_PRECEDENCE 在所有 ApplicationRunner 之前）
- [ ] 1.3 创建 `entity/ExternalService.java`（MyBatis-Plus `@TableName("external_service")`，13 字段；`@TableField(typeHandler = JacksonTypeHandler.class)` 处理 `auth_config` JSON）
- [ ] 1.4 创建 `entity/ExternalServiceInput.java`（MyBatis-Plus `@TableName("external_service_input")`，12 字段）
- [ ] 1.5 创建 `mapper/ExternalServiceMapper.java`（extends `BaseMapper<ExternalService>`）+ `mapper/ExternalServiceInputMapper.java`（extends `BaseMapper<ExternalServiceInput>`）
- [ ] 1.6 创建 `mapper/xml/ExternalServiceMapper.xml`（`listEnabled()` 按 `display_order ASC, id ASC` 排序）+ `mapper/xml/ExternalServiceInputMapper.xml`（`listByServiceId(serviceId)` 按 `display_order ASC, id ASC` 排序）
- [ ] 1.7 创建 `dto/ExternalServiceRequest.java`（admin 增改 DTO：主表字段 + `List<ExternalServiceInputRequest> inputs`）
- [ ] 1.8 创建 `dto/ExternalServiceInputRequest.java`（子表 DTO）
- [ ] 1.9 创建 `dto/ExternalServiceView.java`（出参 DTO：脱敏后的 `auth_config`；`valueStatic` 对非 admin 返回 `***MASKED-XXXX***` 只显后 4 位）

## 2. AuthConfigParser（auth_config JSON 解析）

- [ ] 2.1 创建 `service/AuthConfigParser.java`（包装 Jackson `ObjectMapper`；`getString(key, default)` / `getDecryptedString(key)` / `getJsonNode(key)` / `getLong(key, default)` 方法）
- [ ] 2.2 在 `AuthConfigParser` 中对 `valueStatic` 字段读出后立即 `AesCipher.decrypt()`（构造时传入密文 + 触发解密；避免明文常驻内存）
- [ ] 2.3 `AuthConfigParser.parse(svc.getAuthConfig(), svc.getAuthKind())` 静态工厂；按 `auth_kind` 校验必填字段（`apiKey` 必须有 `headerName`+`valueStatic`；`bearer` 必须有 `valueStatic`；`dynamicToken` 必须有 `tokenEndpoint`+`tokenPath`+`tokenRequestBody`+`cacheSeconds`）；缺字段抛 `IllegalArgumentException`（带可读消息）

## 3. ExternalServiceRegistry（带缓存的注册表服务）

- [ ] 3.1 创建 `service/ExternalServiceRegistry.java`（`@Service`；构造时 `@PostConstruct` 调 `loadAll()` 一次性加载到 `ConcurrentHashMap<Long, ExternalService>` + `ConcurrentHashMap<Long, List<ExternalServiceInput>>`）
- [ ] 3.2 实现 `getByIdOrThrow(Long id)` / `getByNameOrThrow(String name)` / `listEnabled()` / `listInputs(Long serviceId)` 方法
- [ ] 3.3 实现 `invalidateAll()` / `invalidateService(Long serviceId)` 方法（清空缓存，下次访问时重新从 DB 加载）
- [ ] 3.4 实现 `assertExists(String serviceName)` 方法（服务不存在或 `enabled=0` 时抛 `IllegalArgumentException`）
- [ ] 3.5 实现 5 分钟 TTL 后台线程（`@Scheduled(fixedRate = 300_000)` 或 `Executors.newSingleThreadScheduledExecutor`；到期全量重载；与 `python_sandbox` 的 `PythonSandboxRegistry` 缓存模式一致）

## 4. DynamicTokenCache（dynamicToken 模式本地缓存）

- [ ] 4.1 创建 `service/DynamicTokenCache.java`（`ConcurrentHashMap<String, CachedToken>`；`CachedToken { String token; long expiresAt; }`）
- [ ] 4.2 实现 `getOrFetch(ExternalService svc, AuthConfigParser authCfg)` 方法（`synchronized(svc.getName().intern())` 单飞；调 `ApiProxyService.callApi(tokenEndpoint, "POST", emptyHeaders, tokenRequestBody, HttpClientAuditMode.NONE, 10_000)` 拿响应）
- [ ] 4.3 在响应解析中使用 `JsonPathUtils.read(responseBody, tokenPath)`（沿用现有 `JsonPathUtils` 工具类）提取 token；缓存到 `cache` map，`expiresAt = now + cacheSeconds * 1000L`

## 5. RetryableHttpClient（重试封装）

- [ ] 5.1 创建 `service/RetryableHttpClient.java`（`callApiWithRetry(url, method, headers, body, retryMax, timeoutMs, auditMode, auditContext)` 方法）
- [ ] 5.2 退避基数写死 500ms，指数 `Thread.sleep(500 * (1L << attempt))`；`attempt` 从 0 到 `retryMax`；`retryMax=0` 时仅 1 次不重试
- [ ] 5.3 复用 `ApiProxyService.callApi(url, method, headers, body, mode, timeoutMs)`（**不引入新 HTTP 客户端**；沿用现有 `RestTemplate` 配置）
- [ ] 5.4 `InterruptedException` 时 `Thread.currentThread().interrupt()` 并跳出循环

## 6. ExternalResponseFormatter（响应格式处理）

- [ ] 6.1 创建 `service/ExternalResponseFormatter.java`（`format(ResponseEntity<String> resp, String responseFormat)` 静态方法）
- [ ] 6.2 `responseFormat="json"` → `objectMapper.readValue(resp.getBody(), Object.class)` 返回结构化对象
- [ ] 6.3 `responseFormat="text"` → 直接返回 `resp.getBody()` 字符串
- [ ] 6.4 `responseFormat="binary-base64"` → `Base64.getEncoder().encodeToString(resp.getBody().getBytes(StandardCharsets.UTF_8))`

## 7. ExternalOutboundPayloadMasker（审计脱敏）

- [ ] 7.1 创建 `audit/ExternalOutboundPayloadMasker.java`（`mask(Map<String,Object> llmParams, List<ExternalServiceInput> inputs)` 方法）
- [ ] 7.2 遍历子表行：若 `is_sensitive=1` 则将值替换为 `"***MASKED***"`；若 `is_sensitive=0` 则保留原值
- [ ] 7.3 遍历 llmParams 中**不在子表**的 key：保留原值（落审计时可看到 LLM 误传）
- [ ] 7.4 返回的 Map 顺序：`先子表行（按 display_order），再 LLM 额外 key`

## 8. ExternalServiceSkillExecutor（核心出站逻辑）

- [ ] 8.1 创建 `service/ExternalServiceSkillExecutor.java`（`@Service`；`executeExternalSkill(Skill skill, Map<String,Object> config, Object parameters, String userId)` 方法）
- [ ] 8.2 实现 §8.1 伪代码（已设计完整）：
  1. `config.get("serviceName")` → `registry.getByNameOrThrow()` → 检查 `enabled=1`
  2. `registry.listInputs(svc.getId())` 拿子表行
  3. 必填校验：遍历子表 `is_required=1` 的行，检查 `llmParams` 是否含 `external_param_name`
  4. path 替换：`endpoint_url.replace("{" + name + "}", URLEncoder.encode(value, "UTF-8"))`（或 raw 模式不编码）
  5. 拼 query / body / header（按 `param_location` 过滤；`is_raw_transmission` 决定编码方式）
  6. 认证注入：`AuthConfigParser` + switch 按 `auth_kind`
  7. 审计脱敏：`masker.mask()`
  8. 调用：`retryableHttpClient.callApiWithRetry(...)`
  9. 响应处理：`responseFormatter.format()` → 返回 LLM
- [ ] 8.3 二进制 body（`body_content_type=binary`）：调 `FileRefResolver.resolve(fileRef)` → `FileToolService.readInputStream(userFile)` → 用 `RestTemplate` + `MultipartFile` 拼 multipart
- [ ] 8.4 链路追踪透传：注入 `X-Trace-Id` / `X-Request-Id` / `X-User-Id` / `X-Session-Id` 到 `headerMap`（从入站上下文 `RequestContextHolder` 或参数 `userId` 拿）

## 9. SkillExecutionService switch 接入

- [ ] 9.1 在 `backend/skill-gateway/src/main/java/.../service/SkillExecutionService.java` 的 `execute()` switch 中追加 `case "external": return externalServiceSkillExecutor.executeExternalSkill(skill, config, parameters, userId);`
- [ ] 9.2 在 `SkillExecutionService` 注入 `ExternalServiceSkillExecutor`（构造器注入 + `@Autowired` 或 `@RequiredArgsConstructor`）

## 10. SystemSkillController.buildExternalConfigSchema

- [ ] 10.1 在 `backend/skill-gateway/src/main/java/.../controller/SystemSkillController.java` 的 `listExecutionTypes()` 中追加 `external` 循环：`for (ExternalService svc : registry.listEnabled()) { types.add(buildExternalConfigSchema(svc)); }`
- [ ] 10.2 新增 `private JsonNode buildExternalConfigSchema(ExternalService svc)` 方法，schema 只含 2 个键：
  - `serviceName`：`ui: 'select'`，options = 已启用服务名列表
  - `interfaceDescription`：`ui: 'textarea'`
- [ ] 10.3 `additionalProperties: false`（schema 强制拒绝 `inputs` / `mapsTo` / `operation` 旧字段）
- [ ] 10.4 在 `SystemSkillController` 注入 `ExternalServiceRegistry`

## 11. SkillService FK 校验 + 旧字段拒绝

- [ ] 11.1 在 `backend/skill-gateway/src/main/java/.../service/SkillService.java` 的 `createOrUpdate()` 中，对 `kind=external` 的 skill 加 `registry.assertExists(skill.configuration.serviceName)` 校验
- [ ] 11.2 校验失败抛 `IllegalArgumentException`（带可读消息：服务不存在 / 服务禁用 / serviceName 缺失）
- [ ] 11.3 在 `JsonSchemaValidator` 中对 `kind=external` 的 skill 校验 `configuration`：**只允许** `kind` / `serviceName` / `interfaceDescription` 三个键；**拒绝** `inputs` / `mapsTo` / `operation`（用 `additionalProperties: false`）
- [ ] 11.4 校验失败返回 400 + 错误消息

## 11.5 Skill.computeSchemaPropertiesInternal() 派生 external schemaProperties（agent-core 0 改动机制）

> 对应 `design.md 决策 11` + `specs/external-service-skill/spec.md Requirement: External skill runtime exposure to LLM`。本节是 **agent-core 0 改动** 的核心实现路径，**所有改动**集中在 Gateway `Skill.java` 单点。

### 11.5.1 修改 Skill.computeSchemaPropertiesInternal() 新增 kind=external 分支

- [ ] 11.5.1.1 在 `backend/skill-gateway/src/main/java/.../entity/Skill.java` 的 `computeSchemaPropertiesInternal(String config)` 方法末尾新增 `else if ("external".equals(kind))` 分支
- [ ] 11.5.1.2 该分支**不**直接调 `ExternalServiceRegistry`（避免 entity 静态方法依赖 Spring bean）；改为：返回空 Map，由 `SkillService.createOrUpdate()` 在持久化前调 `externalServiceSkillExecutor.deriveSchemaProperties(skill)` 补全 → 写回 `skill.setSchemaProperties(...)` 后再 save
- [ ] 11.5.1.3 或采用替代方案：在 `Skill.java::computeSchemaPropertiesInternal()` 中**仅**识别 `kind=external` 返回 null 哨兵值，由 `SkillService` 检测后调 `ExternalServiceSkillExecutor.deriveSchemaProperties(...)` 注入（**推荐方案**，entity 保持纯净）
- [ ] 11.5.1.4 派生逻辑：
  ```
  1. cfg = parseJSON(configuration)
  2. kind = cfg.get("kind")
  3. serviceName = cfg.get("serviceName")
  4. svc = externalServiceRegistry.getByNameOrThrow(serviceName)  // 触发 FK 校验
  5. inputs = externalServiceRegistry.listInputs(svc.getId())       // 按 display_order ASC, id ASC
  6. properties = new LinkedHashMap<>()
     for input in inputs:
       properties.put(input.externalParamName, {
         "type": input.paramType,                    // "string"/"number"/"boolean"
         "description": input.description != null ? input.description : input.displayName
       })
  7. required = inputs.filter(i => i.isRequired == 1).map(i => i.externalParamName)
  8. return { properties, required }
  ```
- [ ] 11.5.1.5 在 `SkillService.createOrUpdate()` 路径中：
  - 先调 `Skill.computeSchemaPropertiesInternal(config)` 拿到初始 schemaProperties
  - 若 kind=external 且结果是空/null → 调 `externalServiceSkillExecutor.deriveSchemaProperties(skill)` 补全 → merge
  - 写回 `skill.setSchemaProperties(...)` 再持久化
  - 这保证 `computeSchemaPropertiesInternal()` 现有逻辑（api/python SSH template）**不被破坏**
- [ ] 11.5.1.6 派生时**严格按 display_order ASC, id ASC** 排序（与 LLM 工具 schema 一致；§20 参数名一致性）

### 11.5.2 ExternalServiceSkillExecutor 新增 deriveSchemaProperties() 方法

- [ ] 11.5.2.1 在 `ExternalServiceSkillExecutor` 新增 `public Map<String, Object> deriveSchemaProperties(Skill skill)` 方法
- [ ] 11.5.2.2 方法实现：解析 `skill.configuration` → 拿 serviceName → 调 registry 拿子表行 → 派生 `properties` + `required`
- [ ] 11.5.2.3 serviceName 不存在 → 抛 `IllegalArgumentException("External service not found: " + serviceName)`（与 FK 校验共用错误消息）
- [ ] 11.5.2.4 serviceName 禁用 → 抛 `IllegalArgumentException("External service disabled: " + serviceName)`（与执行时共用错误消息）
- [ ] 11.5.2.5 子表为空 → 返回 `{properties: {}, required: []}`（**不**抛异常，与决策 10 一致）

### 11.5.3 agent-core 0 改动验证

- [ ] 11.5.3.1 实施完成后跑 `git diff backend/agent-core/` 应为空（**零文件修改**）
- [ ] 11.5.3.2 `cd backend/agent-core && npm run build` 仍通过（**未触发** 重新编译 agent-core）
- [ ] 11.5.3.3 端到端测试：admin 创建 external skill → agent-core 启动 → `loadGatewayExtendedTools()` 调 `/api/skills` → 拿到 `schemaProperties` → `buildSkillZodSchema()` 派生 Zod → LLM 看到 tool schema property 名为 `q` / `units` / `lang`
- [ ] 11.5.3.4 端到端测试：LLM 调用 tool，payload key 是 `q` / `units` / `lang` → agent-core 原样 POST Gateway → Gateway switch 进 `case "external"` → ExternalServiceSkillExecutor 查子表 → 拼出站 → 响应回 LLM
- [ ] 11.5.3.5 验证 `Skill.java::computeSchemaPropertiesInternal()` 现有 case（api/python）逻辑**未被破坏**：现有 skill 的 schemaProperties 仍正确生成

### 11.5.4 与 api/python 的对等性回归验证

- [ ] 11.5.4.1 admin 创建 `kind=api` skill，参数从 `parameterContract` 派生 schemaProperties → agent-core 走同一路径 → 工具调用成功（回归原有链路）
- [ ] 11.5.4.2 admin 创建 `kind=python` skill，参数从 `parameterContract` 派生 schemaProperties → agent-core 走同一路径 → 沙箱执行成功（回归原有链路）
- [ ] 11.5.4.3 admin 创建 `kind=template` skill，参数从配置派生 → agent-core 走同一路径（回归原有链路）
- [ ] 11.5.4.4 admin 创建 `kind=external` skill，参数从 `external_service_input` 派生 → agent-core 走同一路径（新链路）
- [ ] 11.5.4.5 4 种 kind 在 agent-core 端**走完全相同**的 `buildSkillZodSchema(config, schemaProperties)` 路径 → 证明 0 改动

## 12. ExternalServiceController（admin CRUD）

- [ ] 12.1 创建 `controller/ExternalServiceController.java`（`@RestController` `@RequestMapping("/api/external-service")`；所有写接口 `@PreAuthorize("hasRole('ADMIN')")`）
- [ ] 12.2 实现 8 个端点（参考 `external-service-registry/spec.md` Requirement: Admin CRUD for external_service）：
  - `GET /api/external-service` — list（admin-only）
  - `GET /api/external-service/{id}` — get by id（admin-only）
  - `GET /api/external-service/by-name/{name}` — get by name（admin-only）
  - `POST /api/external-service` — create（admin-only；含子表行；事务）
  - `PUT /api/external-service/{id}` — update（admin-only；含子表行替换；事务）
  - `DELETE /api/external-service/{id}` — delete（admin-only；CASCADE 子表行；事务）
  - `POST /api/external-service/{id}/invalidate-cache` — 失效单服务缓存
  - `POST /api/external-service/invalidate-cache` — 失效所有缓存
- [ ] 12.3 在 `create` / `update` 路径中：若 `auth_config.valueStatic` 是明文，**先 `AesCipher.encrypt()` 再存**（兜底加密；admin UI 已加密时 no-op）
- [ ] 12.4 在 `read` 路径中：`ExternalServiceView` 对非 admin role 隐藏 `valueStatic`（返回 `***MASKED-XXXX***`）
- [ ] 12.5 创建 `controller/ExternalServiceQueryController.java`（`GET /api/external-service/{name}/inputs` 公开端点；任何已认证用户可读；返回子表行排除 `is_sensitive`）

## 13. 前端 skillEditor.ts 扩展

- [ ] 13.1 在 `frontend/src/utils/skillEditor.ts` 的 `ConfigKind` union 加 `'external'`
- [ ] 13.2 新增 `ExternalConfigDraft` 接口（**只含 `serviceName` + `interfaceDescription` 两个字段**）
- [ ] 13.3 新增 `parseExternalDraft(config)` / `serializeExternalDraft(draft)` / `isExternalDraft(draft)` 函数
- [ ] 13.4 新增 `EXTERNAL_ALLOWED_KEYS = ['serviceName', 'interfaceDescription']` 常量
- [ ] 13.5 `createDefaultSkillDraft('CONFIG', 'external')` 默认值（`serviceName: ''`，`interfaceDescription: ''`）
- [ ] 13.6 `CONFIG_KIND_LABELS.external = '外部 HTTP 服务'`
- [ ] 13.7 `parseSkillDraft` / `serializeSkillDraft` switch 加 `case 'external'`
- [ ] 13.8 `getConfigKindOptions()` / `getPresetLabel()` 加 `external` 分支
- [ ] 13.9 自查：所有新加的 export / const / function 必须在文件内被引用（避免 TS6133）

## 14. 前端 SkillManagementModal.vue 扩展

- [ ] 14.1 在 `frontend/src/components/SkillManagementModal.vue` 的 `draftToFormValues` / `updateDraftFromFormValues` 加 `isExternalDraft` 分支（**只处理 `serviceName` + `interfaceDescription`**）
- [ ] 14.2 `serviceName` change 时调 `GET /api/external-service/{name}/inputs` 拿子表行 → 渲染**只读预览区**（不写入 configuration）
- [ ] 14.3 预览区按 `display_order` 渲染：每行 = `[display_name 中文 label] (external_param_name 英文) [textarea 预览]`
- [ ] 14.4 保存前**不**复制子表行到 draft；保存时只传 `kind` / `serviceName` / `interfaceDescription` 三个键

## 15. 前端 ConfigFormRenderer.vue 验证

- [ ] 15.1 验证 `ConfigFormRenderer.vue` 已支持 `ui: 'select'` / `ui: 'textarea'` / `ui: 'input'`（用于 `serviceName` select / `interfaceDescription` textarea）
- [ ] 15.2 **不**实现 `ui: 'dynamicList'`（本设计无 inputs[] 动态表单需求）
- [ ] 15.3 **不**新增任何 `.vue` 文件

## 16. 自查与文档

- [ ] 16.1 前端 `cd frontend && npx vue-tsc -b` 静默通过（零 TS6133）
- [ ] 16.2 前端 `cd frontend && npm run build` 退出码 0
- [ ] 16.3 后端 `cd backend/skill-gateway && ./apache-maven-3.8.5/bin/mvn -s ./settings.xml -DskipTests compile` 通过（JDK 1.8 编译；AGENTS.md §2.4 启动 mvn 必须先 cd 到 skill-gateway）
- [ ] 16.4 后端 `java -cp ... AesCipher encrypt "sk-xxx"` 验证加密工具可用
- [ ] 16.5 冷启动验证：清空 DB → 启动 gateway → `SHOW TABLES LIKE 'external_service%'` 确认 2 张表自动创建
- [ ] 16.6 手工跑 `docs/external-service-skill-design.md §9` 完整流程示例（admin 配 weather service + 3 行 input → 创建 External Skill → Skill 创建页自动渲染 3 个 textarea → LLM 调用 → 出站 query 校验）
- [ ] 16.7 验证 is_raw_transmission 两种值（天气 q is_raw=0 / 脚本 code is_raw=1）的出站 payload 差异
- [ ] 16.8 验证 admin 改子表（加 q2 行）后业务方 Skill 立即生效（无需重保存）
- [ ] 16.9 补 `api_call_log` 测试用例（验证 sensitive mask / LLM 误传 key 也落审计）
- [ ] 16.10 确认 `openspec/reviews/2026-06-23-add-external-service-skill.md` 是基于旧设计（`inputs[]` / `dynamicList` / `auth_value_static`）的 review，**与本次 change 不冲突**；仅作历史参考

## 17. 文档同步

- [ ] 17.1 确认最终设计稿 `docs/external-service-skill-design.md` 存在且内容最新（与本次 OpenSpec 一致）
- [ ] 17.2 在 `backend/skill-gateway/src/main/resources/schema-mysql.sql` 头部注释里注明"参考 `openspec/changes/add-external-service-skill/` 设计稿"

## 18. 部署与冒烟

- [ ] 18.1 部署到测试环境（`bxdc-mysql` 容器 + 3 服务）
- [ ] 18.2 admin 录入示例数据（参考 `docs/external-service-skill-design.md §4.7` 4 个场景的 INSERT 例子）
- [ ] 18.3 验证 GET `/api/external-service` 列表（admin 角色）
- [ ] 18.4 验证 GET `/api/external-service/weather-openweathermap/inputs` 公开读（任何已认证用户）
- [ ] 18.5 验证创建 kind=external Skill（只填 serviceName + interfaceDescription）
- [ ] 18.6 验证 Skill 创建页自动渲染 3 个 textarea（q / units / lang）
- [ ] 18.7 验证 LLM 调用 Skill → Gateway 出站到 OpenWeatherMap → 响应回 LLM
- [ ] 18.8 验证 dynamicToken 模式（带 cacheSeconds 缓存）
- [ ] 18.9 验证 is_raw_transmission=1 字段（脚本执行 / 飞书 content）原文透传
- [ ] 18.10 验证 disabled 服务执行时返回 400

## 19. 空数据场景兜底（强约束，原有 Skill 链路零回归）

> 对应 `docs/external-service-skill-design.md §17` + `design.md 决策 10`。本节是**新功能完全 opt-in**的强保证：2 张新表为空时，原有 6 种 Skill 链路行为**完全不变**。

### 19.1 后端冷启动兜底

- [ ] 19.1.1 `ExternalServiceRegistry.loadAll()` 用 try/catch 包裹；任何 DB 异常仅 `log.warn`，**不抛、不阻塞 Spring 启动**（与 `PythonSandboxService` 启动模式一致）
- [ ] 19.1.2 `loadAll()` 失败时 map 保持空；后续 `listEnabled()` 返回 `Collections.emptyList()`（**绝不返回 null**）
- [ ] 19.1.3 5 分钟 TTL 后台线程同样包 try/catch；失败仅 warn，不影响主流程
- [ ] 19.1.4 `listEnabled()` / `listInputs()` 防御性 null check：mapper 返回 null 时转为 `Collections.emptyList()`
- [ ] 19.1.5 `assertExists(serviceName)`：服务未注册时抛 `IllegalArgumentException`（**仅**对 `kind=external` 触发），其他 kind 不受影响

### 19.2 Schema 列表加载兜底

- [ ] 19.2.1 `SystemSkillController.listExecutionTypes()` 原 4 种类型（api / ssh / template / python）逻辑**完全保留**
- [ ] 19.2.2 新增 `for (ExternalService svc : registry.listEnabled())` 循环：空集合 → 0 次循环 → 不挂任何 external 项
- [ ] 19.2.3 `registry` bean 注入加 null 防御（`if (registry != null)`），避免 bean 循环 / 未注入导致 NPE
- [ ] 19.2.4 `buildExternalConfigSchema()` 仅在循环内被调用，不影响原方法签名

### 19.3 FK 校验兜底

- [ ] 19.3.1 `SkillService.createOrUpdate()` 中 FK 校验用 `if ("external".equals(kind))` 包裹
- [ ] 19.3.2 其他 kind（api / ssh / python / template）的 `createOrUpdate()` 路径**零修改**
- [ ] 19.3.3 `IllegalArgumentException` 由 controller 兜底转 400，错误消息可读
- [ ] 19.3.4 业务方创建 `kind=external` Skill（serviceName 未注册）→ 400 "External service not found: {name}"

### 19.4 Switch 路由兜底

- [ ] 19.4.1 `SkillExecutionService.execute()` switch 原 4 个 case（api / ssh / python / template）**零修改**
- [ ] 19.4.2 新增 `case "external":` 单独 import `ExternalServiceSkillExecutor`，入口 1 行委托
- [ ] 19.4.3 `ExternalServiceSkillExecutor` 是独立 `@Service` 类，bean 不可用时**只**影响 external 调用，其他 case 不受影响
- [ ] 19.4.4 业务方调用既有 `kind=api` Skill → 走原 `executeApiSkill()` 路径，**不触发** `ExternalServiceSkillExecutor`

### 19.5 运行时子表为空兜底

- [ ] 19.5.1 `ExternalServiceSkillExecutor.executeExternalSkill()` 入口对 `inputs` / `llmParams` 加 null 防御（`Collections.emptyList()` / `Collections.emptyMap()`）
- [ ] 19.5.2 必填校验循环：空 inputs → 0 次循环 → 直接通过
- [ ] 19.5.3 出站 map 初始化：`queryMap` / `bodyMap` / `headerMap` 为空 `LinkedHashMap`
- [ ] 19.5.4 拼装循环：空 inputs → 0 次循环 → map 保持空
- [ ] 19.5.5 认证注入 `injectAuth(svc, headerMap)` **与子表无关**，按主表执行；子表为空时仍生效
- [ ] 19.5.6 出站调用：`callApi()` 即便所有 map 为空也能正常调（POST 空 body / GET 无 query 都合法）
- [ ] 19.5.7 业务方引用已注册服务但子表空 → Skill 创建成功 → LLM 调用时**正常出站**（仅认证 + 静态 URL）

### 19.6 审计脱敏兜底

- [ ] 19.6.1 `ExternalOutboundPayloadMasker.mask()` 入口对 `llmParams` / `inputs` 加 null 防御
- [ ] 19.6.2 空 inputs → 空 `sensitiveKeys` → 0 次替换 → 所有 llmParams 原样保留
- [ ] 19.6.3 额外 LLM key（子表没这行）也保留（按 spec §Audit log masking）

### 19.7 公开读接口兜底

- [ ] 19.7.1 `GET /api/external-service/{name}/inputs`：服务不存在 → 404（`IllegalArgumentException` → 404）
- [ ] 19.7.2 服务存在但子表空 → 返回 `[]`（不返回 null / 不返回 404）
- [ ] 19.7.3 未认证用户 → 401（沿用现有安全过滤器）

### 19.8 前端兜底

- [ ] 19.8.1 `skillEditor.ts`：`ConfigKind` union 加 `'external'`；`CONFIG_KIND_LABELS.external = '外部 HTTP 服务'` 即便注册表为空也保留 label
- [ ] 19.8.2 `SkillManagementModal.vue`：`externalOptions = ref([])` / `subTablePreview = ref([])` 初始为空数组（**不是 null**）
- [ ] 19.8.3 `serviceName` select：`:disabled="!externalOptions.length"`，空集合时禁用 + 显示「无选项」
- [ ] 19.8.4 子表预览区：`v-if="subTablePreview.length"`，空集合时**不渲染**
- [ ] 19.8.5 `serviceName` change watch：拉子表失败时 `subTablePreview.value = []`，**不阻塞** Skill 编辑
- [ ] 19.8.6 业务方选 `kind=api` / `kind=python` 时**完全不走** external 分支
- [ ] 19.8.7 `vue-tsc -b` 静默通过（零 TS6133）

### 19.9 空数据自检 checklist（实施后必跑）

- [ ] 19.9.1 新部署（2 张表不存在）：`SchemaMigrationRunner` 自动建表成功
- [ ] 19.9.2 空表启动：日志输出「Loaded 0 services」，无 NPE / 无 stacktrace
- [ ] 19.9.3 `GET /api/external-service` 返回 `[]`（admin 角色）
- [ ] 19.9.4 `GET /api/external-service/nonexistent/inputs` 返回 404
- [ ] 19.9.5 `GET /api/external-service/weather-openweathermap/inputs`（子表空）返回 `[]`
- [ ] 19.9.6 业务方创建 `kind=api` Skill：成功，原链路不变（数据库插入正常，listExecutionTypes 不变）
- [ ] 19.9.7 业务方创建 `kind=external` Skill（serviceName 未注册）：400 "External service not found"
- [ ] 19.9.8 业务方创建 `kind=external` Skill（serviceName 已注册但子表空）：成功，运行时正常出站
- [ ] 19.9.9 LLM 调用 `kind=external` Skill（子表空）：出站 HTTP 调用成功（仅认证 + 静态 URL，无 query/body/header 参数）
- [ ] 19.9.10 业务方打开 Skill 创建页：UI 不显示 external 选项（注册表为空时）
- [ ] 19.9.11 `vue-tsc -b` 静默通过（零 TS6133）
- [ ] 19.9.12 `npm run build` 退出码 0
- [ ] 19.9.13 `mvn -DskipTests compile` 通过（JDK 1.8）

## 20. 参数名一致性硬约束（强约束，admin 配置责任）

> 对应 `docs/external-service-skill-design.md §17.6` + 新增 spec Requirement。子表 `external_param_name` **必须**与第三方 API 文档声明的参数名**字符级完全一致**（含大小写、下划线、连字符）。Gateway **不做任何重命名 / 映射 / 翻译**——LLM 工具 schema property key = 子表 `external_param_name` = 第三方 API 出站 key，三者**严格相同**。

### 20.1 Executor 透传（绝不重命名）

- [ ] 20.1.1 `ExternalServiceSkillExecutor` 出站 key 直接读 `inp.getExternalParamName()`，**不做任何转换**
- [ ] 20.1.2 query 拼装：`queryMap.put(inp.getExternalParamName(), value)`（key 原样）
- [ ] 20.1.3 body 拼装：`bodyMap.put(inp.getExternalParamName(), value)`（key 原样，Jackson 序列化也保留原 key）
- [ ] 20.1.4 header 拼装：`headerMap.put(inp.getExternalParamName(), value)`（key 原样，大小写保留）
- [ ] 20.1.5 path 替换：`endpoint_url.replace("{" + inp.getExternalParamName() + "}", value)`（key 原样）
- [ ] 20.1.6 代码 Review checklist：所有 outbound key 必须是 `external_param_name`，无 `toLowerCase` / `toCamelCase` / `replace("_", "")` 等转换

### 20.2 无 mapsTo 机制

- [ ] 20.2.1 `JsonSchemaValidator` 校验 `kind=external` skill configuration 时**拒绝**任何 `mapsTo` 字段（与 `inputs[]` / `operation` 同样拒绝）
- [ ] 20.2.2 `ExternalConfigDraft` / `parseExternalDraft` / `serializeExternalDraft` 不导出 `mapsTo` 相关字段
- [ ] 20.2.3 前端 Skill 创建页**不渲染**任何 mapsTo 输入控件

### 20.3 admin UI / SQL 配置检查

- [ ] 20.3.1 admin UI `external_param_name` 字段 label 明确写「此字段必须与第三方 API 文档里的入参名完全一致」
- [ ] 20.3.2 admin UI 字段 helper text 提示「参考 [第三方 API 文档链接]，例如 OpenWeatherMap 文档中城市名参数名为 `q`」
- [ ] 20.3.3 SQL 录入注释：每个 INSERT 语句附「`external_param_name` 必须与第三方 API 文档声明的参数名字符级完全一致」备注
- [ ] 20.3.4 提供 SQL 自检脚本（`SELECT service_id, external_param_name FROM external_service_input WHERE service_id = ?`），admin 可对照文档检查

### 20.4 LLM 工具 schema 一致性

- [ ] 20.4.1 `SystemSkillController.buildExternalConfigSchema()`：Zod schema property key = `external_param_name`（字符级一致）
- [ ] 20.4.2 agent-core 透传后，LLM 看到 tool schema property 名为 `q` / `units` / `lang`（与子表字段完全一致）
- [ ] 20.4.3 LLM 调用时 payload key 必须与子表字段一致；若不一致 → Gateway 不出站（无子表行） + audit 标记「LLM 误传」

### 20.5 配错行为

- [ ] 20.5.1 admin 配错 `external_param_name`（与第三方 API 文档不一致）→ Gateway **不做客户端侧自动修正**
- [ ] 20.5.2 出站 key 与第三方期望不符 → 第三方返回 4xx
- [ ] 20.5.3 Gateway 把第三方 4xx 响应**透传**给 LLM（不掩盖、不重试猜测）
- [ ] 20.5.4 audit log 记录**实际**出站 key（用于 admin 排查）
- [ ] 20.5.5 admin 修正子表（无需改 Skill，无需改 Gateway 代码）→ 下次调用即生效（最长 5 分钟缓存过期）

### 20.6 参数名一致性自检 checklist

- [ ] 20.6.1 weather service 子表 `external_param_name = q / units / lang`（与 OpenWeatherMap 文档一致），**不能**填 `query` / `cityName`
- [ ] 20.6.2 stock service 子表 `external_param_name = list`（与新浪 API 一致），**不能**填 `code` / `stockList`
- [ ] 20.6.3 python service 子表 `external_param_name = code / args / timeout`（与沙箱协议一致）
- [ ] 20.6.4 feishu service 子表 `external_param_name = msg_type / content / chat_id`（与飞书 webhook 一致）
- [ ] 20.6.5 LLM 工具 schema property key 与子表 `external_param_name` **字符级完全一致**
- [ ] 20.6.6 出站 HTTP query/body/header key 与子表 `external_param_name` **字符级完全一致**
- [ ] 20.6.7 抓出站包（Charles / Wireshark / `api_call_log`）人工 spot check，确认 key 与第三方 API 文档严格匹配
- [ ] 20.6.8 配错时（admin 用错名字）→ 第三方返回 4xx → Gateway 透传错误给 LLM → admin 修正子表
- [ ] 20.6.9 大小写敏感：`Content-Type` ≠ `content-type` ≠ `Content-type`
- [ ] 20.6.10 snake_case 保留：`user_id` ≠ `userId` ≠ `user-id`
- [ ] 20.6.11 数字 / 特殊字符保留：`q1` / `param-2` / `data.field` 按原样透传
